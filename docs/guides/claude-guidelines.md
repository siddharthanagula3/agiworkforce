# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical External API References

> **IMPORTANT:** Always consult these local documentation files for current API information. **DO NOT rely on training data** - external APIs evolve constantly and training knowledge becomes stale. These files are maintained with the latest specs.

| Document                                      | Purpose                                                         | When to Consult                              |
| --------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| `docs/llm-provider-reference.md`              | Model IDs, versions, pricing for all 11 LLM providers           | Any LLM integration work, model ID mapping   |
| `docs/google-provider-reference.md`           | Google Gemini 3 API: thinking levels, grounding, code execution | Google AI features, Vertex AI integration    |
| `docs/llm-streaming-api.md`                   | SSE streaming protocol, chunk formats                           | Streaming implementations, response handling |
| `docs/model-routing-guide.md`                 | Model routing logic, fallback chains                            | Intelligent routing, load balancing          |
| `docs/features/stripe-integration.md`         | Webhooks, price ID mapping, PCI compliance                      | Payment processing, subscription logic       |
| `docs/features/mcp.md`                        | MCP protocol specs, tool ID format                              | MCP server integration, tool discovery       |
| `docs/features/mcp/mcp-server-development.md` | Creating custom MCP servers                                     | Building new tool integrations               |
| `docs/api/rate-limits.md`                     | API rate limiting by endpoint and tier                          | Rate limit implementation, quota management  |

### API-Specific Instructions

**LLM Model Versioning Policy:**

- **Always use the LATEST version within each model family.** When a new version releases, update immediately.
- **Different model tiers are different families** - keep all tiers but only latest version of each:
  - ✅ Keep: `claude-opus-4.5`, `claude-sonnet-4.5`, `claude-haiku-4.5` (different tiers)
  - ✅ Keep: `gpt-5.2`, `gpt-5-nano` (flagship vs budget tier)
  - ❌ Remove: `claude-sonnet-4.0` when `claude-sonnet-4.5` releases (same tier, older version)
- **Newer models are often CHEAPER** - providers reduce prices with new releases (e.g., Opus 4.5 significantly cheaper than Opus 4.1)
- Model IDs change frequently. Always read `docs/llm-provider-reference.md` before implementing.
- Update `apps/web/lib/llm-providers/factory.ts` MODEL_ID_TO_API_ID mapping when adding/changing models.

**Stripe Integration:**

- Price IDs and webhook event types are documented in `docs/features/stripe-integration.md`.
- Never use substring matching for price IDs - use strict `PRICE_ID_TO_TIER` mapping.

**MCP Protocol:**

- Tool ID format is `mcp__{server_name}__{tool_name}` (exactly two underscores).
- Server configurations and OAuth flows documented in `docs/features/mcp/`.

### Context7 MCP Tool - Library Documentation

**ALWAYS use Context7 for up-to-date library/framework documentation.** LLM training data becomes stale - Context7 fetches the LATEST official docs in real-time.

> Context7 solves the problem of LLMs generating broken code from outdated versions or hallucinating APIs that never existed. It's free, maintained by Upstash, and supports thousands of libraries.

**When to use Context7:**

- Implementing features with ANY external library (React, Next.js, Tauri, Supabase, Stripe, etc.)
- Checking new API features (e.g., "How does the new Next.js `after()` function work?")
- Finding current code examples and best practices
- Verifying method signatures and parameters before using them
- Any library/framework integration - **use Context7 by default**

**How to use:**

1. Call `mcp__context7__resolve-library-id` with the library name to get the Context7 library ID
2. Call `mcp__context7__query-docs` with the library ID and your specific question

**Example:**

```
// Find Supabase auth documentation
1. resolve-library-id: { libraryName: "supabase", query: "authentication with JWT" }
2. query-docs: { libraryId: "/supabase/supabase", query: "How to implement JWT authentication" }

// Check React Query invalidation
1. resolve-library-id: { libraryName: "react-query", query: "invalidate query" }
2. query-docs: { libraryId: "/tanstack/query", query: "How do I invalidate a query?" }
```

**Commonly used libraries in this project:**

- **Frontend:** React, Next.js, TailwindCSS, Radix UI, Zustand, React Query
- **Backend:** Tauri, Supabase, Prisma, Drizzle, tRPC, Zod
- **Payments:** Stripe SDK
- **Auth:** NextAuth, Supabase Auth

---

## Project Overview

AGI Workforce is a full-stack monorepo for an AI automation platform:

- **Desktop:** Tauri 2.9 (Rust backend + React 19 frontend) with local SQLite database
- **Web:** Next.js 16 with React 19 and Supabase backend
- **Services:** Node.js/Express API Gateway (port 3000) and WebSocket Signaling Server (port 4000)
- **Shared:** TypeScript types and utilities via pnpm workspaces

## Product Vision

> **"AGI Workforce is a desktop app where non-technical users simply tell an AI what they want done, and it autonomously completes the task - with everything reversible if something goes wrong."**

### Core Principles

| Principle       | Decision            | Implication                                                         |
| --------------- | ------------------- | ------------------------------------------------------------------- |
| **Target User** | Non-technical users | UX must be dead simple. No jargon. Error messages in plain English. |
| **Interaction** | Chat-first          | Users describe what they want in natural language.                  |
| **Autonomy**    | Full autonomy       | AI completes goals without approval at each step.                   |
| **Safety**      | Undo-based          | All actions must be reversible.                                     |
| **Platform**    | Desktop-primary     | Web is for billing and sync only.                                   |
| **LLM Access**  | Managed proxy       | AGI Workforce proxies all LLM API calls.                            |
| **MCP**         | Hidden complexity   | Users never see "MCP" - they just say what they want.               |

### Development Guidelines

1. **Simplicity is paramount** - Every feature should be usable by someone who has never seen a terminal
2. **Undo system is critical** - Before implementing any action, ensure it can be reversed
3. **Chat is the interface** - If you're tempted to add a button, ask "could the user just ask for this in chat?"
4. **Errors must be friendly** - Never show stack traces or technical codes to users
5. **MCP is invisible** - User-facing errors should never mention "MCP" - translate to plain English

---

## Essential Commands

### Development

```bash
pnpm dev:desktop                                    # Start desktop app (hot-reload at localhost:5173)
cd apps/web && pnpm dev                             # Start web app (localhost:3001)
pnpm --filter @agiworkforce/api-gateway dev         # Start API Gateway (port 3000)
pnpm --filter @agiworkforce/signaling-server dev    # Start WebSocket server (port 4000)
pnpm install                                        # Install all dependencies
pnpm typecheck:all                                  # Type check all packages
```

### Code Quality

```bash
pnpm lint                                           # Lint all (max 15 warnings in CI)
pnpm lint:fix                                       # Fix lint issues
pnpm format                                         # Format with Prettier
cd apps/desktop/src-tauri && cargo fmt && cargo clippy  # Rust formatting/linting
```

### Testing

```bash
pnpm test                                           # Run all tests
pnpm --filter @agiworkforce/desktop test            # Desktop tests
pnpm --filter web test                              # Web tests
cd apps/desktop/src-tauri && cargo test             # Rust tests

# E2E tests (requires: cd apps/desktop && pnpm build && pnpm preview)
pnpm --filter @agiworkforce/desktop test:e2e
```

> **IMPORTANT: Always test with production/Vercel environment, not local.**
> When testing desktop app features (especially LLM chat, billing, and authentication), use the production API endpoint (`https://api.agiworkforce.com`) configured in `apps/desktop/.env.local`. Do NOT run a local web server for testing - use the deployed Vercel environment to catch real-world issues.

### Building

```bash
pnpm build:desktop                                  # Build desktop (DMG/EXE/AppImage)
pnpm build                                          # Build all packages
```

### Cleanup

```bash
pnpm clean                                          # Remove all node_modules and dist
rm -rf ~/.config/agiworkforce/agiworkforce.db       # Reset SQLite database
cd apps/desktop/src-tauri && cargo clean            # Clean Rust artifacts
```

---

## Architecture

### Monorepo Structure

```
agiworkforce/
├── apps/
│   ├── desktop/                 # Tauri app (main application)
│   │   ├── src/                 # React frontend
│   │   │   ├── components/      # Feature-organized components
│   │   │   │   └── UnifiedAgenticChat/  # Main chat interface
│   │   │   ├── stores/          # Zustand state management
│   │   │   └── api/             # Tauri command wrappers
│   │   ├── src-tauri/           # Rust backend
│   │   │   └── src/
│   │   │       ├── sys/         # System commands, security, billing
│   │   │       ├── core/        # Business logic (see below)
│   │   │       ├── data/        # Data access layer, cache, settings
│   │   │       ├── automation/  # Browser & screen automation
│   │   │       ├── features/    # Feature modules (terminal, workflows)
│   │   │       ├── integrations/# Third-party APIs, realtime sync
│   │   │       └── ui/          # Tray and window management
│   │   └── e2e/                 # Playwright E2E tests
│   ├── web/                     # Next.js SaaS platform
│   │   ├── app/api/             # API routes (webhooks, checkout, LLM proxy)
│   │   ├── lib/services/        # Business logic
│   │   └── supabase/            # Database migrations
│   └── extension/               # Browser extension (Chrome Manifest V3)
├── services/
│   ├── api-gateway/             # Express.js REST API (port 3000)
│   └── signaling-server/        # WebSocket sync (port 4000)
└── packages/
    ├── types/                   # Shared TypeScript types
    └── utils/                   # Shared utilities
```

### Rust Backend Core Modules

```
core/
├── agent/        # Agent orchestration, approval, RAG system
├── agi/          # AGI subsystem (planner, executor, reflection, memory)
├── artifacts/    # Live preview artifacts with versioning
├── codebase/     # Codebase analysis and indexing
├── embeddings/   # Vector embeddings and semantic search
├── llm/          # LLM provider integrations, routing, fallback
├── mcp/          # Model Context Protocol client, events, health
├── orchestration/# Workflow engine
├── research/     # Multi-source research orchestration
├── scheduler/    # Proactive task scheduling, cron jobs
└── skills/       # Skill system for AGI context
```

### AGI Subsystem

The AGI (`core/agi/`) is the autonomous reasoning engine:

- **AGICore** - Main entry point, goal lifecycle management
- **AGIPlanner** - Decomposes goals into executable steps
- **AGIExecutor** - Executes planned steps with tool calls
- **ReflectionEngine** - Analyzes failures, suggests corrections
- **LearningSystem** - Learns from past executions
- **MemoryManager** - Persistent cross-session memory with importance decay
- **CheckpointManager** - Session persistence with bincode serialization

**Execution Flow:**

```
Goal → AGIPlanner (decompose) → Steps → AGIExecutor (execute) → Tools
                                   ↑                              ↓
                           ReflectionEngine ← ← ← ← ← ← ← ← Results
```

**Safety Limits:**

- Max iterations: 1000 per goal
- Configurable timeout: 1 minute to 72 hours (3-tier warning system)
- Consecutive failure limit: 3 failures triggers abandonment
- Resource limits: 80% CPU, 2GB RAM

### Key Implementation Files

**Desktop:**

- `apps/desktop/src/components/UnifiedAgenticChat/` - Main chat interface
- `apps/desktop/src-tauri/src/core/agent/` - AGI reasoning loop
- `apps/desktop/src-tauri/src/core/llm/` - LLM provider integrations
- `apps/desktop/src-tauri/src/core/mcp/` - MCP server management
- `apps/desktop/src-tauri/src/core/agi/memory_manager.rs` - Project memory system
- `apps/desktop/src-tauri/src/core/agi/checkpoint_manager.rs` - Session persistence

**Web:**

- `apps/web/app/api/stripe-webhook/route.ts` - Stripe webhook handler
- `apps/web/app/api/llm/v1/chat/completions/route.ts` - LLM proxy endpoint
- `apps/web/lib/llm-providers/factory.ts` - Model ID mappings (**check docs first!**)
- `apps/web/lib/services/subscription-service.ts` - Subscription logic

---

## Tauri Integration

### State Management

```rust
// In lib.rs setup():
app.manage(McpState::new());            // MCP client state
app.manage(MemoryState::new(&db_path)); // Memory manager (FTS5 search)
app.manage(SchedulerState::new());      // Job scheduler
app.manage(CheckpointState::new());     // Session persistence
```

### Event System

```typescript
import { listen } from '@tauri-apps/api/event';

// Common events:
// - agi:progress, agi:complete, agi:error
// - mcp:tool_call, mcp:server_status
// - chat:stream_chunk, chat:generation_complete
// - memory:updated, checkpoint:saved

useEffect(() => {
  const unlisten = listen('agi:progress', (event) => { ... });
  return () => { unlisten.then(f => f()); };
}, []);
```

### Feature Flags (Cargo)

- `shell` - Shell plugin (disabled for App Store)
- `updater` - Auto-update plugin (disabled for App Store)

Check with `#[cfg(feature = "shell")]` before using these features.

---

## Database

### SQLite (Desktop)

- Location: `~/.config/agiworkforce/agiworkforce.db`
- Pragmas: WAL mode, 5s busy timeout, foreign keys ON, 64MB cache
- FTS5 enabled for memory search

### Supabase PostgreSQL (Web)

- Core tables: `profiles`, `subscriptions`, `processed_stripe_events`, `security_audit_logs`
- RLS policies enabled on all tables

---

## MCP Integration

**User-facing:** MCP is invisible. Users say "search my email" and it works.

**Technical:**

- Tool IDs: `mcp__{server_name}__{tool_name}` (exactly two underscores)
- Servers auto-start based on detected intent
- Credentials stored in OS keyring via `mcp_set_credential()`
- OAuth flows for GitHub, Google Drive, Slack via `mcp_oauth_*` commands

**Error Translation (Critical):**

```rust
// Bad: "MCP server 'gmail' returned ECONNREFUSED"
// Good: "Couldn't connect to your email. Please check your internet connection."
```

---

## Stripe Integration

> See `docs/features/stripe-integration.md` for complete webhook patterns and price ID mapping.

**Customer-to-User Mapping:**

- Store `stripe_customer_id` in `profiles` table
- Use customer ID lookup first, email fallback only for legacy

**Price ID Mapping:**

- Use `lib/price-tier-mapping.ts` for strict price-to-tier mapping
- **Never use substring matching** (e.g., `priceId.includes('hobby')`)

**Webhook Idempotency:**

- Use `process_stripe_event_idempotent` database function
- Check idempotency BEFORE processing, mark AFTER success

**Plan Tiers:** `free` (0) → `hobby` (1) → `pro` (2) → `max` (3) → `enterprise` (4)

---

## Code Patterns

### Tauri Commands

```typescript
import { invoke } from '@tauri-apps/api/core';
const result = await invoke('command_name', { param1: 'value' });
```

### Zustand State

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

const useStore = create<State>()(
  devtools(
    persist(
      (set) => ({
        /* state */
      }),
      { name: 'store-name' },
    ),
  ),
);
```

### Imports

```typescript
import type { YourType } from '@agiworkforce/types';
import { helper } from '@agiworkforce/utils';
import { Component } from '@/components/Component';
```

---

## Adding New Features

### New Tauri Command

1. Define in `src-tauri/src/sys/commands/`:

```rust
#[tauri::command]
pub async fn my_command(state: State<'_, MyState>, param: String) -> Result<MyResponse, String> {
    // Implementation
}
```

2. Register in `lib.rs` invoke_handler:

```rust
.invoke_handler(tauri::generate_handler![crate::sys::commands::my_command])
```

3. Create TypeScript wrapper in `apps/desktop/src/api/`:

```typescript
export const myCommand = (param: string) => invoke<MyResponse>('my_command', { param });
```

### New AGI Tool

Add to `core/agi/tools.rs`:

```rust
pub struct MyTool;
impl Tool for MyTool {
    fn name(&self) -> &str { "my_tool" }
    // Must be reversible! Store undo state. Return user-friendly errors.
}
```

---

## Debugging

- **Desktop Rust errors:** Terminal where `pnpm dev:desktop` runs
- **Desktop React errors:** Right-click for dev tools in dev mode
- **Diagnostics:** Use `/doctor` command or `doctor_run_checks` Tauri command
- **MCP server logs:** `mcp_get_server_logs(server_name)` command

### Rust Tracing

```rust
tracing::info!("Message initialized");
tracing::warn!("Failed to load: {}", e);
tracing::error!("Critical failure: {:?}", err);
```

---

## Commit Convention

Format: `type(scope): message`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
Scopes: `desktop`, `web`, `agi`, `mcp`, `ui`, `api`, `docs`

---

## Pinned Versions

- Node.js 22.12.0+, pnpm 9.15.3+
- TypeScript 5.9.3, React 19.2.3, Vite 7.3.1
- Tauri 2.9, Rust 1.75+
- Next.js 16, Supabase SDK 2.89+
- Stripe SDK 20+

---

## Environment Files

- `apps/desktop/.env.local` - Desktop environment
- `apps/web/.env.local` - Web environment
- `services/api-gateway/.env` - API Gateway environment

Never commit `.env.local` files.
