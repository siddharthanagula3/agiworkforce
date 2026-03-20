# Web App

Next.js 16 App Router at `agiworkforce.com`. Auth via Supabase SSR, billing via Stripe.

## Quick Start

```bash
pnpm install
cd apps/web && pnpm dev     # http://localhost:3000
```

## Architecture

- **App Router**: `app/` — pages, API routes, layouts
- **Features**: `features/` — chat, billing, settings, workforce, vibe
- **Shared**: `shared/` — components, stores, hooks, lib
- **Auth**: Supabase SSR (`@supabase/ssr`)
- **Billing**: Stripe (webhooks + checkout + portal)

## Key Commands

```bash
pnpm typecheck              # tsc --noEmit
pnpm lint                   # ESLint
pnpm dev                    # Dev server
```
