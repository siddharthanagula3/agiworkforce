# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AGI Workforce is a full-stack monorepo built with:

- **Desktop:** Tauri 2.9 (Rust backend + React 19 frontend) with local SQLite database
- **Web:** Next.js 16 with React 19 and Supabase backend
- **Services:** Node.js/Express API Gateway (port 3000) and WebSocket Signaling Server (port 4000)
- **Shared:** TypeScript types and utilities via pnpm workspaces

## Product Vision

> **"AGI Workforce is a desktop app where non-technical users simply tell an AI what they want done, and it autonomously completes the task - with everything reversible if something goes wrong."**

### Core Principles

| Principle              | Decision              | Implication                                                                                                                     |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Target User**        | Non-technical users   | UX must be dead simple. No jargon, no configuration screens, no technical concepts exposed. Error messages in plain English.    |
| **Interaction Model**  | Chat-first            | Users describe what they want in natural language. No visual workflow builders, no drag-and-drop. The AI figures out the steps. |
| **Autonomy Level**     | Full autonomy         | AI completes goals without asking for approval at each step. Users set a goal and the AI handles it end-to-end.                 |
| **Safety Model**       | Undo-based            | All actions must be reversible. Users can "undo" if something goes wrong. This enables full autonomy while maintaining safety.  |
| **Platform Strategy**  | Desktop-primary       | Desktop app has full AGI/automation capabilities. Web platform is for billing, subscription management, and device sync only.   |
| **LLM Access**         | Managed proxy         | AGI Workforce proxies all LLM API calls. Users pay us, not OpenAI/Anthropic directly. We handle billing complexity.             |
| **MCP Strategy**       | Hidden complexity     | MCP powers tools behind the scenes, but users never see "MCP". They just say "search my email" and it works.                    |
| **Browser Automation** | Natural language only | "Book me a flight to NYC" - AI handles navigation. No macro recording, no visual scripting.                                     |
| **Onboarding**         | None required         | No setup wizard. User opens app and starts chatting immediately.                                                                |

### What This Means for Development

1. **Simplicity is paramount** - Every feature should be usable by someone who has never seen a terminal
2. **Undo system is critical** - Before implementing any action (file changes, browser actions, API calls), ensure it can be reversed
3. **No technical UI** - Settings screens should be minimal. MCP servers, API configurations, etc. should be automatic or hidden
4. **Chat is the interface** - If you're tempted to add a button or menu, ask "could the user just ask for this in chat instead?"
5. **Errors must be friendly** - Never show stack traces, technical codes, or developer-oriented messages to users
6. **Managed infrastructure** - Backend must track token usage, handle API key management, and bill users accordingly

### Architectural Decisions

- **Deleted components were intentional**: The removed `Configurator/`, `Orchestration/`, `MissionControl/`, and `Onboarding/` components represented a visual-workflow approach that conflicts with chat-first vision
- **State consolidation target**: Aim for ~10 domain-organized Zustand stores (chat, agent, settings, automation, auth, ui, etc.) instead of 40+ granular stores
- **ScreenWatcher purpose**: Provides visual context to AGI during active goal execution only (not always-on surveillance)

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

# Run a single Rust test
cd apps/desktop/src-tauri && cargo test test_name

# Run tests in watch mode (desktop)
cd apps/desktop && pnpm vitest

# Run E2E tests (requires separate build: cd apps/desktop && pnpm build && pnpm preview)
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
│   │   ├── src/
│   │   │   ├── components/ # React components (feature-organized)
│   │   │   │   ├── AGI/              # AGI-related components
│   │   │   │   ├── Auth/             # Authentication UI
│   │   │   │   ├── Browser/          # Browser automation
│   │   │   │   ├── CustomInstructions/  # Custom instructions dialog
│   │   │   │   ├── ErrorHandling/    # Error boundary & reporting
│   │   │   │   ├── Onboarding/       # User onboarding flow
│   │   │   │   ├── SimpleMode/       # Simple/Advanced mode toggle
│   │   │   │   ├── Subscription/     # Subscription gate & dialogs
│   │   │   │   ├── UnifiedAgenticChat/  # Main chat interface
│   │   │   │   └── ui/               # Shared UI primitives
│   │   │   ├── stores/     # Zustand state management
│   │   │   ├── services/   # Frontend services
│   │   │   └── api/        # Tauri command wrappers
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
├── docs/                   # Project documentation
│   ├── getting-started/    # Quick start & installation
│   ├── architecture/       # System design & database docs
│   ├── development/        # Dev setup, testing, patterns
│   ├── features/           # Feature docs (MCP, chat, etc.)
│   ├── api/                # API reference & OpenAPI spec
│   ├── testing/            # Test reports & strategies
│   ├── deployment/         # Build & deploy guides
│   ├── security/           # Security documentation
│   └── archive/            # Historical documentation
├── apps/web/supabase/      # Database migrations and schema
└── Configuration files     # pnpm-workspace.yaml, tsconfig.base.json, Cargo.toml
```

### Technology Stack

**Frontend (Desktop):**

- React 19.2.3 with TypeScript 5.9.3
- Vite 7.3.1 build system with SWC
- Zustand 5.0.9 state management (with devtools, persist, subscribeWithSelector middleware)
- Radix UI primitives + Tailwind CSS 4.1.18 (CSS-first configuration)
- xterm.js 6.0.0 for terminal, Monaco Editor, @xyflow/react 12.10.0, Mermaid 11.12.2

**Frontend (Web):**

- Next.js 16.1.1 with React 19.2.3 (Turbopack default)
- Tailwind CSS 4.1.18 (CSS-first with `@import "tailwindcss"`)
- TanStack Query 5.90.16 for server state (single object API)
- Zod 4.3.5 for validation (top-level format APIs)

**Backend (Desktop):**

- Tauri 2.9 with Rust backend
- Tokio async runtime
- SQLite for local persistence
- System integrations: clipboard, keyboard shortcuts, file system, shell execution, notifications

**Backend (Services):**

- Express.js for REST API
- WebSocket (ws library) for real-time signaling
- JWT authentication
- Supabase JS 2.89.0 for database operations (unified client architecture)

**Database:**

- Supabase PostgreSQL (web) with RLS policies enabled
- SQLite (desktop) at `~/.config/agiworkforce/agiworkforce.db`

**Testing:**

- Vitest 4.0.17 for unit/component tests
- Playwright 1.57.0 for E2E tests (web-first assertions, semantic locators)

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

**Webhook Handling:**

```typescript
// Always verify webhook signatures
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);

    // Check idempotency
    if (await isProcessed(event.id)) {
      return res.json({ received: true });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
        break;
    }

    await markProcessed(event.id);
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});
```

**Webhook Idempotency:**

- Use `process_stripe_event_idempotent` database function
- Events tracked in `processed_stripe_events` table
- Check idempotency BEFORE processing, mark AFTER success

**Customer Portal Session:**

```typescript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${baseUrl}/account`,
  flow_data: {
    type: 'subscription_cancel', // Deep link to specific flow
    subscription_cancel: { subscription: subscriptionId },
  },
});
// Redirect to portalSession.url
```

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

**security_audit_logs:**

- Security event logging for compliance
- Event types: auth_failed, rate_limit_exceeded, authorization_failed, suspicious_activity
- Severity levels: info, warning, error, critical
- Auto-cleanup: 90 days retention via `cleanup_old_security_logs()` function
- Service role access only

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

### Zustand v5 State (Desktop)

**Basic Store with Middleware:**

```typescript
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { createJSONStorage } from 'zustand/middleware';

interface BearState {
  bears: number;
  increase: (by: number) => void;
}

// Use curried create<T>()(...) for proper type inference
const useBearStore = create<BearState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        bears: 0,
        increase: (by) =>
          set(
            (state) => ({ bears: state.bears + by }),
            undefined,
            'bears/increase', // Action name for DevTools
          ),
      })),
      {
        name: 'bear-store',
        storage: createJSONStorage(() => localStorage),
        version: 1, // Always version persisted state
        migrate: (state, version) => {
          // Handle state migrations
          if (version === 0) {
            // Migration logic
          }
          return state;
        },
        partialize: (state) => ({ bears: state.bears }), // Persist only specific fields
      },
    ),
    { name: 'BearStore', enabled: import.meta.env.DEV },
  ),
);

// Export selectors for reusability
export const selectBears = (state: BearState) => state.bears;
```

**Slices Pattern for Large Stores:**

```typescript
import { StateCreator } from 'zustand';

interface BearSlice {
  bears: number;
  addBear: () => void;
}
interface FishSlice {
  fishes: number;
  addFish: () => void;
}
type JungleStore = BearSlice & FishSlice;

const createBearSlice: StateCreator<JungleStore, [], [], BearSlice> = (set) => ({
  bears: 0,
  addBear: () => set((state) => ({ bears: state.bears + 1 })),
});

const createFishSlice: StateCreator<JungleStore, [], [], FishSlice> = (set) => ({
  fishes: 0,
  addFish: () => set((state) => ({ fishes: state.fishes + 1 })),
});

const useJungleStore = create<JungleStore>()((...a) => ({
  ...createBearSlice(...a),
  ...createFishSlice(...a),
}));
```

**Breaking Changes from v4:**

- Must use named imports (no default export)
- Requires React 18+ and TypeScript 4.5+
- `use-sync-external-store` is now a peer dependency

### Tauri Commands

```typescript
// Frontend: invoke('command_name', { params })
// Backend: Define in src-tauri/src/sys/commands/
```

### Code Editing API

The desktop app provides a typed API for AGI code changes with undo support:

```typescript
import { applyEdit, rejectEdit, revertChanges, getPendingEdits } from '@/api/codeEditing';

// Apply a pending edit from AGI
await applyEdit(editId);

// Reject an edit (keeps original)
await rejectEdit(editId);

// Revert all changes from a goal
const result = await revertChanges(goalId);
```

### Web API Calls

- Server Components: Direct Supabase calls
- Client Components: React Query for caching

### TanStack Query v5 (Web)

**Single Object API (Required in v5):**

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// v5 requires single object argument for all hooks
const { data, isPending, error } = useQuery({
  queryKey: ['todos', filters],
  queryFn: () => fetchTodos(filters),
  staleTime: 1000 * 60 * 5, // 5 minutes
  gcTime: 1000 * 60 * 30, // 30 minutes (renamed from cacheTime)
});

// Mutations with cache invalidation
const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: createTodo,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  },
});
```

**Suspense Hooks (Type-Safe Data):**

```tsx
import { useSuspenseQuery } from '@tanstack/react-query';

function TodoList() {
  // data is NEVER undefined - type-safe after hook returns
  const { data: todos } = useSuspenseQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  });

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}

// Wrap with Suspense and ErrorBoundary
<ErrorBoundary fallback={<Error />}>
  <Suspense fallback={<Loading />}>
    <TodoList />
  </Suspense>
</ErrorBoundary>;
```

**Query Key Factory Pattern:**

```typescript
const todoKeys = {
  all: ['todos'] as const,
  lists: () => [...todoKeys.all, 'list'] as const,
  list: (filters: string) => [...todoKeys.lists(), { filters }] as const,
  details: () => [...todoKeys.all, 'detail'] as const,
  detail: (id: number) => [...todoKeys.details(), id] as const,
};
```

### Zod v4 Patterns

**Top-Level Format APIs (New in v4):**

```typescript
import { z } from 'zod';

// v4: Use top-level format validators for better tree-shaking
const emailSchema = z.email(); // Instead of z.string().email()
const uuidSchema = z.uuid();
const urlSchema = z.url();
const dateSchema = z.iso.date();
const datetimeSchema = z.iso.datetime();

// Complex schema
const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.iso.datetime(),
});
```

**Error Handling (v4 API):**

```typescript
const result = userSchema.safeParse(data);
if (!result.success) {
  // v4: Use z.treeifyError() instead of .format() or .flatten()
  const formatted = z.treeifyError(result.error);
  console.log(formatted);
}
```

**Performance Improvements:**

- String parsing: 14.71x faster
- Array parsing: 7.43x faster
- Object parsing: 6.5x faster
- Bundle size: 2x smaller (or use `zod/mini` for 6.6x smaller)

### TypeScript 5.9 Patterns

**`satisfies` Operator (Validate Without Widening):**

```typescript
// Preserves literal types while validating shape
const config = {
  port: 3000,
  host: 'localhost',
} satisfies { port: number; host: string };

// config.port is inferred as 3000, not number
```

**Const Type Parameters:**

```typescript
// Add const modifier for literal inference without as const
function getNames<const T extends readonly string[]>(names: T): T {
  return names;
}

const names = getNames(['Alice', 'Bob']); // Type: readonly ["Alice", "Bob"]
```

**NoInfer Utility Type:**

```typescript
// Prevent type widening in specific positions
function createLight<C extends string>(colors: C[], defaultColor?: NoInfer<C>) {}

createLight(['red', 'yellow', 'green'], 'blue'); // Error! 'blue' not in colors
```

### Playwright Best Practices

**Web-First Assertions:**

```typescript
// ❌ Avoid manual assertions
expect(await page.getByText('welcome').isVisible()).toBe(true);

// ✅ Use web-first assertions with await
await expect(page.getByText('welcome')).toBeVisible();
await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
```

**Locator Patterns:**

```typescript
// Prefer semantic locators
const submitButton = page.getByRole('button', { name: 'Submit' });
const emailInput = page.getByLabel('Email');
const errorMessage = page.getByText('Invalid email');

// Use data-testid for complex cases
const customComponent = page.getByTestId('user-card');
```

**Configuration Best Practices:**

```typescript
// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI, // Fail if test.only is committed
  use: {
    trace: 'on-first-retry', // Collect traces on retry
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Supabase Patterns

**Auth State Management:**

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, anonKey);

// Listen to auth state changes
const {
  data: { subscription },
} = supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    console.log('User signed in:', session?.user.id);
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out');
  } else if (event === 'TOKEN_REFRESHED') {
    console.log('Token refreshed');
  }
});

// Cleanup on unmount
return () => subscription.unsubscribe();
```

**RLS Policy Pattern:**

```sql
-- Enable RLS
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- User can only access their own data
CREATE POLICY "Users can CRUD own todos" ON todos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**Realtime Subscriptions:**

```typescript
// Subscribe to database changes
const channel = supabase
  .channel('todos-changes')
  .on(
    'postgres_changes',
    {
      event: '*', // INSERT, UPDATE, DELETE, or *
      schema: 'public',
      table: 'todos',
      filter: `user_id=eq.${userId}`,
    },
    (payload) => {
      console.log('Change:', payload.eventType, payload.new);
    },
  )
  .subscribe();

// Cleanup
channel.unsubscribe();
```

## Debugging

- **Desktop Rust errors:** Terminal where `pnpm dev:desktop` runs
- **Desktop React errors:** Right-click for dev tools in dev mode
- **WebSocket sync:** DevTools Network tab → WS (pairing codes expire in 5 min)
- **Service health:** `GET /health` endpoint

## Modern Stack Patterns

### Tailwind CSS v4 (CSS-First Configuration)

Both desktop and web apps use Tailwind CSS v4.1+ with the new CSS-first configuration:

```css
/* Use @import instead of @tailwind directives */
@import 'tailwindcss';

/* Define custom theme in CSS with @theme block */
@theme {
  /* Custom fonts */
  --font-display: 'Satoshi', 'sans-serif';

  /* Use OKLCH for perceptually uniform colors */
  --color-brand: oklch(0.6 0.2 250);
  --color-accent: oklch(0.72 0.11 178);

  /* Custom breakpoints */
  --breakpoint-3xl: 120rem;

  /* Custom easing functions */
  --ease-fluid: cubic-bezier(0.3, 0, 0, 1);
}

/* Use @plugin for plugins */
@plugin "tailwindcss-animate";

/* Use @source for content detection with exclusions */
@source "../components/**/*.{ts,tsx}";
@source not "../../public";
```

**Key Changes from v3:**

- No `tailwind.config.js` needed - all configuration in CSS
- `shadow-sm` → `shadow-xs`, `rounded-sm` → `rounded-xs`, `blur-sm` → `blur-xs`
- Buttons no longer have `cursor: pointer` by default
- Requires Node.js 20+ and modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+)
- PostCSS uses `@tailwindcss/postcss` plugin
- Vite uses `@tailwindcss/vite` plugin

**Migration:** Run `npx @tailwindcss/upgrade` to auto-migrate from v3.

### React 19 Patterns

**Forms with useActionState and useFormStatus:**

```tsx
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? 'Submitting...' : 'Submit'}</button>;
}

function Form() {
  const [state, submitAction, isPending] = useActionState(
    async (prev, formData) => {
      const error = await updateData(formData.get('name'));
      if (error) return { error };
      redirect('/success');
      return { success: true };
    },
    { success: false, error: null },
  );

  return (
    <form action={submitAction}>
      <input name="name" />
      <SubmitButton />
      {state.error && <p className="text-red-500">{state.error}</p>}
    </form>
  );
}
```

**Optimistic Updates with useOptimistic:**

```tsx
import { useOptimistic } from 'react';

function TodoItem({ todo, onUpdate }) {
  const [optimisticTodo, setOptimisticTodo] = useOptimistic(todo);

  const handleToggle = async () => {
    setOptimisticTodo({ ...todo, completed: !todo.completed }); // Show immediately
    await onUpdate({ ...todo, completed: !todo.completed }); // Reverts on failure
  };

  return (
    <div>
      {optimisticTodo.completed ? '✓' : '○'} {optimisticTodo.title}
    </div>
  );
}
```

**Ref as Prop (React 19 - no forwardRef needed):**

```tsx
// React 19: ref is just a prop - forwardRef is deprecated
function Input({ ref, label, ...props }: { ref?: React.Ref<HTMLInputElement>; label: string }) {
  return (
    <label>
      {label}
      <input ref={ref} {...props} />
    </label>
  );
}
```

**Ref Callback Cleanup:**

```tsx
// React 19: ref callbacks can return cleanup functions
<div
  ref={(node) => {
    console.log('Attached', node);
    return () => console.log('Cleanup', node); // Called on unmount
  }}
/>
```

**Breaking Changes:**

- `ReactDOM.render` removed → use `createRoot` from `react-dom/client`
- `PropTypes` removed → use TypeScript interfaces
- `defaultProps` deprecated → use ES6 default parameters
- Access ref via `element.props.ref` not `element.ref`

### Next.js 16 Patterns

**Turbopack is Now Default:**

- No `--turbopack` flag needed - it's automatic for both `next dev` and `next build`

**Server Components with Direct Data Fetching:**

```tsx
// app/posts/page.tsx - Server Component (default)
async function getPosts() {
  const res = await fetch('https://api.example.com/posts');
  return res.json();
}

export default async function PostsPage() {
  const posts = await getPosts(); // Direct async/await in component
  return <PostList posts={posts} />;
}
```

**Server Actions with Form Component:**

```tsx
import Form from 'next/form';
import { redirect } from 'next/navigation';

export default function ContactPage() {
  async function handleSubmit(formData: FormData) {
    'use server';
    await saveContact(formData);
    redirect('/thank-you');
  }

  return (
    <Form action={handleSubmit}>
      <input name="email" type="email" required />
      <button type="submit">Subscribe</button>
    </Form>
  );
}
```

**New Caching APIs (16.1+):**

```tsx
import { cacheLife, cacheTag } from 'next/cache';

async function getProduct(id: string) {
  'use cache';
  cacheLife('hours'); // Predefined: seconds, minutes, hours, days, weeks, max
  cacheTag(`product-${id}`); // Tag-based invalidation
  return fetchProduct(id);
}
```

### Vite 7 Patterns

**Breaking Changes from Vite 6:**

- Requires Node.js 20.19+ or 22.12+
- Default `build.target` changed to `'baseline-widely-available'`
- `optimizeDeps.entries` now treats all values as glob patterns

**Environment API for Plugins:**

```typescript
export function myPlugin(): Plugin {
  return {
    name: 'my-plugin',
    transform(code, id) {
      // Check for SSR environment (replaces deprecated options.ssr)
      const isSSR = this.environment.config.consumer === 'server';
      if (isSSR) {
        // SSR-specific transforms
      }
    },
  };
}
```

**HMR Best Practice:**

```typescript
// Always guard HMR code for tree-shaking in production
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // Handle hot update
  });
}
```

### Tauri 2.x Permissions (ACL System)

Capabilities are defined in `src-tauri/capabilities/default.json`:

```json
{
  "permissions": ["core:default"]
}
```

**Fine-Grained Scope Configuration:**

```json
{
  "permissions": [
    {
      "identifier": "fs:read",
      "allow": [{ "path": "$HOME/Documents/**" }],
      "deny": [{ "path": "$HOME/Documents/secret.txt" }]
    }
  ]
}
```

**Key Concepts:**

- `core:default` contains all default permissions of core plugins
- Deny rules take precedence over allow rules
- Use `core:*` prefix for core plugins
- Window-scoped permissions supported for multiwindow apps
- Mobile support available (iOS/Android) with Swift/Kotlin bindings

## Rust & Tokio Patterns (Tauri Backend)

### Error Handling

**Use `Result<T, E>` with `?` Operator:**

```rust
use std::error::Error;

fn process_file(path: &str) -> Result<String, Box<dyn Error>> {
    let contents = std::fs::read_to_string(path)?;  // ? propagates errors
    let parsed = parse_contents(&contents)?;
    Ok(parsed)
}
```

**Custom Error Types (with thiserror):**

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid input: {message}")]
    InvalidInput { message: String },
}
```

### Tokio Async Patterns

**Task Spawning:**

```rust
// Async tasks (I/O-bound)
tokio::spawn(async move {
    let result = fetch_data().await;
    // Handle result
});

// Blocking tasks (CPU-bound) - runs on dedicated thread pool
tokio::task::spawn_blocking(|| {
    heavy_computation()
});
```

**Channels for Task Communication:**

```rust
use tokio::sync::mpsc;

let (tx, mut rx) = mpsc::channel(32);

// Sender (can be cloned for multiple producers)
tokio::spawn(async move {
    tx.send("message").await.unwrap();
});

// Receiver
while let Some(msg) = rx.recv().await {
    println!("Received: {}", msg);
}
```

**Shared State with Arc<Mutex>:**

```rust
use std::sync::Arc;
use tokio::sync::Mutex;

let state = Arc::new(Mutex::new(AppState::default()));
let state_clone = Arc::clone(&state);

tokio::spawn(async move {
    let mut guard = state_clone.lock().await;
    guard.update();
});
```

**Select for Concurrent Operations:**

```rust
tokio::select! {
    result = async_operation_1() => {
        // Handle first completion
    }
    result = async_operation_2() => {
        // Handle second completion
    }
}
```

### Ownership Best Practices

- Return owned types (`String`) instead of references to local variables
- Use `Arc` for shared ownership across async tasks
- Prefer `&str` parameters, return `String` when creating new data
- Use `Clone` sparingly - prefer borrowing when possible

## Vercel Deployment Patterns

### Next.js Configuration

**Edge Runtime (App Router):**

```typescript
// app/api/route.ts
export const runtime = 'edge';
export const preferredRegion = ['iad1', 'sfo1'];
export const dynamic = 'force-dynamic'; // Disable caching
export const maxDuration = 30; // Max execution time
```

**Environment Variables:**

```json
// vercel.json
{
  "env": {
    "DATABASE_URL": "@database-url",
    "API_KEY": "@api-key"
  }
}
```

- Use `@` prefix for Vercel secrets
- Target specific environments: `production`, `preview`, `development`
- Sensitive variables use `sensitive` type for enhanced security

### Build Optimization

**Turborepo Configuration:**

```json
// turbo.json
{
  "tasks": {
    "build": {
      "outputs": [".next/**", "!.next/cache/**", ".vercel/**"]
    }
  }
}
```

**Image Optimization:**

```json
// config.json (Build Output API)
{
  "images": {
    "sizes": [640, 750, 828, 1080, 1200],
    "formats": ["image/avif", "image/webp"],
    "minimumCacheTTL": 60
  }
}
```

## Vercel AI SDK 5.0 Patterns

### Streaming with useChat

```tsx
import { useChat } from '@ai-sdk/react';

function Chat() {
  const { messages, sendMessage, status, stop, reload } = useChat({
    api: '/api/chat',
    onError: (error) => console.error(error),
  });

  return (
    <div>
      {messages.map((m) => (
        <Message key={m.id} message={m} />
      ))}
      {status === 'streaming' && <button onClick={stop}>Stop</button>}
    </div>
  );
}
```

### Server-Side Streaming

```typescript
import { streamText, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    sendSources: true,
  });
}
```

### AI Agents with Tools

```typescript
import { ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions: 'You are a research assistant.',
  tools: {
    search: tool({
      description: 'Search for information',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => fetchResults(query),
    }),
  },
  stopWhen: stepCountIs(10),
});

// Streaming execution
for await (const chunk of agent.stream({ prompt: 'Research topic X' }).textStream) {
  process.stdout.write(chunk);
}
```

## Claude Code Integration

### CLAUDE.md Best Practices

This file (`CLAUDE.md`) provides project-specific instructions to Claude Code:

- Place at project root for automatic loading
- Include coding standards, architecture decisions, common commands
- Instructions override default Claude Code behavior
- Use markdown formatting for readability

### Hooks System

Configure hooks in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 validate_command.py",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [],
    "UserPromptSubmit": []
  }
}
```

**Hook Types:**

- `SessionStart` - Session initialization
- `PreToolUse` - Before tool execution (with matcher patterns)
- `PostToolUse` - After tool completion
- `UserPromptSubmit` - When user submits prompt

### MCP Server Configuration

```json
// .mcp.json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["./servers/my-server.js"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

### Skills System

**Skill Structure:**

```
my-skill/
├── SKILL.md           # Required: YAML frontmatter + instructions
├── scripts/           # Optional: Executable code
├── references/        # Optional: Documentation
└── assets/            # Optional: Templates, resources
```

**SKILL.md Format:**

```markdown
---
name: my-skill
description: Clear description of what this skill does and when to use it
---

# My Skill

Instructions that Claude follows when this skill is active.

## Examples

- Example usage scenarios
```

**Key Principles:**

- Description is the primary trigger - include all "when to use" context
- Only `name` and `description` in YAML frontmatter
- Use progressive disclosure (lean core, detailed references)
- Package with: `scripts/package_skill.py <skill-folder>`

## Desktop App Component Patterns

### Monaco Editor (Code Editing)

```tsx
import Editor, { DiffEditor, useMonaco } from '@monaco-editor/react';

// Basic editor
<Editor
  height="400px"
  defaultLanguage="typescript"
  defaultValue="// code here"
  theme="vs-dark"
  options={{ minimap: { enabled: false }, fontSize: 14 }}
  beforeMount={(monaco) => {
    // Configure TypeScript, add custom themes, register languages
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      strict: true,
    });
  }}
  onMount={(editor, monaco) => {
    // Editor is ready
  }}
/>

// Diff editor for code comparison
<DiffEditor
  original={originalCode}
  modified={modifiedCode}
  language="typescript"
  theme="vs-dark"
/>
```

**Best Practices:**

- Use `beforeMount` for configuration before editor loads
- Use `defaultPath` for multi-file support with unique URIs
- `saveViewState={true}` preserves scroll position when switching files

### xterm.js (Terminal Emulation)

```tsx
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';

// Initialize in useEffect
const terminal = new Terminal({ scrollback: 10000 });
const fitAddon = new FitAddon();
const searchAddon = new SearchAddon();

terminal.loadAddon(fitAddon);
terminal.loadAddon(new WebglAddon()); // GPU acceleration
terminal.loadAddon(new WebLinksAddon()); // Clickable URLs
terminal.loadAddon(searchAddon);

terminal.open(containerRef.current);
fitAddon.fit();

// Cleanup on unmount
return () => terminal.dispose();
```

**Addons:**

- `FitAddon` - Responsive sizing (call `fit()` on resize)
- `WebglAddon` - GPU-accelerated rendering
- `SearchAddon` - Text search with `findNext()`/`findPrevious()`
- `WebLinksAddon` - Auto-linkify URLs

### React Flow (Node-Based Diagrams)

```tsx
import { ReactFlow, useNodesState, useEdgesState, addEdge, Handle, Position } from '@xyflow/react';

// Custom node component
function CustomNode({ data }) {
  return (
    <div className="custom-node">
      <Handle type="target" position={Position.Top} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// Define nodeTypes OUTSIDE component or useMemo to prevent re-renders
const nodeTypes = { custom: CustomNode };

function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      fitView
    >
      <Controls />
      <MiniMap />
      <Background />
    </ReactFlow>
  );
}
```

### Framer Motion (Animations)

```tsx
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';

// Basic animation with initial, animate, exit states
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
  transition={{ duration: 0.3, ease: 'easeOut' }}
>
  Content
</motion.div>

// AnimatePresence for exit animations (required for unmount animations)
<AnimatePresence mode="wait">
  {isVisible && (
    <motion.div
      key="modal"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      Modal content
    </motion.div>
  )}
</AnimatePresence>

// Gesture animations
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  whileFocus={{ boxShadow: '0 0 0 2px blue' }}
>
  Interactive Button
</motion.button>

// Layout animations (automatic position/size changes)
<motion.div layout layoutId="shared-element">
  {expanded ? <ExpandedContent /> : <CollapsedContent />}
</motion.div>

// Spring physics
const springValue = useSpring(0, { stiffness: 300, damping: 30 });
const scale = useTransform(springValue, [0, 1], [0.8, 1.2]);
```

**Variants for Orchestrated Animations:**

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }, // Stagger child animations
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

<motion.ul variants={containerVariants} initial="hidden" animate="visible">
  {items.map((item) => (
    <motion.li key={item.id} variants={itemVariants}>
      {item.name}
    </motion.li>
  ))}
</motion.ul>;
```

**Performance Tips:**

- Use `layoutId` for shared element transitions between components
- Prefer `transform` properties (x, y, scale, rotate) over layout properties (width, height)
- Use `useReducedMotion()` hook to respect user preferences
- Set `layout="position"` for position-only animations (faster than full layout)

### Virtualization (react-window + AutoSizer)

For large lists (100+ items), use virtualization to render only visible items:

```tsx
import { FixedSizeList, VariableSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

// Fixed-size rows (all same height)
function VirtualizedList({ items }) {
  const Row = ({ index, style }) => (
    <div style={style} className="list-item">
      {items[index].name}
    </div>
  );

  return (
    <AutoSizer>
      {({ height, width }) => (
        <FixedSizeList
          height={height}
          width={width}
          itemCount={items.length}
          itemSize={50} // Row height in pixels
        >
          {Row}
        </FixedSizeList>
      )}
    </AutoSizer>
  );
}

// Variable-size rows (dynamic heights)
function VariableList({ items }) {
  const getItemSize = (index) => (items[index].expanded ? 150 : 50);

  return (
    <AutoSizer>
      {({ height, width }) => (
        <VariableSizeList
          height={height}
          width={width}
          itemCount={items.length}
          itemSize={getItemSize}
          estimatedItemSize={50} // Helps with scrollbar calculation
        >
          {Row}
        </VariableSizeList>
      )}
    </AutoSizer>
  );
}
```

**Best Practices:**

- Always wrap in `AutoSizer` for responsive sizing
- Use `overscanCount={5}` to pre-render items outside viewport (smoother scrolling)
- For chat/messages: use `VariableSizeList` with `estimatedItemSize`
- Reset item sizes on data change: `listRef.current?.resetAfterIndex(0)`

### Recharts (Data Visualization)

```tsx
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Always wrap in ResponsiveContainer for responsive sizing
function UsageChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip
          contentStyle={{ background: '#1f2937', border: 'none' }}
          labelStyle={{ color: '#9ca3af' }}
        />
        <Legend />
        <Area type="monotone" dataKey="tokens" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Composable multi-series chart
<LineChart data={data}>
  <Line type="monotone" dataKey="cost" stroke="#82ca9d" dot={false} />
  <Line type="monotone" dataKey="budget" stroke="#ff7300" strokeDasharray="5 5" />
</LineChart>;
```

**Custom Tooltips:**

```tsx
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 p-2 rounded shadow">
      <p className="text-gray-400">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
};

<Tooltip content={<CustomTooltip />} />;
```

**Performance Tips:**

- Use `animationDuration={0}` for frequently updating data
- Set `isAnimationActive={false}` for real-time charts
- Use `dot={false}` on Line/Area for large datasets

### React Router v7 (Routing)

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router';

const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Home },
      {
        path: 'projects/:id',
        loader: async ({ params }) => fetchProject(params.id), // Data loading
        action: async ({ request }) => {
          // Form handling
          const formData = await request.formData();
          return updateProject(formData);
        },
        Component: Project,
      },
      {
        path: 'settings',
        lazy: async () => {
          // Code splitting
          const { Settings } = await import('./Settings');
          return { Component: Settings };
        },
      },
    ],
  },
]);

// In component
function Project() {
  const data = useLoaderData(); // Access loader data
  const actionData = useActionData(); // Access action result
  const navigation = useNavigation(); // Track navigation state

  if (navigation.state === 'loading') return <Spinner />;
  return <div>{data.name}</div>;
}
```

**Key Features (v7):**

- Native async/await support in loaders and actions
- Automatic revalidation after mutations
- `useNavigation()` for pending UI states
- Lazy loading with `lazy` property

## AI Provider API Patterns

### Anthropic Claude API

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Basic streaming
const stream = await client.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
    process.stdout.write(chunk.delta.text);
  }
}

// Tool use
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  tools: [
    {
      name: 'get_weather',
      description: 'Get current weather for a location',
      input_schema: {
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location'],
      },
    },
  ],
  messages: [{ role: 'user', content: 'Weather in SF?' }],
});

// Check for tool use
if (response.stop_reason === 'tool_use') {
  const toolUse = response.content.find((c) => c.type === 'tool_use');
  // Execute tool, then send tool_result back
}
```

### OpenAI API

```typescript
import OpenAI from 'openai';

const client = new OpenAI();

// Streaming with event handlers
const stream = client.chat.completions.stream({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});

stream
  .on('content.delta', ({ delta }) => process.stdout.write(delta))
  .on('finalMessage', (message) => console.log('Done:', message));

// Function calling with runTools (auto-executes tools)
const runner = client.chat.completions.runTools({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Weather in NYC?' }],
  tools: [
    {
      type: 'function',
      function: {
        function: getWeather, // Actual function reference
        parameters: { type: 'object', properties: { location: { type: 'string' } } },
      },
    },
  ],
});

const result = await runner.finalContent();
```

**Zod Integration for Type-Safe Tools:**

```typescript
import { zodResponseFormat } from 'openai/helpers/zod';

const WeatherSchema = z.object({
  temperature: z.number(),
  conditions: z.string(),
});

const response = await client.chat.completions.parse({
  model: 'gpt-4o',
  messages: [...],
  response_format: zodResponseFormat(WeatherSchema, 'weather'),
});

console.log(response.choices[0].message.parsed);  // Type-safe!
```

## Express.js 5.x Patterns (API Gateway)

### Native Async/Await Support

Express 5.x automatically catches promise rejections - no wrapper needed:

```typescript
// Express 5.x: async handlers work directly
app.get('/users/:id', async (req, res) => {
  const user = await db.getUser(req.params.id); // Rejections auto-caught
  res.json(user);
});

// No need for express-async-handler or try/catch wrappers
app.post('/users', async (req, res) => {
  const user = await db.createUser(req.body);
  res.status(201).json(user);
});
```

### Path Parameter Changes

```typescript
// Express 5.x: Optional and repeated params have new syntax
// Optional parameter: use {param}? instead of :param?
app.get('/users/{id}?', handler); // id is optional

// Repeated parameter: use * for wildcards
app.get('/files/*path', handler); // matches /files/a/b/c

// Named groups with regex
app.get('/users/:id(\\d+)', handler); // id must be digits
```

### Error Handling

```typescript
// Error handler signature unchanged but async errors auto-propagated
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);

  // Operational errors (expected)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Programming errors (unexpected)
  res.status(500).json({ error: 'Internal server error' });
});

// Custom error class
class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

// Throw from async handlers - automatically caught
app.get('/protected', async (req, res) => {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  res.json({ data: 'secret' });
});
```

### Removed/Changed Features (Breaking Changes)

```typescript
// ❌ Removed: app.del() - use app.delete()
// ❌ Removed: res.send(status) - use res.sendStatus(status)
// ❌ Removed: res.send(status, body) - use res.status(status).send(body)
// ❌ Removed: Built-in body-parser - use express.json() middleware

// ✅ Required middleware for JSON/form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Correct patterns
app.delete('/users/:id', handler);
res.sendStatus(204);
res.status(400).json({ error: 'Bad request' });
```

### Request Body Validation Pattern

```typescript
import { z } from 'zod';

// Middleware factory for validation
const validate =
  <T>(schema: z.ZodSchema<T>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: z.treeifyError(result.error) });
    }
    req.body = result.data;
    next();
  };

// Usage
const CreateUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
});

app.post('/users', validate(CreateUserSchema), async (req, res) => {
  // req.body is typed and validated
  const user = await db.createUser(req.body);
  res.status(201).json(user);
});
```

## UI Component Patterns

### Radix UI Primitives

Radix provides accessible, unstyled React primitives. Key patterns:

**Composition with `asChild`:**

```tsx
import * as Dialog from '@radix-ui/react-dialog';

// asChild merges props onto child element
<Dialog.Trigger asChild>
  <button className="custom-button">Open</button>
</Dialog.Trigger>;
```

**Dialog Pattern:**

```tsx
import * as Dialog from '@radix-ui/react-dialog';
import { Cross1Icon } from '@radix-ui/react-icons';

function Modal({ children, trigger }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-6">
          {children}
          <Dialog.Close asChild>
            <button aria-label="Close">
              <Cross1Icon />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

**Controlled vs Uncontrolled:**

```tsx
// Uncontrolled (internal state)
<Dialog.Root defaultOpen={false}>

// Controlled (external state)
const [open, setOpen] = useState(false);
<Dialog.Root open={open} onOpenChange={setOpen}>
```

**Focus Management:**

```tsx
<Dialog.Content
  onOpenAutoFocus={(e) => {
    e.preventDefault(); // Prevent default focus
    customInputRef.current?.focus();
  }}
  onCloseAutoFocus={(e) => {
    e.preventDefault();
    triggerRef.current?.focus();
  }}
>
```

**Accessibility:**

- All primitives handle `aria` and `role` attributes automatically
- Keyboard navigation built-in (Tab, Arrow keys, Escape)
- Use `VisuallyHidden` for screen-reader-only content

### cmdk (Command Palette)

```tsx
import { Command } from 'cmdk';

function CommandMenu() {
  const [open, setOpen] = useState(false);

  // Cmd+K / Ctrl+K to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command Menu">
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Actions">
          <Command.Item
            keywords={['create', 'new']} // Invisible search aliases
            onSelect={() => {
              /* action */ setOpen(false);
            }}
          >
            New Document
          </Command.Item>
        </Command.Group>

        <Command.Separator />

        <Command.Group heading="Settings">
          <Command.Item>Preferences</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```

**Configuration:**

```tsx
<Command
  loop={true} // Loop navigation at list ends
  filter={(value, search) => {
    // Custom filtering (0-1 score)
    if (value.includes(search)) return 1;
    return 0;
  }}
/>
```

### Sonner (Toast Notifications)

```tsx
import { Toaster, toast } from 'sonner';

// Add Toaster to app root
function App() {
  return (
    <>
      <Toaster
        position="bottom-right"
        richColors // Enhanced success/error colors
        closeButton // Show close button
        theme="dark" // 'light', 'dark', 'system'
        duration={3000} // Default duration in ms
      />
      <YourApp />
    </>
  );
}

// Usage patterns
toast('Default notification');
toast.success('Data saved successfully');
toast.error('Failed to save', { description: error.message });

// Promise-based (loading → success/error)
toast.promise(saveData(), {
  loading: 'Saving...',
  success: (data) => `Saved ${data.name}`,
  error: (err) => `Error: ${err.message}`,
});

// Manual loading state
const toastId = toast.loading('Uploading...');
await upload();
toast.success('Uploaded!', { id: toastId }); // Updates existing toast

// With action button
toast('File deleted', {
  action: {
    label: 'Undo',
    onClick: () => restoreFile(),
  },
});

// Dismiss programmatically
toast.dismiss(toastId); // Specific toast
toast.dismiss(); // All toasts
```

### CVA (Class Variance Authority)

Type-safe variant-based styling:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';

const button = cva(
  // Base classes (always applied)
  ['font-semibold', 'rounded', 'transition-colors'],
  {
    variants: {
      intent: {
        primary: 'bg-blue-500 text-white hover:bg-blue-600',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        danger: 'bg-red-500 text-white hover:bg-red-600',
      },
      size: {
        sm: 'text-sm py-1 px-2',
        md: 'text-base py-2 px-4',
        lg: 'text-lg py-3 px-6',
      },
      disabled: {
        true: 'opacity-50 cursor-not-allowed',
        false: '',
      },
    },
    // Applied when multiple conditions match
    compoundVariants: [
      {
        intent: 'primary',
        disabled: false,
        className: 'shadow-md',
      },
    ],
    defaultVariants: {
      intent: 'primary',
      size: 'md',
      disabled: false,
    },
  },
);

// TypeScript: Extract variant props type
type ButtonProps = VariantProps<typeof button> & {
  children: React.ReactNode;
};

function Button({ intent, size, disabled, children }: ButtonProps) {
  return <button className={button({ intent, size, disabled })}>{children}</button>;
}

// Usage
<Button intent="secondary" size="lg">
  Click Me
</Button>;
```

## Markdown & Diagram Rendering

### react-markdown with Plugins

```tsx
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={{
        // Custom code block with syntax highlighting
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';

          return language ? (
            <SyntaxHighlighter language={language} style={dark}>
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        // Custom link handling
        a({ href, children }) {
          const isExternal = href?.startsWith('http');
          return (
            <a
              href={href}
              target={isExternal ? '_blank' : undefined}
              rel={isExternal ? 'noopener noreferrer' : undefined}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </Markdown>
  );
}
```

**Common Plugins:**

- `remark-gfm` - GitHub Flavored Markdown (tables, strikethrough, task lists)
- `remark-math` - Parse LaTeX math expressions
- `rehype-katex` - Render math with KaTeX
- `rehype-highlight` - Syntax highlighting

### Mermaid Diagrams

```tsx
import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

// Initialize once at app startup
mermaid.initialize({
  startOnLoad: false, // Important for React
  theme: 'dark',
  securityLevel: 'strict',
  flowchart: { curve: 'basis', htmlLabels: true },
  sequence: { showSequenceNumbers: true },
});

function MermaidDiagram({ chart, id }: { chart: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const render = async () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '';
      try {
        const { svg } = await mermaid.render(id, chart);
        containerRef.current.innerHTML = svg;
      } catch (error) {
        console.error('Mermaid error:', error);
        containerRef.current.innerHTML = '<pre>Invalid diagram</pre>';
      }
    };
    render();
  }, [chart, id]);

  return <div ref={containerRef} />;
}
```

**Flowchart Syntax:**

```
flowchart LR
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E

    subgraph Process
        C
        D
    end
```

**Sequence Diagram Syntax:**

```
sequenceDiagram
    autonumber
    Alice->>+Bob: Hello
    Bob-->>-Alice: Hi!
    loop Health Check
        Bob->>Bob: Check status
    end
    Note over Alice,Bob: Communication complete
```

## State Management Utilities

### Immer with Zustand

```tsx
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface TodoState {
  todos: { id: string; text: string; done: boolean }[];
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
}

const useTodoStore = create<TodoState>()(
  immer((set) => ({
    todos: [],

    addTodo: (text) =>
      set((state) => {
        // Direct mutation is safe with Immer
        state.todos.push({ id: crypto.randomUUID(), text, done: false });
      }),

    toggleTodo: (id) =>
      set((state) => {
        const todo = state.todos.find((t) => t.id === id);
        if (todo) todo.done = !todo.done;
      }),

    removeTodo: (id) =>
      set((state) => {
        const index = state.todos.findIndex((t) => t.id === id);
        if (index !== -1) state.todos.splice(index, 1);
      }),
  })),
);
```

**Immer Best Practices:**

- Pull `produce` calls upward - avoid calling inside loops
- Use `original(draft)` for expensive searches on large arrays
- Don't mix mutations and returns in the same producer

### Fuse.js (Fuzzy Search)

```tsx
import Fuse from 'fuse.js';

const items = [
  { title: 'Old Man War', author: 'John Scalzi', tags: ['fiction'] },
  { title: 'The Lock Artist', author: 'Steve Hamilton', tags: ['thriller'] },
];

const fuse = new Fuse(items, {
  keys: [
    { name: 'title', weight: 2 }, // Higher weight = more important
    { name: 'author', weight: 1 },
    'tags', // Default weight of 1
  ],
  threshold: 0.4, // 0 = exact, 1 = match anything
  ignoreLocation: true, // Match anywhere in string
  includeScore: true, // Include relevance score
  includeMatches: true, // Include match indices
});

const results = fuse.search('old war');
// [{ item: {...}, score: 0.1, matches: [...] }]

// Extended search operators (with useExtendedSearch: true)
// 'fiction     - include match
// =fiction     - exact match
// !fiction     - exclude
// ^old         - starts with
// .war$        - ends with
```

## Date & Time Utilities (date-fns)

```tsx
import {
  format,
  formatDistance,
  parseISO,
  addDays,
  subDays,
  differenceInDays,
  isAfter,
  isBefore,
} from 'date-fns';

// Formatting - USE LOWERCASE tokens for calendar dates
format(new Date(), 'yyyy-MM-dd'); // '2024-01-26'
format(new Date(), 'MMM d, yyyy h:mm a'); // 'Jan 26, 2024 2:30 PM'
format(new Date(), 'EEEE'); // 'Friday'

// ⚠️ WRONG: YYYY/DD are week-year/day-of-year
// format(new Date(), 'YYYY-MM-DD');  // Don't do this!

// Relative time
formatDistance(subDays(new Date(), 3), new Date(), { addSuffix: true });
// '3 days ago'

// Manipulation
addDays(new Date(), 7); // Date + 7 days
subDays(new Date(), 7); // Date - 7 days

// Comparison
differenceInDays(date1, date2); // Number of days between
isAfter(date1, date2); // date1 > date2
isBefore(date1, date2); // date1 < date2

// Parsing ISO strings
const date = parseISO('2024-01-26T10:30:00Z');
```

## Utility Libraries

### clsx + tailwind-merge (The `cn` Pattern)

The standard pattern for conditional class names with Tailwind conflict resolution:

```tsx
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Usage in Components:**

```tsx
import { cn } from '@/lib/utils';

function Button({ className, variant, disabled, children }) {
  return (
    <button
      className={cn(
        // Base styles
        'px-4 py-2 rounded font-medium transition-colors',
        // Variant styles (conditional)
        variant === 'primary' && 'bg-blue-500 text-white hover:bg-blue-600',
        variant === 'secondary' && 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        // State styles
        disabled && 'opacity-50 cursor-not-allowed',
        // External classes override (last wins in conflicts)
        className,
      )}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// Usage - external classes override internal ones
<Button className="px-8" variant="primary">
  Wide Button
</Button>;
// px-8 overrides px-4 due to tailwind-merge
```

**When to use which:**

- `cn()` - When accepting external `className` prop (conflict resolution needed)
- `twJoin()` - Internal-only classes (no conflicts, better performance)
- `clsx()` - Non-Tailwind conditional classes

### DOMPurify (HTML Sanitization)

Prevent XSS attacks when rendering user-generated HTML:

```tsx
import DOMPurify from 'dompurify';

// Basic sanitization
const clean = DOMPurify.sanitize(dirty);

// Strict allowlist
const strictClean = DOMPurify.sanitize(userHtml, {
  ALLOWED_TAGS: ['p', 'b', 'i', 'a', 'ul', 'ol', 'li', 'br'],
  ALLOWED_ATTR: ['href', 'class'],
  ALLOW_DATA_ATTR: false,
});

// With hooks for link handling
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if ('target' in node) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Render in React
function SafeHtml({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'b', 'i', 'a', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'class'],
  });
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

**Configuration Options:**

| Option            | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `ALLOWED_TAGS`    | Whitelist specific tags                                              |
| `ALLOWED_ATTR`    | Whitelist specific attributes                                        |
| `FORBID_TAGS`     | Blacklist specific tags                                              |
| `FORBID_ATTR`     | Blacklist specific attributes                                        |
| `ALLOW_DATA_ATTR` | Allow/block all `data-*` attributes                                  |
| `USE_PROFILES`    | Restrict to `{ html: true }`, `{ svg: true }`, or `{ mathMl: true }` |
| `KEEP_CONTENT`    | Keep text content when removing forbidden elements                   |

## Logging & Error Monitoring

### Pino (Structured Logging)

```typescript
import pino from 'pino';

// Development with pretty printing
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

// Production - JSON output
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { env: process.env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ severity: label.toUpperCase() }),
  },
});

// Child loggers for request context
app.use((req, res, next) => {
  req.log = logger.child({
    requestId: req.headers['x-request-id'],
    userId: req.user?.id,
  });
  next();
});

// Logging patterns
logger.info({ userId: 123 }, 'User logged in');
logger.error({ err, orderId }, 'Order processing failed');
```

### Sentry (Error Monitoring)

```tsx
import * as Sentry from '@sentry/react';

// Initialize at app startup
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,
  tracesSampleRate: 0.1, // 10% of transactions
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ sessionSampleRate: 0.1 }),
  ],
  beforeSend(event) {
    // Scrub PII
    if (event.user) delete event.user.ip_address;
    return event;
  },
});

// Error boundary
function App() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <YourApp />
    </Sentry.ErrorBoundary>
  );
}

// Manual error capture with context
try {
  await processOrder(orderId);
} catch (error) {
  Sentry.captureException(error, {
    tags: { orderId, stage: 'checkout' },
    extra: { cartItems: cart.items },
  });
}

// Breadcrumbs for user journey tracking
Sentry.addBreadcrumb({
  category: 'ui',
  message: 'User clicked checkout',
  level: 'info',
});
```

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

**IMPORTANT: MCP is hidden from users.** Users never see "MCP servers" or configure them manually. They simply ask for things ("search my email", "check my calendar") and the system uses MCP tools behind the scenes.

**Technical Details (for developers only):**

- Tool IDs follow format: `mcp__{server_name}__{tool_name}` (exactly two underscores)
- Servers auto-start based on detected user intent
- Credentials stored in OS keyring via `mcp_set_credential(server_name, key, value)`
- User-facing errors should never mention "MCP" - translate to plain English

### MCP Server Development (TypeScript SDK)

**Server Structure:**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });

// Register a tool
server.registerTool(
  'search',
  {
    description: 'Search for information',
    inputSchema: { query: z.string().describe('Search query') },
  },
  async ({ query }) => ({
    content: [{ type: 'text', text: `Results for: ${query}` }],
  }),
);

// Register a resource
server.registerResource(
  'user-profile',
  new ResourceTemplate('users://{userId}/profile', { list: undefined }),
  { description: 'User profile data' },
  async (uri, { userId }) => ({
    contents: [{ uri: uri.href, text: JSON.stringify(userData) }],
  }),
);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Transport Options:**

- `StdioServerTransport` - Local spawned processes (CLI tools)
- `StreamableHTTPServerTransport` - Remote/web servers (recommended for HTTP)
- Legacy HTTP+SSE - Backwards compatibility

## AGI Reasoning Loop

The AGI operates with **full autonomy** - it completes goals without asking for approval at each step. Safety comes from **reversibility**, not permission prompts.

**Safety Limits:**

- **Max iterations:** 1000 iterations per goal
- **Absolute timeout:** 5 minutes (300 seconds)
- **Consecutive failure limit:** 3 failures triggers goal abandonment

**Undo System (CRITICAL):**

Every action the AGI takes must be reversible. Before implementing any new tool or action:

1. Define how to undo/rollback the action
2. Store the "before" state so it can be restored
3. Provide user-friendly undo via chat ("undo that", "revert the last change")

Examples:

- File edit → Store original content, can restore
- Browser form submit → May not be reversible (warn user before acting)
- Email send → Not reversible (this is an exception requiring confirmation)

**Events:** `agi:goal:timeout`, `agi:goal:max_iterations`, `agi:goal:cancelled`

## Plan Tier Hierarchy

**Business Model: Subscription + Usage**

Users pay AGI Workforce directly (managed proxy model). We handle all LLM API billing - users never need their own OpenAI/Anthropic keys.

- Base subscription fee per tier
- Usage-based overage for heavy users
- Token tracking in cents for precise billing

**Tiers (lowest to highest):**

1. `free` (0) - Limited trial
2. `hobby` (1) - $3.50/month base
3. `pro` (2) - $12/month base
4. `max` (3) - $150/month base
5. `enterprise` (4) - Custom pricing

Use `hasPlan(tier)` to check if user has at least the required tier.

## Important Notes

- **Environment files:** Never commit `.env.local` - use `.env.example` templates in `apps/desktop/`, `apps/web/`, `services/api-gateway/`
- **Database migrations:** Write SQL in `apps/web/supabase/migrations/`
- **Pre-commit hooks:** Auto-fix formatting/linting via Husky
- **Monorepo commands:** Use `--filter` for specific packages, `pnpm -r` for all
- **Pinned versions:** pnpm 9.15.3+, Node 22.12.0+, TypeScript 5.9.3, React 19.2.3, Vite 7.3.1
- **New APIs:** `apps/desktop/src/api/codeEditing.ts` provides typed wrappers for AGI code changes

## Quick Start Checklist

1. `pnpm install` - Install dependencies
2. `pnpm typecheck:all` - Verify setup
3. `pnpm dev:desktop` - Start desktop development
4. Run relevant tests before committing

## Commit Convention

Uses [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `chore:`

Scopes: `desktop`, `web`, `agi`, `mcp`, `ui`, `api`, `docs`

## Additional Documentation

### Core Documentation

- **[README.md](README.md)** - Features and quick start
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed system design, data flows, and code patterns
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Code style, testing, and PR guidelines
- **[docs/CHANGELOG.md](docs/CHANGELOG.md)** - Version history

### Documentation by Category

| Category            | Path                    | Description                                  |
| ------------------- | ----------------------- | -------------------------------------------- |
| **Getting Started** | `docs/getting-started/` | Quick start, installation, configuration     |
| **Architecture**    | `docs/architecture/`    | System design, database schema               |
| **Development**     | `docs/development/`     | Dev setup, testing, debugging, patterns      |
| **Features**        | `docs/features/`        | Feature docs (MCP, chat, agent mode, etc.)   |
| **API**             | `docs/api/`             | API reference, OpenAPI spec (`openapi.yaml`) |
| **Testing**         | `docs/testing/`         | Test reports, E2E summaries, edge cases      |
| **Deployment**      | `docs/deployment/`      | Build guides, production verification        |
| **Security**        | `docs/security/`        | Security monitoring, audit logs              |
| **Setup**           | `docs/setup/`           | Stripe, webhook, environment setup guides    |
| **Archive**         | `docs/archive/`         | Historical documentation (reference only)    |

### App-specific READMEs

- **[apps/desktop/README.md](apps/desktop/README.md)** - Desktop app development
- **[apps/web/README.md](apps/web/README.md)** - Web platform development
- **[services/api-gateway/README.md](services/api-gateway/README.md)** - API Gateway service
- **[services/signaling-server/README.md](services/signaling-server/README.md)** - WebSocket signaling
