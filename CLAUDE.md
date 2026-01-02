# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AGI Workforce is a full-stack monorepo built with:

- **Desktop:** Tauri (Rust backend + React frontend) with local SQLite database
- **Web:** Next.js 15 with React 19 and Supabase backend
- **Services:** Node.js/Express API Gateway and WebSocket Signaling Server
- **Shared:** TypeScript types and utilities via pnpm workspaces

The project supports multi-platform deployment (macOS, Windows, Linux) with real-time synchronization between desktop and mobile clients.

## Essential Commands

### Development

```bash
# Start desktop development
pnpm dev:desktop

# Start web development
cd apps/web && pnpm dev

# Start backend services (in separate terminals)
pnpm --filter @agiworkforce/api-gateway dev
pnpm --filter @agiworkforce/signaling-server dev

# Install dependencies
pnpm install

# Type check
pnpm typecheck:all
```

### Code Quality

```bash
# Lint all code
pnpm lint

# Fix all lint issues
pnpm lint:fix

# Format code with Prettier
pnpm format

# Check formatting without changing files
pnpm format:check
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific app tests
pnpm --filter @agiworkforce/desktop test

# Run E2E tests (desktop)
pnpm --filter @agiworkforce/desktop test:e2e

# Run E2E tests with UI mode (useful for debugging)
pnpm --filter @agiworkforce/desktop test:e2e -- --ui

# Run tests with coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

### Building

```bash
# Build all non-desktop apps/services
pnpm build

# Build desktop app (creates DMG for macOS, EXE for Windows, AppImage for Linux)
pnpm build:desktop

# Build web app only
pnpm --filter @agiworkforce/web build

# Build specific service
pnpm --filter @agiworkforce/api-gateway build
```

### Cleanup

```bash
# Remove all dist directories
pnpm clean:build

# Remove all node_modules and dist (full clean)
pnpm clean
```

## Architecture Overview

### Monorepo Structure

```
agiworkforce/
├── apps/
│   ├── desktop/            # Tauri app (Rust + React) - main application
│   │   ├── src/            # React components and stores (Zustand)
│   │   ├── src-tauri/      # Rust backend with system integrations
│   │   ├── e2e/            # Playwright E2E tests
│   │   └── vite.config.ts  # Frontend build configuration
│   ├── web/                # Next.js 15 SaaS platform
│   │   ├── app/            # React 19 Server Components
│   │   ├── lib/services/   # API key, audit, credit, LLM cost services
│   │   └── middleware.ts   # Auth and request processing
│   └── extension/          # Browser extension
├── services/
│   ├── api-gateway/        # Express.js API (port 3000)
│   │   └── routes/         # Auth, desktop sync, mobile sync endpoints
│   └── signaling-server/   # WebSocket (port 4000)
│       └── Pairing protocol for device synchronization
├── packages/
│   ├── types/              # Shared TypeScript types
│   └── utils/              # Shared utilities
├── supabase/               # Database migrations and schema
└── Configuration files     # pnpm-workspace.yaml, tsconfig.base.json, Cargo.toml
```

### Technology Stack

**Frontend (Desktop):**

- React 18 with TypeScript
- Vite build system
- Zustand state management
- Radix UI + Tailwind CSS
- xterm.js for terminal, Monaco Editor, ReactFlow, Mermaid

**Frontend (Web):**

- Next.js 15 with React 19
- Tailwind CSS v4
- React Query for server state
- Zod for validation

**Backend (Desktop):**

- Tauri 2.9 with Rust backend
- Tokio async runtime
- SQLite for local persistence
- System integrations: clipboard, keyboard shortcuts, file system, shell execution, notifications

**Backend (Services):**

- Express.js for REST API
- WebSocket (ws library) for real-time signaling
- JWT authentication
- Supabase SDK for database operations

**Database:**

- Supabase PostgreSQL (web) with RLS policies enabled
- SQLite (desktop) at `~/.config/agiworkforce/agiworkforce.db`

### Data Flow

**Desktop App:**

1. React Frontend → Tauri Commands → Rust Backend → SQLite/Remote APIs
2. Rust Backend → Tauri Events → React Frontend (state updates)

**Web App:**

1. React Components → Next.js Server Components → Supabase SDK → PostgreSQL
2. Client-side operations via API Routes

**Real-time Sync:**

1. Desktop ↔ WebSocket Signaling Server ↔ Mobile/Web
2. Pairing via 6-digit codes with 5-minute TTL

### Key Architectural Patterns

**Rust Backend (Tauri) Organization:**

- `sys/commands/` - Tauri command handlers (entry points)
- `core/` - Business logic (agents, workflows, approvals)
- `data/` - Data access layer (DB, settings, state)
- `automation/` - Workflow and script automation
- `integrations/` - Third-party API integrations
- `sys/security/` - Encryption and auth

**React State Management:**

- Desktop: Zustand stores (lightweight, no boilerplate)
- Web: React Query for async data + local state

**API Communication:**

- Desktop: Invoke Rust commands via Tauri
- Web: Fetch API with Supabase SDK or native fetch

## Configuration Files

### TypeScript

**tsconfig.base.json** (root):

- ES2020 target
- Strict mode enabled
- Path aliases: `@/*` (desktop), `@types/*`, `@utils/*`

**Per-app overrides:**

- Desktop Vite (Chrome 105+), Web Next.js, Services Node.js

### Code Quality

**ESLint (.eslintrc.cjs):**

- Max 15 warnings in CI
- Plugins: React, React Hooks, TypeScript, Import
- Prettier integration

**Prettier (.prettierrc.json):**

- Single quotes, semicolons, trailing commas
- Print width: 100, Tab width: 2

**Husky Hooks:**

- Pre-commit: ESLint auto-fix + Prettier formatting
- Commit-msg: Commitlint validation

### Deployment

**Vercel (Web):**

- Deploy from `apps/web`
- Build command: Next.js with pnpm
- Auto-deploys on push to main

**Tauri Desktop:**

- Auto-updates via release endpoint
- Supports Deep Linking
- CSP allows: OpenAI, Anthropic, Google APIs, Supabase

## Database Schema

### Core Tables (Supabase PostgreSQL)

**subscriptions:**

- Plan tiers: hobby, pro, max, enterprise
- Stripe integration: customer_id, subscription_id, price_id
- Period tracking and cancellation fields
- RLS: Users view own, service role manages all

**processed_stripe_events:**

- Webhook idempotency via event_id
- Service role access only

**beta_invites & beta_redemptions:**

- Invite codes with usage limits and expiry
- Track redemptions per user
- RLS: Service role creates, users view own

### Local Database (Desktop SQLite)

- Self-contained at data directory
- Migrations handled by Rust code
- No external dependencies, works offline

## Testing Strategy

**Unit & Component Tests (Vitest):**

- Configuration: jsdom environment, globals enabled
- React Testing Library for component testing
- All packages use shared Vitest config

**E2E Tests (Playwright):**

- Tests for smoke, chat, automation, AGI, onboarding, settings, visual regression
- Base URL: http://localhost:3000
- Viewport: 1920×1080
- Parallel disabled (serial execution)
- Auto-retries (2x in CI, 0x locally)
- Screenshots/videos on failure

**Location:** `apps/desktop/e2e/` with TypeScript specs

## Development Notes

### Performance Considerations

- **Tauri Desktop:** Native Rust backend ensures efficiency; avoid long-running JS operations
- **Next.js:** Use Server Components for data fetching; minimize client-side bundles
- **SQLite:** Single-file database; backup before schema changes

### Security

- **Desktop:** Encryption available via AES-GCM (Rust)
- **Web:** RLS policies on all sensitive tables; Supabase Auth handles sessions
- **Services:** JWT validation; CORS configured per service

### Common Patterns

**Sharing Code:**

- Types: `import type { YourType } from '@agiworkforce/types'`
- Utils: `import { helper } from '@agiworkforce/utils'`

**State in Desktop:**

- Use Zustand: `create((set) => ({ state, actions }))`
- Subscribe to updates via Tauri events

**API Calls in Web:**

- Server Components: Direct Supabase calls
- Client Components: React Query for caching

**Tauri Commands:**

- Define in Rust (`src-tauri/src/sys/commands/`)
- Invoke from React: `invoke('command_name', { params })`

## Debugging Tips

**Desktop App:**

- Dev tools via right-click in dev mode
- Check console for React errors
- Rust errors in terminal where `pnpm dev:desktop` runs

**Web App:**

- Next.js error overlay
- Chrome DevTools for client debugging
- Server logs in terminal

**Services:**

- Check logs in service terminal
- Health endpoint: `GET /health`

**WebSocket Signaling:**

- Monitor message flow in browser DevTools (Network tab → WS)
- Pairing codes expire after 5 minutes by default

## Important Notes

- **Never commit `.env.local` or secret keys** - use `.env.example` for templates
- **Database migrations:** Write in SQL; Supabase handles deployment
- **Pre-commit hooks** enforce formatting/linting; let them auto-fix when possible
- **Monorepo:** Use `--filter` flag for targeted commands; `pnpm -r` for all packages
- **Versioning:** pnpm 9.15.3, Node 22.x, Rust 1.90.0 are pinned

## When Starting Work

1. **Check deps:** `pnpm install` (pnpm enforces exact versions via lock file)
2. **Type check:** `pnpm typecheck:all` before making changes
3. **Run relevant tests:** Especially E2E before UI/UX changes
4. **Review:** Check git status for unintended changes before committing
