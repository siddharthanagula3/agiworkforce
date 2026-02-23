# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Knowledge & Documentation

Training data has a ~6 month lag. For anything version-sensitive, always fetch live docs before writing code.

**Always fetch live docs for:**

- Any library/framework version, API shape, or config option
- Any CLI tool flags or sub-commands
- Any cloud provider SDK/API (AWS, GCP, Azure, Vercel, Supabase, etc.)
- Any AI/LLM provider API (Anthropic, OpenAI, Google, etc.)
- Anything described as "new" or "just released"

**How to fetch:** Use `WebSearch` to find the canonical doc URL, then `WebFetch` to read it. Check pinned versions in `package.json`, `Cargo.toml`, `requirements.txt` against current docs before writing code.

## Project Overview

AGI Workforce is a monorepo containing a desktop automation application (Tauri + React + Rust), a web frontend (Next.js), browser extension, and backend services. Uses pnpm workspaces.

## Common Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev:desktop          # Run desktop app in dev mode (runs tauri dev)
pnpm dev:docs            # Run documentation site

# Building
pnpm build               # Build all packages (excludes desktop)
pnpm build:all          # Build web and packages
pnpm build:desktop      # Build desktop app (includes Tauri build)
pnpm build:web          # Build web app only

# Testing
pnpm test                # Run all tests (vitest run across all packages)
pnpm test -r            # Run tests recursively across packages
pnpm test:e2e           # Run Playwright e2e tests
pnpm test:ui            # Run tests with UI (vitest --ui)

# Run a single test file
cd apps/desktop && pnpm test src/__tests__/scheduler.test.ts

# Run tests with coverage
cd apps/desktop && pnpm test:coverage

# Linting & Formatting
pnpm lint                # Run ESLint (max 15 warnings, ignores extension/)
pnpm lint:fix           # Fix lint issues
pnpm format             # Format with Prettier
pnpm format:check       # Check formatting

# Type Checking
pnpm typecheck          # Type check desktop app
pnpm typecheck:all      # Type check all packages
```

## Architecture

### Apps

- **desktop** (`apps/desktop`): Tauri 2.x desktop app with React 19, Vite 7, and Rust backend. Main user-facing product.
- **web** (`apps/web`): Next.js 16 web application (App Router). Authentication via Supabase, Stripe payments, Upstash Redis rate limiting.
- **extension** (`apps/extension`): Browser extension (not fully built out).

### Packages

- **types** (`packages/types`): Shared TypeScript type definitions
- **utils** (`packages/utils`): Shared utility functions

### Services

- **api-gateway** (`services/api-gateway`): Node.js/TypeScript API gateway
- **signaling-server** (`services/signaling-server`): WebRTC signaling server

## Desktop App Architecture

### Frontend → Backend Communication (IPC)

All Tauri commands are called via `invoke()` from `src/lib/tauri-mock.ts`. This wrapper:

- In Tauri: delegates to `@tauri-apps/api/core`'s `invoke`
- In tests: returns mock data without crashing
- In web (non-Tauri): throws an error pointing users to download the desktop app

Always import `invoke` and `isTauri` from `../lib/tauri-mock` (not directly from tauri), and check `isTauri` before calling Tauri-specific features. The `listen` function for events follows the same pattern.

### Frontend State Management

State uses Zustand stores organized into two layers:

**Core chat stores** (`src/stores/chat/`):

- `chatStore.ts` — conversations, messages, citations, token usage
- `agentStore.ts` — agent status, background tasks, action trail
- `toolStore.ts` — tool executions, file ops, terminal commands, approvals
- `types.ts` — shared TypeScript types

**`unifiedChatStore.ts`** — deprecated shim that re-exports from the modular stores above for backward compatibility. New code should use modular stores directly.

Other stores in `src/stores/` cover: auth, billing, filesystem, MCP, memory, models, research, scheduler, settings, teams, terminal, and more.

### Frontend Event System

`src/hooks/useAgenticEvents.ts` — central hook that subscribes to all Tauri backend events (agent status, tool executions, approvals, MCP events, file operations, terminal commands, screenshots, artifacts). Components use this hook to receive real-time updates from the Rust backend.

### Rust Backend Module Structure (`src-tauri/src/`)

```
lib.rs              # App entry point, state initialization, command registration
core/
  agent/            # AI agent runtime: planner.rs, executor.rs, autonomous.rs,
                    # ai_orchestrator.rs, background_agent.rs, context_manager.rs, undo_manager.rs
  llm/              # LLM routing layer: llm_router.rs, provider_adapter.rs,
                    # sse_parser.rs, token_counter.rs, cost_calculator.rs, cache_manager.rs
  llm/providers/    # Provider implementations: managed_cloud_provider.rs, ollama.rs, http_client.rs
  mcp/              # Model Context Protocol: client.rs, manager.rs, registry.rs,
                    # protocol.rs, extensions.rs, health.rs, transport.rs
  orchestration/    # Workflow engine: workflow_engine.rs, workflow_executor.rs, workflow_scheduler.rs
  agi/              # Higher-level AGI logic: orchestrator.rs, checkpoint_manager.rs,
                    # memory_manager.rs, executors/ (15 domain executors: file, git, browser,
                    # terminal, media, code, api, calendar, cloud, db, email, llm, mcp, ocr, etc.)
  swarm/            # Multi-agent swarm: agent_spawner.rs, orchestrator.rs,
                    # task_decomposer.rs, result_aggregator.rs
  embeddings/       # Vector embeddings and semantic search
  research/         # Research orchestration
features/           # Domain features: terminal, calendar, communications, speech,
                    # clipboard, search, tasks, teams, workflows, webhooks, projects
sys/
  commands/         # All Tauri command handlers (one file per domain, ~60+ files)
  security/         # Auth, master password (Argon2id), secret management
  billing/          # Stripe billing state
  telemetry/        # Telemetry
automation/         # Desktop automation: input/, screen/, computer_use/, browser/,
                    # vision_planner.rs, recorder.rs, safety.rs
data/
  db/               # SQLite via rusqlite: models, repository pattern, migrations
  settings/         # Settings persistence
  state/            # App state
integrations/       # External integrations
ui/                 # Window management, system tray
```

### LLM Routing Architecture

The `LLMRouter` (`core/llm/llm_router.rs`) handles:

- Exponential backoff retry with configurable `RetryConfig` (3 retries, 500ms initial, 2x multiplier)
- Fallback chain across providers when retries fail
- Cost tracking via `CostCalculator` and `TokenCounter`
- SSE streaming via `sse_parser.rs`
- Prompt caching for Anthropic/OpenAI

Provider implementations: `ManagedCloudProvider` handles Anthropic, OpenAI, Google, xAI, DeepSeek, and others. `OllamaProvider` handles local models.

**Adding a new model:** Update `MODEL_METADATA` in `apps/desktop/src/constants/llm.ts`, add to `MODEL_POOLS` in `src/lib/modelRouter.ts`, and update the Rust provider adapter if needed.

### Agent Execution Architecture

1. `TaskPlanner` — LLM-powered task decomposition into `TaskStep[]`
2. `TaskExecutor` — executes individual steps with timeout handling
3. `AutonomousAgent` — orchestrates planner + executor with self-healing (up to 3 retries), approval gating, and task queue management
4. `ApprovalController` — manages user approval for risky actions (tool safety tiers: Safe, RequiresNotification, RequiresConfirmation, RequiresExplicitApproval)
5. `VisionAutomation` — screenshot-based visual verification

### Security Architecture

- **Master password**: Argon2id (OWASP params) for key derivation, stored verifier (not password) in SQLite
- **Key derivation**: Combines password-derived key + machine ID via HKDF-SHA256 with purpose-specific salts
- **Secret management**: `SecretManager` + `AuthManager` in `sys/security/`
- Migration support for existing installations upgrading to master-password-based encryption

### Local Database

SQLite via `rusqlite` at `src-tauri/src/data/db/`. Schema managed by SQL migrations in `src-tauri/migrations/`. Repository pattern with typed models in `data/db/models.rs` and query functions in `data/db/repository.rs`. Database struct wraps `Arc<Mutex<Connection>>`.

## Database

Supabase (PostgreSQL) for the web app with migrations in `apps/web/supabase/migrations/`. The desktop app uses a local SQLite database separately.

## Tech Stack

- **Frontend**: React 19, Next.js 16, Tailwind CSS 4, Radix UI, Zustand, Monaco Editor, xterm.js
- **Desktop**: Tauri 2.x, Vite 7, Rust (edition 2021)
- **Backend**: Rust (Tauri commands), Node.js services
- **Database**: PostgreSQL (Supabase for web), SQLite (local desktop), MongoDB, Redis
- **Testing**: Vitest, Playwright, MSW (Mock Service Worker), `@testing-library/jest-dom`

## Commit Convention

Commits use conventional commits format (enforced by commitlint + husky pre-commit hooks):

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Lint Constraints

ESLint runs with `--max-warnings=15` at the monorepo root. The `apps/extension/` directory is excluded from linting. Rust uses `deny(unused)`, `deny(dead_code)` — all unused code is a compile error.
