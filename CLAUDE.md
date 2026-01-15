# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AGI Workforce is a full-stack monorepo built with:

- **Desktop:** Tauri 2.9 (Rust backend + React 19 frontend) with local SQLite database
- **Web:** Next.js 16 with React 19 and Supabase backend
- **Services:** Node.js/Express API Gateway (port 3000) and WebSocket Signaling Server (port 4000)
- **Shared:** TypeScript types and utilities via pnpm workspaces

## Essential Commands

### Development

```bash
# Start desktop development (hot-reload at http://localhost:5173)
pnpm dev:desktop

# Start web development (at http://localhost:3001)
cd apps/web && pnpm dev

# Start backend services (in separate terminals)
pnpm --filter @agiworkforce/api-gateway dev
pnpm --filter @agiworkforce/signaling-server dev

# Install dependencies
pnpm install

# Type check all packages
pnpm typecheck:all
```

### Code Quality

```bash
# Lint all code (max 15 warnings in CI)
pnpm lint

# Fix all lint issues
pnpm lint:fix

# Format code with Prettier
pnpm format

# Check formatting without changing files
pnpm format:check

# Rust formatting and linting
cd apps/desktop/src-tauri && cargo fmt
cd apps/desktop/src-tauri && cargo clippy
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific app tests
pnpm --filter @agiworkforce/desktop test
pnpm --filter web test

# Run a single test file (web)
cd apps/web && pnpm vitest run __tests__/api/checkout.test.ts

# Run a single test file (desktop)
cd apps/desktop && pnpm vitest run src/__tests__/path/to/test.test.ts

# Run Rust tests
cd apps/desktop/src-tauri && cargo test

# Run E2E tests (desktop must be running on port 5175)
pnpm --filter @agiworkforce/desktop test:e2e

# Run specific E2E project
pnpm --filter @agiworkforce/desktop test:e2e -- --project=smoke
pnpm --filter @agiworkforce/desktop test:e2e -- --project=chat
pnpm --filter @agiworkforce/desktop test:e2e -- --project=agi

# Run E2E tests with UI mode (useful for debugging)
pnpm --filter @agiworkforce/desktop test:e2e -- --ui

# Run tests with coverage
pnpm --filter @agiworkforce/desktop test:coverage
pnpm --filter web test:coverage
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

### Cleanup & Troubleshooting

```bash
# Remove all dist directories
pnpm clean:build

# Remove all node_modules and dist (full clean)
pnpm clean

# Clear Vite cache
rm -rf apps/desktop/node_modules/.vite

# Reset local SQLite database
rm -rf ~/.config/agiworkforce/agiworkforce.db

# Clean Rust build artifacts
cd apps/desktop/src-tauri && cargo clean
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
│   ├── web/                # Next.js 16 SaaS platform
│   │   ├── app/            # React 19 Server Components
│   │   ├── app/api/        # API routes (Stripe webhook, checkout, device linking)
│   │   ├── lib/services/   # Business logic (subscription, credit, audit, API key)
│   │   ├── lib/            # Rate limiting, security, price mapping utilities
│   │   ├── __tests__/      # Vitest unit/integration tests
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
├── apps/web/supabase/      # Database migrations and schema
└── Configuration files     # pnpm-workspace.yaml, tsconfig.base.json, Cargo.toml
```

### Technology Stack

**Frontend (Desktop):**

- React 19.2 with TypeScript 5.9
- Vite 7 build system with SWC
- Zustand v5 state management (with devtools, persist, subscribeWithSelector middleware)
- Radix UI + Tailwind CSS v4 (CSS-first configuration)
- xterm.js v6 for terminal, Monaco Editor, @xyflow/react v12, Mermaid v11

**Frontend (Web):**

- Next.js 16 with React 19
- Tailwind CSS v4 (CSS-first with `@import "tailwindcss"`)
- React Query v5 for server state
- Zod v4 for validation

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

**Rust Backend (Tauri) Organization** (`apps/desktop/src-tauri/src/`):

- `sys/` - System commands, security, event handling
- `core/` - Business logic (agents, workflows, approvals)
- `data/` - Data access layer (DB, settings, state)
- `automation/` - Workflow and script automation
- `integrations/` - Third-party API integrations
- `features/` - Feature-specific modules
- `ui/` - UI-related Rust code

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

## Stripe Integration Patterns

**Customer-to-User Mapping (CRITICAL):**

- Store `stripe_customer_id` in `profiles` table for reliable user lookup
- Use customer ID lookup first, email fallback only for legacy migration
- Pass `supabase_user_id` in checkout session metadata

**Price ID Mapping:**

- Use `lib/price-tier-mapping.ts` for strict price-to-tier mapping
- Never use substring matching on price IDs (e.g., `priceId.includes('hobby')`)
- Add new price IDs to `PRICE_ID_TO_TIER` or use `PRICE_ID_OVERRIDES` env var

**Webhook Idempotency:**

- Use `process_stripe_event_idempotent` database function
- Events tracked in `processed_stripe_events` table

**Rate Limiting:**

- Configured in `lib/rate-limit.ts` with per-endpoint limits
- Security-sensitive endpoints use `failClosed: true` (block on Redis failure)
- Uses Upstash Redis in production, in-memory fallback for development

## Database Schema

### Core Tables (Supabase PostgreSQL)

**profiles:**

- Links auth users to app data
- Stores `stripe_customer_id` for Stripe integration
- Required FK for subscriptions

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

- Base URL: http://localhost:5175 (Vite dev server)
- Viewport: 1920×1080
- Parallel disabled (serial execution)
- Auto-retries (2x in CI, 0x locally)
- Screenshots/videos on failure

**E2E Test Files** (`apps/desktop/e2e/`):

- `smoke.spec.ts` - Critical path smoke tests
- `chat.spec.ts` - Chat interface tests
- `agi.spec.ts` - AGI system tests
- `automation.spec.ts` - Workflow automation tests
- `browser-automation.spec.ts` - Browser automation tests
- `settings.spec.ts` - Settings and configuration tests
- `visual-regression.spec.ts` - Visual regression tests
- `advanced-integration-flows.spec.ts` - Advanced integration tests
- `comprehensive-flows.spec.ts` - End-to-end flow tests

## Development Patterns

### Shared Code

```typescript
// Types: import type { YourType } from '@agiworkforce/types'
// Utils: import { helper } from '@agiworkforce/utils'
```

### Zustand State (Desktop)

```typescript
const useStore = create<State>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        /* state */
      })),
      { name: 'store-name', storage: createJSONStorage(() => localStorage) },
    ),
    { name: 'StoreName', enabled: import.meta.env.DEV },
  ),
);
export const selectX = (state: State) => state.x; // Export selectors
```

### Tauri Commands

```typescript
// Frontend: invoke('command_name', { params })
// Backend: Define in src-tauri/src/sys/commands/
```

### Web API Calls

- Server Components: Direct Supabase calls
- Client Components: React Query for caching

## Debugging

- **Desktop Rust errors:** Terminal where `pnpm dev:desktop` runs
- **Desktop React errors:** Right-click for dev tools in dev mode
- **WebSocket sync:** DevTools Network tab → WS (pairing codes expire in 5 min)
- **Service health:** `GET /health` endpoint

## Modern Stack Patterns

### Tailwind CSS v4 (CSS-First Configuration)

Both desktop and web apps use Tailwind CSS v4 with the new CSS-first configuration:

```css
/* Use @import instead of @tailwind directives */
@import 'tailwindcss';

/* Define custom theme in CSS with @theme block */
@theme {
  --color-brand: #3b82f6;
  --font-sans: 'Inter', sans-serif;
}

/* Use @plugin for plugins */
@plugin "tailwindcss-animate";

/* Use @source for content detection */
@source "../components/**/*.{ts,tsx}";
```

- No `tailwind.config.js` needed - all configuration in CSS
- PostCSS uses `@tailwindcss/postcss` plugin
- Vite uses `@tailwindcss/vite` plugin

### React 19 Patterns

**Forms with useActionState and useFormStatus:**

```tsx
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>Submit</button>;
}

function Form() {
  const [state, action, isPending] = useActionState(
    async (prev, formData) => {
      // Handle form submission
      return { success: true };
    },
    { success: false },
  );

  return <form action={action}>...</form>;
}
```

**Ref as Prop (React 19 - no forwardRef needed):**

```tsx
// React 19: ref is just a prop
function Input({ ref, ...props }: { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />;
}
```

### Tauri 2.x Permissions (ACL System)

Capabilities are defined in `src-tauri/capabilities/default.json`:

```json
{
  "permissions": ["core:default"] // Simplified permission set
}
```

- Use `core:*` prefix for core plugins
- Modern ACL format with granular controls
- Window-scoped permissions supported

## SQLite Configuration (Desktop)

The desktop app uses SQLite with optimized pragmas for performance and reliability:

```rust
// Set on database connection open in lib.rs
PRAGMA busy_timeout = 5000;     // 5s timeout for concurrent access
PRAGMA journal_mode = WAL;       // Write-Ahead Logging for better concurrency
PRAGMA synchronous = NORMAL;     // Balance between safety and speed
PRAGMA foreign_keys = ON;        // Enforce referential integrity
PRAGMA cache_size = -64000;      // 64MB cache
```

## MCP (Model Context Protocol) Integration

MCP tool IDs follow the format: `mcp__{server_name}__{tool_name}` (note: exactly two underscores as separator).

**Key Commands:**

- `mcp_set_credential(server_name, key, value)` - Store credentials in OS keyring
- `mcp_delete_credential(server_name, key)` - Remove credentials from OS keyring
- `mcp_get_server_logs(server_name, lines)` - Get server logs (placeholder - full implementation pending)

## AGI Reasoning Loop

The AGI system has built-in safety limits:

- **Max iterations:** 1000 iterations per goal
- **Absolute timeout:** 5 minutes (300 seconds)
- **Consecutive failure limit:** 3 failures triggers goal abandonment

Events emitted: `agi:goal:timeout`, `agi:goal:max_iterations`, `agi:goal:cancelled`

## Plan Tier Hierarchy

Plan tiers are ordered from lowest to highest:

1. `free` (0)
2. `hobby` (1)
3. `pro` (2)
4. `max` (3)
5. `enterprise` (4)

Use `hasPlan(tier)` to check if user has at least the required tier.

## Important Notes

- **Environment files:** Never commit `.env.local` - use `.env.example` templates in `apps/desktop/`, `apps/web/`, `services/api-gateway/`
- **Database migrations:** Write SQL in `apps/web/supabase/migrations/`
- **Pre-commit hooks:** Auto-fix formatting/linting via Husky
- **Monorepo commands:** Use `--filter` for specific packages, `pnpm -r` for all
- **Pinned versions:** pnpm 9.15.3+, Node 22.12.0+, TypeScript 5.9.3

## Quick Start Checklist

1. `pnpm install` - Install dependencies
2. `pnpm typecheck:all` - Verify setup
3. `pnpm dev:desktop` - Start desktop development
4. Run relevant tests before committing

## Commit Convention

Uses [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `chore:`

Scopes: `desktop`, `web`, `agi`, `mcp`, `ui`, `api`, `docs`

## Additional Documentation

- **[README.md](README.md)** - Features and quick start
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed system design, data flows, and code patterns
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Code style, testing, and PR guidelines
- **[docs/CHANGELOG.md](docs/CHANGELOG.md)** - Version history
