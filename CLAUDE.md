# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AGI Workforce is a full-stack monorepo for an AI automation platform:

- **Desktop:** Tauri 2.9 (Rust backend + React 19 frontend) with local SQLite database
- **Web:** Next.js 16 with React 19 and Supabase backend
- **Services:** Node.js/Express API Gateway (port 3000) and WebSocket Signaling Server (port 4000)
- **Shared:** TypeScript types and utilities via pnpm workspaces

## Product Vision

> **"AGI Workforce is a desktop app where non-technical users simply tell an AI what they want done, and it autonomously completes the task - with everything reversible if something goes wrong."**

### Core Principles

| Principle       | Decision            | Implication                                                                                   |
| --------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| **Target User** | Non-technical users | UX must be dead simple. No jargon, no configuration screens. Error messages in plain English. |
| **Interaction** | Chat-first          | Users describe what they want in natural language. The AI figures out the steps.              |
| **Autonomy**    | Full autonomy       | AI completes goals without asking for approval at each step.                                  |
| **Safety**      | Undo-based          | All actions must be reversible. This enables full autonomy while maintaining safety.          |
| **Platform**    | Desktop-primary     | Desktop has full AGI/automation. Web is for billing, subscriptions, and device sync only.     |
| **LLM Access**  | Managed proxy       | AGI Workforce proxies all LLM API calls. Users pay us, not providers directly.                |
| **MCP**         | Hidden complexity   | MCP powers tools behind the scenes, but users never see "MCP". They just say what they want.  |

### Development Guidelines

1. **Simplicity is paramount** - Every feature should be usable by someone who has never seen a terminal
2. **Undo system is critical** - Before implementing any action, ensure it can be reversed
3. **Chat is the interface** - If you're tempted to add a button, ask "could the user just ask for this in chat instead?"
4. **Errors must be friendly** - Never show stack traces or technical codes to users
5. **MCP is invisible** - User-facing errors should never mention "MCP" - translate to plain English

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

# Single test file
cd apps/web && pnpm vitest run __tests__/api/checkout.test.ts
cd apps/desktop && pnpm vitest run src/__tests__/path/to/test.test.ts

# Rust tests
cd apps/desktop/src-tauri && cargo test
cd apps/desktop/src-tauri && cargo test test_name   # Single test

# E2E tests (requires: cd apps/desktop && pnpm build && pnpm preview)
pnpm --filter @agiworkforce/desktop test:e2e
pnpm --filter @agiworkforce/desktop test:e2e -- --project=smoke
pnpm --filter @agiworkforce/desktop test:e2e -- --ui  # Debug mode
```

### Building

```bash
pnpm build:desktop                                  # Build desktop (DMG/EXE/AppImage)
pnpm build                                          # Build all packages
pnpm --filter @agiworkforce/web build               # Build web only
```

### Cleanup

```bash
pnpm clean                                          # Remove all node_modules and dist
rm -rf apps/desktop/node_modules/.vite              # Clear Vite cache
rm -rf ~/.config/agiworkforce/agiworkforce.db       # Reset SQLite database
cd apps/desktop/src-tauri && cargo clean            # Clean Rust artifacts
```

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
│   │   │       ├── features/    # Feature modules (terminal, workflows, teams)
│   │   │       ├── integrations/# Third-party APIs, realtime sync
│   │   │       └── ui/          # Tray and window management
│   │   └── e2e/                 # Playwright E2E tests
│   ├── web/                     # Next.js SaaS platform
│   │   ├── app/api/             # API routes (webhooks, checkout, LLM proxy)
│   │   ├── lib/services/        # Business logic
│   │   └── supabase/            # Database migrations
│   └── extension/               # Browser extension
├── services/
│   ├── api-gateway/             # Express.js REST API (port 3000)
│   └── signaling-server/        # WebSocket sync (port 4000)
└── packages/
    ├── types/                   # Shared TypeScript types
    └── utils/                   # Shared utilities
```

### Rust Backend Module Organization

The `src-tauri/src/core/` directory contains the core business logic:

```
core/
├── agent/        # Agent orchestration, approval, RAG system
├── agi/          # AGI subsystem (see AGI Architecture below)
├── artifacts/    # Live preview artifacts with versioning
├── codebase/     # Codebase analysis and indexing
├── embeddings/   # Vector embeddings and semantic search
├── llm/          # LLM provider integrations, routing, fallback
├── mcp/          # Model Context Protocol client, events, health
├── models/       # Shared model definitions
├── orchestration/# Workflow engine
├── research/     # Multi-source research orchestration
├── scheduler/    # Proactive task scheduling, cron jobs
├── skills/       # Skill system for AGI context
└── sync_utils/   # Async synchronization utilities
```

### AGI Subsystem Architecture

The AGI (`core/agi/`) is the autonomous reasoning engine:

- **AGICore** - Main entry point, goal lifecycle management
- **AGIPlanner** - Decomposes goals into executable steps
- **AGIExecutor** - Executes planned steps with tool calls
- **ReflectionEngine** - Analyzes failures, suggests corrections
- **LearningSystem** - Learns from past executions
- **KnowledgeBase** - Stores and retrieves learned knowledge
- **MemoryManager** - Persistent cross-session memory with decay
- **ProcessReasoning** - Matches goals to process templates
- **OutcomeTracker** - Tracks success rates by process type
- **Sandbox** - Isolated code execution environment

### Tauri State Management

The app uses Tauri's managed state pattern. Each feature has a `*State` wrapper:

```rust
// In lib.rs setup():
app.manage(McpState::new());           // MCP client state
app.manage(MemoryState::new(&db_path)); // Memory manager
app.manage(SchedulerState::new());     // Job scheduler
```

Access in commands via:

```rust
#[tauri::command]
async fn my_command(state: State<'_, McpState>) -> Result<...> { ... }
```

### Feature Flags (Cargo)

Some features are disabled for App Store builds:

- `shell` - Shell plugin for terminal commands (sandbox restrictions)
- `updater` - Auto-update plugin (App Store handles updates)

Check with `#[cfg(feature = "shell")]` before using these features.

### Data Flow

**Desktop App:**

```
React Frontend → invoke() → Tauri Commands → Rust Backend → SQLite/Remote APIs
Rust Backend → emit() → Tauri Events → React Frontend (state updates)
```

**Web App:**

```
React Components → Next.js Server Components → Supabase SDK → PostgreSQL
```

**Real-time Sync:**

```
Desktop ↔ WebSocket Signaling Server ↔ Mobile/Web (6-digit pairing codes, 5-min TTL)
```

### Tauri Event System

The backend emits events for async updates. Subscribe in React:

```typescript
import { listen } from '@tauri-apps/api/event';

// Common events:
// - agi:progress, agi:complete, agi:error
// - mcp:tool_call, mcp:server_status
// - chat:stream_chunk, chat:generation_complete
// - browser:page_loaded, browser:screenshot

useEffect(() => {
  const unlisten = listen('agi:progress', (event) => { ... });
  return () => { unlisten.then(f => f()); };
}, []);
```

### Key Files

- `apps/desktop/src/components/UnifiedAgenticChat/` - Main chat interface
- `apps/desktop/src-tauri/src/core/agent/` - AGI reasoning loop
- `apps/desktop/src-tauri/src/core/llm/` - LLM provider integrations
- `apps/desktop/src-tauri/src/core/mcp/` - MCP server management
- `apps/web/app/api/stripe-webhook/route.ts` - Stripe webhook handler
- `apps/web/app/api/llm/v1/chat/completions/route.ts` - LLM proxy endpoint
- `apps/web/lib/services/subscription-service.ts` - Subscription logic

## Stripe Integration (Critical)

**Customer-to-User Mapping:**

- Store `stripe_customer_id` in `profiles` table
- Use customer ID lookup first, email fallback only for legacy
- Pass `supabase_user_id` in checkout session metadata

**Price ID Mapping:**

- Use `lib/price-tier-mapping.ts` for strict price-to-tier mapping
- Never use substring matching (e.g., `priceId.includes('hobby')`)
- Add new price IDs to `PRICE_ID_TO_TIER` or use `PRICE_ID_OVERRIDES` env var

**Webhook Idempotency:**

- Use `process_stripe_event_idempotent` database function
- Check idempotency BEFORE processing, mark AFTER success

## Database

### Supabase PostgreSQL (Web)

**Core tables:**

- `profiles` - User data, `stripe_customer_id`
- `subscriptions` - Plan tiers (hobby, pro, max, enterprise), Stripe IDs
- `processed_stripe_events` - Webhook idempotency
- `security_audit_logs` - Security events (90-day retention)

RLS policies enabled on all tables.

### SQLite (Desktop)

Location: `~/.config/agiworkforce/agiworkforce.db`
Pragmas: WAL mode, 5s busy timeout, foreign keys ON, 64MB cache

## AGI Reasoning Loop

The AGI operates with **full autonomy** - it completes goals without asking for approval at each step.

**Execution Flow:**

```
Goal → AGIPlanner (decompose) → Steps → AGIExecutor (execute) → Tools
                                   ↑                              ↓
                           ReflectionEngine ← ← ← ← ← ← ← ← Results
```

**Safety Limits:**

- Max iterations: 1000 per goal
- Absolute timeout: 5 minutes
- Consecutive failure limit: 3 failures triggers abandonment
- Resource limits: 80% CPU, 2GB RAM, 100 Mbps network

**Undo System (Critical):**
Every action must be reversible. Before implementing any tool:

1. Define how to undo/rollback the action
2. Store the "before" state so it can be restored
3. Provide user-friendly undo via chat

The `UndoState` and `form_undo_*` commands manage reversibility. File operations automatically track undo state.

## MCP Integration

**User-facing:** MCP is invisible. Users say "search my email" and it works.

**Technical:**

- Tool IDs: `mcp__{server_name}__{tool_name}` (exactly two underscores)
- Servers auto-start based on detected intent
- Credentials stored in OS keyring via `mcp_set_credential()`
- OAuth flows for GitHub, Google Drive, Slack via `mcp_oauth_*` commands
- MCP Bundles (MCPB) for installing pre-configured server packages

**Error Translation:**
MCP errors must be translated to user-friendly messages:

```rust
// Bad: "MCP server 'gmail' returned ECONNREFUSED"
// Good: "Couldn't connect to your email. Please check your internet connection."
```

## Plan Tiers

Tiers (lowest to highest): `free` (0), `hobby` (1), `pro` (2), `max` (3), `enterprise` (4)
Use `hasPlan(tier)` to check if user has at least the required tier.

## Code Patterns

### Tauri Commands (Desktop)

```typescript
// Frontend: invoke Rust commands
import { invoke } from '@tauri-apps/api/core';
const result = await invoke('command_name', { param1: 'value' });
```

### Zustand State (Desktop)

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

const useStore = create<State>()(
  devtools(
    persist(
      (set) => ({
        /* state */
      }),
      { name: 'store-name', version: 1 },
    ),
    { name: 'StoreName', enabled: import.meta.env.DEV },
  ),
);
```

### Imports

```typescript
// Shared types
import type { YourType } from '@agiworkforce/types';
// Shared utils
import { helper } from '@agiworkforce/utils';
// Desktop path alias
import { Component } from '@/components/Component';
```

## Commit Convention

Format: `type(scope): message`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
Scopes: `desktop`, `web`, `agi`, `mcp`, `ui`, `api`, `docs`

## Environment Files

- `apps/desktop/.env.local` - Desktop environment (from `.env.example`)
- `apps/web/.env.local` - Web environment
- `services/api-gateway/.env` - API Gateway environment

Never commit `.env.local` files.

## Debugging

- **Desktop Rust errors:** Terminal where `pnpm dev:desktop` runs
- **Desktop React errors:** Right-click for dev tools in dev mode
- **WebSocket sync:** DevTools Network tab → WS (codes expire in 5 min)
- **Service health:** `GET /health` endpoint
- **Diagnostics:** Use `/doctor` command or `doctor_run_checks` Tauri command
- **MCP server logs:** `mcp_get_server_logs(server_name)` command

### Rust Tracing

The Rust backend uses `tracing` for logging:

```rust
tracing::info!("Message initialized");
tracing::warn!("Failed to load: {}", e);
tracing::error!("Critical failure: {:?}", err);
```

View logs in the terminal running `pnpm dev:desktop`.

## Pinned Versions

- Node.js 22.12.0+, pnpm 9.15.3+
- TypeScript 5.9.3, React 19.2.3, Vite 7.3.1
- Tauri 2.9, Rust 1.75+
- Next.js 16, Supabase SDK 2.89+
- Stripe SDK 20+

## Adding New Tauri Commands

1. Define the command in `src-tauri/src/sys/commands/`:

```rust
#[tauri::command]
pub async fn my_new_command(
    state: State<'_, MyState>,
    param: String,
) -> Result<MyResponse, String> {
    // Implementation
}
```

2. Register in `lib.rs` invoke_handler:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    crate::sys::commands::my_new_command,
])
```

3. Create TypeScript wrapper in `apps/desktop/src/api/`:

```typescript
import { invoke } from '@tauri-apps/api/core';
export const myNewCommand = (param: string) => invoke<MyResponse>('my_new_command', { param });
```

## Adding New AGI Tools

Tools extend AGI capabilities. Add to `core/agi/tools.rs`:

```rust
pub struct MyTool;

impl Tool for MyTool {
    fn name(&self) -> &str { "my_tool" }
    fn description(&self) -> &str { "Does something useful" }
    fn capabilities(&self) -> Vec<ToolCapability> { vec![ToolCapability::ReadFiles] }

    async fn execute(&self, input: serde_json::Value) -> ToolResult {
        // Must be reversible! Store undo state.
        // Return user-friendly errors.
    }
}
```

Register in `ToolRegistry::new()`. Remember: all tools must support undo.
