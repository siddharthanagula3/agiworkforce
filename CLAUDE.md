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
│   │   │       ├── sys/         # System commands, security
│   │   │       ├── core/        # Business logic (AGI, agents, MCP)
│   │   │       ├── data/        # Data access layer
│   │   │       ├── automation/  # Browser & workflow automation
│   │   │       └── integrations/# Third-party APIs
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

### Data Flow

**Desktop App:**
React Frontend → Tauri Commands → Rust Backend → SQLite/Remote APIs
Rust Backend → Tauri Events → React Frontend (state updates)

**Web App:**
React Components → Next.js Server Components → Supabase SDK → PostgreSQL

**Real-time Sync:**
Desktop ↔ WebSocket Signaling Server ↔ Mobile/Web (6-digit pairing codes, 5-min TTL)

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

**Safety Limits:**

- Max iterations: 1000 per goal
- Absolute timeout: 5 minutes
- Consecutive failure limit: 3 failures triggers abandonment

**Undo System (Critical):**
Every action must be reversible. Before implementing any tool:

1. Define how to undo/rollback the action
2. Store the "before" state so it can be restored
3. Provide user-friendly undo via chat

## MCP Integration

**User-facing:** MCP is invisible. Users say "search my email" and it works.

**Technical:**

- Tool IDs: `mcp__{server_name}__{tool_name}` (exactly two underscores)
- Servers auto-start based on detected intent
- Credentials stored in OS keyring via `mcp_set_credential()`

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

## Pinned Versions

- Node.js 22.12.0+, pnpm 9.15.3+
- TypeScript 5.9.3, React 19.2.3, Vite 7.3.1
- Tauri 2.9, Rust 1.75+
