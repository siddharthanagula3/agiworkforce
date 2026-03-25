# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **web surface** (`apps/web/`) of the AGI Workforce monorepo. Next.js 16 App Router serving the marketing site (agiworkforce.com), API routes, auth/billing flows, and a static chat SPA built from the desktop Vite app.

## Build & Dev Commands

```bash
pnpm dev                    # Next.js dev server (localhost:3000)
pnpm build                  # Full build: desktop Vite SPA → public/chat/, then Next.js
pnpm build:next-only        # Next.js build only (skip Vite desktop build)
pnpm start                  # Production server
pnpm lint                   # ESLint (cached, content strategy)
pnpm typecheck              # tsc --noEmit
pnpm test                   # Vitest unit tests
pnpm test:ui                # Vitest interactive UI
pnpm test:coverage          # Coverage report (v8 provider)
pnpm test:e2e               # Playwright E2E (Chromium, localhost:3000)
pnpm test:e2e:ui            # Playwright interactive UI
```

### Build Pipeline

The `pnpm build` command is a hybrid:
1. Builds the desktop Vite SPA with `VITE_BUILD_TARGET=web` and `--base /chat/`
2. Copies desktop `dist-web/` to `apps/web/public/chat/`
3. Runs `next build`

Use `pnpm build:next-only` when you only changed web-specific files (not desktop components served at `/chat/`).

## Architecture

### Dual-App Structure

The web surface serves two distinct apps:
- **Next.js SSR site** — marketing pages, auth, billing, API routes, SEO
- **Desktop chat SPA** — Vite-built React app served statically at `/chat/` via Vercel rewrite (`/chat/:path*` → `/chat/index.html`)

### Directory Layout

```
app/           # Next.js App Router — routes, API handlers, layouts
features/      # Feature modules (chat, billing, marketplace, workforce, etc.)
core/          # Business logic (auth, ai, billing, integrations, monitoring, security)
components/    # Page-level UI components
shared/        # Cross-surface code shared with desktop (stores, ui, hooks, lib)
stores/        # Web-specific Zustand stores
  unified/     # Modular stores (auth, chat, model, billing, etc.)
lib/           # Utilities (llm-providers, csrf, rate-limit, security, validation)
hooks/         # Web-specific React hooks
services/      # Service layer (Supabase clients, error handling, state recovery)
api/           # API integration layer
types/         # Web-specific TypeScript types
test/          # Vitest setup, mocks
e2e/           # Playwright specs
```

### Import Aliases

```
@/*         → ./           (project root)
@features/* → ./features/
@core/*     → ./core/
@shared/*   → ./shared/
```

### Shared Monorepo Packages

The web app consumes these workspace packages:
- `@agiworkforce/api` — typed API wrappers
- `@agiworkforce/chat` — shared chat components (ChatInput, ChatInterface, MessageBubble, MessageList)
- `@agiworkforce/runtime` — runtime detection + capability-aware command routing
- `@agiworkforce/stores` — shared Zustand stores
- `@agiworkforce/types` — shared TypeScript types
- `@agiworkforce/utils` — shared utilities

## Key Patterns

### Auth

Supabase SSR with cookie-based sessions. The middleware in `proxy.ts` handles session refresh and auth-gating. Client-side uses `createBrowserClient` from `@supabase/ssr`. Account lockout logic lives in `core/auth/account-lockout-service.ts`.

### Security

- **CSP**: Per-request cryptographic nonce generated in `proxy.ts`, injected via `x-nonce` header to Server Components. Allows Stripe, Cloudflare, GA4, Supabase origins.
- **CSRF**: HMAC-SHA256 tokens with 1-hour TTL in `lib/csrf.ts`. Required on state-changing API routes.
- **Rate limiting**: Upstash Redis via `@upstash/ratelimit` in `lib/rate-limit.ts`.
- **Headers**: HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, COEP: credentialless (set in `next.config.ts`).

### State Management

- **Zustand v5 + Immer** for client state (web-specific stores in `stores/unified/`)
- **TanStack React Query** for server state + caching (`shared/stores/query-client.ts`)
- **Shared stores** in `shared/stores/` (authentication, chat, notifications, layout) are used by both web and desktop

### LLM Providers

`lib/llm-providers/factory.ts` maps 75+ model IDs to providers. Provider implementations in `lib/llm-providers/` (anthropic, openai, google, xai, deepseek, qwen, moonshot, perplexity, zhipu). Model routing supports economy/balanced/premium tiers with AUTO_MODELS.

### API Routes

47 API route handlers in `app/api/`. Key groups:
- `/api/llm/v1/chat/completions` — OpenAI-compatible endpoint (also exposed at `api.agiworkforce.com/v1/chat/completions` via Vercel rewrite)
- `/api/auth/*` — login, signup, callback, device auth
- `/api/stripe-webhook`, `/api/checkout`, `/api/credit-topup` — billing
- `/api/health` — checks database, Stripe, env vars; returns healthy/degraded/unhealthy

### Billing

Stripe integration: `@stripe/react-stripe-js` for client UI, `stripe` SDK for server-side. Webhook handler at `/api/stripe-webhook`. Daily credit reset via Vercel cron (`/api/cron/reset-credits`).

## Testing

### Vitest

- jsdom environment, globals enabled (`describe`/`it`/`expect` without import)
- CSS disabled to prevent framer-motion cssstyle parsing errors in jsdom
- Framer Motion mocked — `motion.*` components render as plain DOM elements
- Pointer capture polyfilled for Radix UI compatibility
- `next/headers` and `server-only` mocked in `test/setup.ts`
- `@webcontainer/api` stubbed (not installed, browser-only)

### Playwright

- Chromium only, 1920x1080 viewport
- Auto-starts `pnpm dev` as webServer
- Screenshots + videos on failure, HTML reporting
- No parallel execution (workers: 1), 120s timeout

## Environment Variables

**Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `CSRF_SECRET`

**Optional**: LLM provider API keys (users bring their own), `SENTRY_DSN`, `NEXT_PUBLIC_GA_TRACKING_ID`

Validated at startup by `instrumentation.ts` → `lib/validate-env.ts` (logs warnings, doesn't block).

## Gotchas

- **Middleware is `proxy.ts`**, not the standard `middleware.ts` — it exports a `proxy()` function handling Supabase session + CSP nonce injection.
- **ESLint is relaxed** for `components/`, `hooks/`, `lib/`, `stores/` (allows `any`, unused vars) because many files are ported from the desktop app.
- **React Compiler rules are disabled** in ESLint for desktop compatibility.
- **`shared/lib/api.ts`** is ~26K lines — the centralized API client with token management, retry logic, CSRF handling, and error mapping. Read specific sections, not the whole file.
- **Framer Motion in tests**: always mocked. If adding a component test with animations, the mock in `test/setup.ts` already handles it — don't add your own.
- **The `/chat/` route is NOT a Next.js page** — it's a static SPA from the desktop Vite build. Changes to chat UI require rebuilding the desktop app, not editing `app/chat/`.
- **Vercel deployment**: `vercel.json` uses a custom build script (`scripts/build-with-chat.sh`) that differs from `pnpm build`. Check both if build breaks.
- **NODE_OPTIONS**: The build script sets `--max-old-space-size=8192` to prevent Vite OOM during the desktop SPA build step.
