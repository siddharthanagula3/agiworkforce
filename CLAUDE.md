# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

AGI Workforce is a Tauri v2 desktop application (Rust backend + React/TypeScript frontend) — an open, model-agnostic AI desktop platform. Users can connect any LLM (cloud or local), use MCP tools, manage agents, and run autonomous workflows. A companion Next.js web app handles marketing, auth, and billing.

## Competitive Positioning

**Goal**: Beat Claude Desktop, ChatGPT, Gemini. **Six unique differentiators** (Feb 2026 analysis):

1. **Local Desktop Control + Multi-Model + Native GUI** (trifecta)
   - Only tool combining native Tauri desktop app + 9+ model providers + screen/keyboard/app automation
   - Claude Code has local control but no GUI, is Claude-only. Cursor has GUI + multi-model but zero desktop control.

2. **Mobile Companion with Live Agent Dashboard**
   - Dedicated iOS/Android app with QR-pair desktop link, real-time agent oversight, approve/deny per tool call
   - Zero competitors offer this. Claude's "Remote Control" restricted to Max tier ($100-200/mo).

3. **140+ Non-Coding AI Skills** (healthcare, legal, finance, education, creative, trades, e-commerce)
   - Every competitor is code-focused (Claude Code, Cursor, GitHub Copilot). AGI Workforce is general-purpose AI workforce.

4. **Full BYOK + Local LLMs + Native GUI**
   - Only tool combining polished desktop app + bring-your-own-keys for all providers + Ollama/LM Studio support
   - Users own API relationships, run fully offline with local models. Aider has BYOK but CLI-only.

5. **Proprietary Desktop-Native Agent Platform**
   - Closed-source, proprietary codebase. Competitors (Claude Desktop, Cursor, Windsurf, Devin) also proprietary. Enterprise-grade security, IP protection, commercial SaaS model.

6. **MCP Without Artificial Limits**
   - Unlimited MCP tools (stdio + SSE + HTTP) inside native desktop app. Cursor caps at 40 tools.

**Architecture inspired by**: Claude Code (skills system, hooks, agents). **Feature roadmap inspired by**: Perplexity Computer (connector ecosystem, multi-model orchestration).

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

## Prerequisites

- Node 22, pnpm >= 9.15.0
- Rust toolchain (for Tauri desktop app)
- `libclang` for SQLCipher: `brew install llvm` on macOS

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Desktop app development (starts Vite frontend + Rust backend)
cd apps/desktop && pnpm dev          # alias: pnpm tauri dev
cd apps/desktop && pnpm dev:vite     # frontend-only dev (no Rust rebuild)

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

# Cleanup
pnpm clean                           # remove all dist + node_modules
pnpm clean:build                     # remove dist only

# Tests (only run when explicitly asked)
cd apps/desktop && pnpm test                                  # Vitest unit tests
cd apps/desktop && pnpm test src/__tests__/foo.test.ts        # Run a single test file
cd apps/desktop && pnpm test:coverage                         # With coverage report
cd apps/desktop && pnpm test:e2e                              # Playwright E2E
cd apps/web && pnpm test                                      # Web app tests
cd services/api-gateway && pnpm test                          # API tests
cargo test                                                    # Rust unit tests (from repo root)
cargo test -p agiworkforce-desktop -- module::test_name       # Run a single Rust test
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
  - `commands/` — All `#[tauri::command]` handlers (125+ files), invoked from frontend via `invoke()`
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

- **`components/`** — 75+ component directories (Agent, Chat, Settings, Voice, Vision, Terminal, etc.)
  - `UnifiedAgenticChat/` — Agentic chat UI: `ToolLabel.tsx` (tool execution status), `ToolTimeline.tsx` (collapsible tool timeline)
- **`lib/chatToolUtils.ts`** — Pure utility functions for tool name normalization and inline data transformations (extracted from UnifiedAgenticChat)
- **`stores/`** — 55+ Zustand stores with Immer and Persist middleware. Key stores:
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

**Tauri Event Channels** (Rust → frontend):

- `tool:event` — ToolEvent (Started/Progress/Completed) with metadata (tool_name, display_name, display_args, duration_ms, result_preview). Display names map to Claude Code-style labels: `Read(path)`, `Write(path)`, `Bash(cmd)`, etc. Frontend: `chat/toolStore.ts` → `ToolLabel.tsx` + `ToolTimeline.tsx`.
- `agentic:loop-started` / `agentic:loop-status` / `agentic:loop-ended` / `agentic:message-consumed` — Agentic loop lifecycle events

### Web App (`apps/web/`)

Next.js 16 with App Router. Routes: `/login`, `/signup`, `/dashboard`, `/pricing`, `/chat`, `/docs`, `/download`, `/features/agents`, `/features/ai-skills`, `/features/plugins`, `/features/tools`, etc. Uses Supabase for auth (SSR via `@supabase/ssr`), Stripe for billing, Upstash Redis for rate limiting.

**Key API Routes**:

- `app/api/completion/route.ts` — Ghost-text prompt completion API (used by `useApiPromptCompletion` hook)
- `app/api/chat/` — Chat message and conversation endpoints
- `app/api/autotag/`, `app/api/voice/`, `app/api/media/` — Feature-specific routes

**Data Layer**:

- `supabase/migrations/` — VIBE sessions/messages tables with RLS policies, indexes, and triggers
- `constants/models.json` (2571 lines) — Structured model catalog with provider configs, pricing, task routing; companion to `src/constants/llm.ts`

### Shared Packages

- `packages/types/` — TypeScript types shared between desktop, web, and services
- `packages/utils/` — Utility functions shared across apps

## Key Technical Details

- **LLM Routing**: `core/llm/llm_router.rs` handles all model routing. `provider_adapter.rs` maps provider-specific API formats. Model catalogs: desktop in `src/constants/llm.ts`, web in `constants/models.json`, and Rust in `provider_adapter.rs` — these must stay in sync.
- **Streaming**: SSE parsing via `sse_parser.rs`. Uses dual HTTP clients (one with streaming timeout disabled).
- **Local LLM Capability Detection** (core/llm/capability_detection.rs): Ollama probing via `/api/show`; detects tool support, caches results per session. Prevents tool injection on non-tool-capable models.
- **State Management Pattern** (lib.rs): Uses degraded state constructors for optional features — `MemoryState::degraded()`, `MasterPasswordState::degraded()`, etc. Allows graceful fallback if initialization fails.
- **Security**: ToolGuard validates all tool execution. SecretManager encrypts API keys via Argon2id + AES-GCM, stored in SQLite/keychain. Never plaintext. Deep linking secured via ALLOWED_DEEP_LINK_PARAMS allowlist, scheme validation, and token redaction in `apps/web/hooks/useDeepLink.ts`.
- **MCP**: Supports stdio, SSE, and streamable HTTP transports. Config in `.mcp.json`.
- **Frontend state**: Zustand v5 + Immer + Persist. Settings persist to localStorage with migration support. Environment: Critical: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`. Warning-level: `TOTP_ENCRYPTION_KEY`, `NEXT_PUBLIC_API_URL`, `CSRF_SECRET`, `CRON_SECRET`, `UPSTASH_REDIS_*`, `DEVICE_TOKEN_ENCRYPTION_KEY`. Plus 8 `STRIPE_PRICE_*` IDs. See `lib/validate-env.ts` for full list.
- **UI stack**: Radix UI primitives + Tailwind CSS 4 + Lucide icons + Sonner toasts.
- **Rust features**: `default = ["shell", "updater"]`. Optional: `ocr`, `local-llm`, `vad`, `local-whisper`, `remote-databases`, `devtools`.
- **Embeddings**: `HttpSummaryLLM` in `core/agi/conversation_summarizer.rs` provides real embeddings via 3-tier fallback: Ollama local (nomic-embed-text, 768-dim) → OpenAI cloud (text-embedding-3-small, 1536-dim) → None. Never returns zero vectors. Memory search degrades gracefully to FTS-only when embeddings unavailable.
- **Model ID Normalization**: `normalize_model_id()` in `llm_router.rs` normalizes dot/hyphen formats at router entry for routing only — original IDs preserved for API payloads. Uses `models.json` canonicalization maps as single source of truth.
- **Agent Navigate**: `Action::Navigate` in `core/agent/executor.rs` uses PlaywrightBridge (CDP) when available, with OS-level `open` as fallback.
- **IPC Rule**: All `invoke()` calls in TypeScript MUST use camelCase param keys (see `.claude/rules/tauri-ipc.md`). Tauri auto-converts from Rust snake_case. Snake_case in invoke() silently fails.
- **Rust lint strictness**: Cargo.toml denies `unsafe_code`, `dead_code`, `unused_imports`, `unused_variables`, `unused_mut`. All warnings are errors. `clippy::await_holding_lock` is allowed.

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

## Workflow Orchestration

The development workflow prioritizes planning, verification, and autonomous execution.

### 1. Plan Mode Default

Always enter plan mode before implementation:

- Read requirements/spec carefully
- Check for existing patterns in codebase
- Design the approach (identify files, data flow, edge cases)
- Get user approval before coding

Plan mode prevents wasted work on incorrect approaches.

### 2. Subagent Strategy

Dispatch fresh specialized subagents for each independent task:

- One subagent per task (no context pollution)
- Subagent asks clarifying questions **before** starting work
- Never inherit session history — provide exactly what's needed
- Two-stage review: spec compliance first, then code quality

This isolation ensures high-quality, focused work on complex problems.

### 3. Self-Improvement Loop

After completing work, capture learnings:

- Extract reusable patterns from the session
- Identify repeated mistakes
- Document decision-making that succeeded
- Store patterns for future reference

Learnings compound — each session makes the next one faster and better.

### 4. Verification Before Done

Never claim work is complete without verification:

- Tests must run (not just be written)
- Builds must compile
- Type checking must pass
- All assertions must pass on first run
- Accessibility/security checks completed

Verification catches 80% of issues before they reach users.

### 5. Demand Elegance

Code quality matters as much as functionality:

- Eliminate tautological assertions (no `|| true` fallbacks)
- Remove dead code and unreachable branches
- Extract magic numbers to constants
- Keep functions under 50 lines
- Keep files under 800 lines

Elegant code is easier to debug, refactor, and scale.

### 6. Autonomous Bug Fixing

When tests fail, fix the code immediately:

- Don't skip failing tests or mark as flaky
- Diagnose root cause
- Implement fix
- Verify tests pass
- Document the issue

Self-healing prevents technical debt from accumulating.

## Task Management

### 1. Plan First

Before any implementation:

- Write a detailed plan with file structure
- Identify all files that will be created/modified
- Break work into bite-sized tasks (2-5 minutes each)
- Define success criteria for each task
- Get approval before starting

Clear planning prevents rework and clarifies requirements early.

### 2. Verify Plan

After writing the plan but before executing:

- Review plan for logical completeness
- Check for missing edge cases
- Verify file boundaries (one responsibility per file)
- Ensure tasks are ordered correctly
- Validate against requirements

Plan review catches gaps early when they're cheap to fix.

### 3. Track Progress

During implementation:

- Use TodoWrite for multi-step tasks
- Mark each step as in_progress, then completed
- Note blockers or questions immediately
- Update human if plan needs adjustment
- Don't skip steps just because they seem simple

Progress tracking prevents burnout and reveals hidden issues.

### 4. Explain Changes

After each task completion:

- Document why changes were made (not just what)
- Note any trade-offs chosen
- List assumptions made
- Mention any related issues discovered
- Cross-reference related files

Explanations make code understandable for future maintainers.

### 5. Document Results

After all tasks complete:

- Update CLAUDE.md if patterns changed
- Add examples for new patterns
- Update type definitions if interfaces changed
- Add tests if test infrastructure evolved
- Commit documentation alongside code

Documentation decays if not kept current with code.

### 6. Capture Lessons

At end of session:

- What worked well in this session?
- What could be faster next time?
- What patterns emerged?
- Were there repeated mistakes to avoid?
- Store in memory for future reference

Explicit lesson capture turns experience into reusable patterns.

## Core Principles

### Simplicity First

The simplest solution that works is the best solution:

- Don't over-engineer
- Don't add features that aren't needed
- Don't abstract before seeing the pattern
- One obvious way is better than multiple clever ways
- YAGNI ruthlessly — You Aren't Gonna Need It

Simple code is faster to write, easier to debug, and simpler to maintain.

### No Laziness

Cut corners that will haunt you later:

- Don't skip test coverage to "ship faster"
- Don't ignore compiler warnings
- Don't use TODO comments as permanent placeholders
- Don't assume "it works in my environment"
- Don't rely on manual verification

Laziness now means doubled effort later.

### Minimal Impact

Keep changes focused and scoped:

- One feature per commit
- One responsibility per function
- One responsibility per file
- Don't refactor unrelated code while fixing a bug
- Don't add new features while fixing issues

Minimal changes are easier to review, test, and revert if needed.

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
