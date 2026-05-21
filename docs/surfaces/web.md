# Web surface

> **Path:** `apps/web/` · **Stack:** Next.js 16 (app router) on Vercel · **Owner:** founder · **Status:** live at agiworkforce.com/chat with v3 UI default-on. **Updated:** 2026-05-18.

## Mission

The web app at agiworkforce.com hosts: (a) marketing site, (b) pricing + waitlist page, (c) `/chat` SPA (Vite-built desktop SPA copied into `apps/web/public/chat/` at build time), (d) `/api/llm/v1/*` provider proxy, (e) Stripe webhook (dormant until Aug 1 graduation), (f) Supabase auth + RLS-scoped data, (g) MCP web bridge.

## Status at HEAD

| Item                       | State                                                            |
| -------------------------- | ---------------------------------------------------------------- |
| Production URL             | ✅ `https://agiworkforce.com` deployed on Vercel                 |
| Chat surface               | ✅ `apps/web/features/chat/` (active path)                       |
| v3 UI                      | ✅ live behind `DESKTOP_CHAT_V3=true` (default-on)               |
| Stripe webhook             | 🚧 wired, **dormant** until Aug 1 2026 paid-tier graduation      |
| Supabase RPC               | ✅ `process_stripe_event_idempotent` live in prod (2026-05-13)   |
| Service-role-key migration | 🚧 8 routes pending migration to `getUserClient(jwt)` per V5 §12 |

## Verified codebase numbers (2026-05-17 audit)

- **85** page routes (`page.tsx` files in `apps/web/app/`) — was claimed 231 in older memory (overstated 2.7×)
- **94** API endpoints (`route.ts` files in `apps/web/app/api/`)
- **65** components in `apps/web/components/` — was claimed 249 (overstated 3.8×)
- **11** top-level feature dirs in `apps/web/features/` with **247** files
- **1,118** total `.ts`/`.tsx` files · **259,922** LOC
- **136** test files
- **223** sites use `withRateLimit` middleware (verified high end of 199-223 claim)

## Stack + locked versions

| Layer     | Choice                           | Notes                                                                      |
| --------- | -------------------------------- | -------------------------------------------------------------------------- |
| Framework | Next.js 16.2.x                   | app router. **`proxy.ts` not `middleware.ts`** per Next.js 16 convention   |
| Hosting   | Vercel                           | Pro plan; will need Enterprise post-100K MAU per V5 Appendix D §D.1        |
| Database  | Supabase                         | us-east-2; 43 canonical SQL migrations in `supabase/migrations/`           |
| Auth      | Supabase Auth + OAuth            | `@supabase/supabase-js` 2.105.x                                            |
| Payments  | Stripe                           | Node SDK target API version `2026-04-22.dahlia` (W6 upgrade from `clover`) |
| Analytics | none in v1                       | Telemetry off by default per V5 §10 lock #20                               |
| LLM proxy | `services/api-gateway` (Express) | self-hosted Fly.io                                                         |

## File layout

```
apps/web/
├── app/                            Next.js 16 app router
│   ├── (marketing)/                public pages — pricing, privacy, terms, etc.
│   ├── chat/                       SPA boundary; Vite-built desktop chat lives in /public/chat/
│   ├── api/                        94 API endpoints across ~48 namespaces
│   │   ├── llm/v1/chat/completions/route.ts   ⚠ critical — provider proxy + SSE
│   │   ├── stripe-webhook/         dormant until Aug 1; uses service-role; HMAC-verified
│   │   ├── auth/{sso-check,set-token}/        8 routes pending getUserClient(jwt) migration
│   │   ├── voice/transcribe/       Deepgram ephemeral token; ≤60s TTL
│   │   └── ...
│   └── proxy.ts                    ⚠ Next.js 16 middleware location (NOT middleware.ts)
├── features/                       11 top-level dirs / 247 files
│   ├── chat/                       active chat surface (113 components / 178 files)
│   │   └── components/messages/MessageBubble.tsx   ThinkingBlock wired at lines 60, 402-405
│   ├── auth/
│   ├── connectors/
│   ├── admin/
│   ├── account/
│   └── ...
├── components/                     shared UI primitives (65 files)
├── core/                           ⚠ DO NOT touch — provider integration internals
│   ├── ai/llm/providers/anthropic-claude.ts   line 665 has `?? 'gpt-5.4'` (W6 fix; lock #1)
│   └── billing/token-enforcement-service.ts   Sentry already wired
├── public/
│   └── chat/                       desktop SPA assets — Vite copies them here at build time
├── lib/
│   └── stripe-config.ts            STRIPE_API_VERSION (target `2026-04-22.dahlia`)
├── supabase/                       ⚠ LEGACY DIR — 50 migrations; scheduled for deletion W6
├── package.json                    apps/web build script: vite-build desktop → copy /public/chat/ → next build
└── tsconfig.json
```

## Key files to know

| File                                                           | What                                                                                                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/api/llm/v1/chat/completions/route.ts`            | The provider proxy. Every cloud-mode chat request hits this. Wraps `@agiworkforce/llm-normalize`                                                                       |
| `apps/web/app/api/stripe-webhook/route.ts`                     | Webhook entry. 112 lines; idempotency via Supabase RPC `public.process_stripe_event_idempotent` called from `apps/web/app/api/stripe-webhook/lib/idempotency.ts:12-15` |
| `apps/web/app/proxy.ts`                                        | Next.js 16 middleware. Sets CSP nonce per request. Excludes `/api/stripe-webhook` (V5 §10 lock #10)                                                                    |
| `apps/web/features/chat/components/messages/MessageBubble.tsx` | ThinkingBlock wired at lines 60, 402-405 (verified)                                                                                                                    |
| `apps/web/core/ai/llm/providers/anthropic-claude.ts`           | Line 665: `?? 'gpt-5.4'` — W6 fix per V5 §10 lock #1 (no hardcoded model IDs)                                                                                          |
| `apps/web/package.json`                                        | `build` script: `pnpm --filter desktop build && cp -r apps/desktop/dist apps/web/public/chat && next build`                                                            |
| `apps/web/supabase/migrations/`                                | ⚠ 50-file LEGACY dir — scheduled for deletion W6 per Appendix A §A.9. Canonical is `supabase/migrations/` (43 files)                                                   |

## Build + test commands

```bash
# Dev (localhost:3000)
pnpm --filter web dev

# Production build (unusual: vite-builds desktop SPA first)
pnpm --filter web build
# Output: apps/web/.next/

# Typecheck just web
pnpm --filter web typecheck

# Vitest tests
pnpm --filter web test

# Lint (excludes apps/extension)
pnpm lint

# Deploy
# Vercel auto-deploys on push to main (production branch)
# Preview deploys on every PR
```

## Release process

1. Vercel auto-deploys on push to `main` (production)
2. Every PR gets a preview URL
3. No manual versioning; release frequency is per-commit
4. Stripe webhook flip Aug 1: requires verifying production Supabase has all 43 canonical migrations + RPC exists

## Provider integrations on web

Same 10+ providers as desktop. Provider catalog read from `packages/types/src/models.json`. Network proxy: `services/api-gateway` (Express on Fly.io). All cloud chat requests route through `/api/llm/v1/chat/completions` → api-gateway → provider.

## Current open work (Wave 6, in flight)

1. **W6 #5** — Stripe API version upgrade `clover` → `dahlia` (`2026-04-22`) per V5 §10 lock #5
2. **W6 #6** — CSP nonce verification integration test on every script tag
3. **W6 #19** — Remove `?? 'gpt-5.4'` hardcoded fallbacks in 5 files including `apps/web/core/ai/llm/providers/anthropic-claude.ts:665`
4. **W6 #20** — Migrate 8 routes from `SUPABASE_SERVICE_ROLE_KEY` to `getUserClient(jwt)`. List in V5 §12:
   - `/api/auth/sso-check`
   - `/api/auth/set-token`
   - `/api/shared`
   - `/api/device/{poll,link,approve}` (4 routes)
5. **W6 #21** — Delete legacy `apps/web/supabase/migrations/` (50 files) after reconciliation
6. **W6 #11** — Aug 1 countdown banner on `/pricing`
7. **W6 #6** — 5-chip trust row on `/pricing`

## Gotchas

- **`apps/web/components/UnifiedAgenticChat/` does NOT exist.** Older docs implied it does. Active web chat is `apps/web/features/chat/` (113 components / 178 files). Anyone looking for the chat code by the wrong name will fail.
- **Stripe webhook is on `nodejs` runtime, NOT edge.** Pinned via `export const runtime = 'nodejs'`. CI integration test asserts this (V5 §10 lock #9).
- **Stripe webhook is excluded from `proxy.ts` middleware.** Regex carve-out at `proxy.ts:71-83`. V5 §10 lock #10.
- **Two Supabase migration directories.** Canonical: `supabase/migrations/` (43 files). Legacy: `apps/web/supabase/migrations/` (50 files). Pick canonical for prod; delete legacy W6 per Appendix A §A.9.
- **Build is two-step.** `pnpm --filter web build` first builds the desktop SPA via Vite, then copies into `apps/web/public/chat/`, then runs `next build`. If you skip the desktop build, `/chat` 404s.
- **Marketing copy is locked.** Per V5 §10 lock #19: no "reseller of [provider]" or "unlimited [provider]" phrases. ESLint custom rule scans `apps/web/marketing/`.

## Current References

- [docs/current/product-suite.md](../current/product-suite.md) - Web role in synced app chat and account flows.
- [docs/current/technical-architecture.md](../current/technical-architecture.md) - data ownership, API gateway, provider, and generated-file strategy.
- [docs/current/commercial-and-launch.md](../current/commercial-and-launch.md) - waitlist, billing, managed-compute, and no-resale-framing posture.
- [docs/decisions/CURRENT_DECISIONS.md](../decisions/CURRENT_DECISIONS.md) - current trust-boundary and managed-cloud decisions.
- Historical API and data-model details live in `docs/archive/2026-05-21-docs-consolidation/`.

## Memory references

- `memory/locks/pricing-billing-decisions-2026-05-16.md` — 20 pricing UX decisions
- `memory/locks/byok-first-launch-2026-05-16.md` — waitlist mechanic
- `memory/reference/apis/anthropic-api-2026-03.md` — Claude API integration reference

## Operational owner

Founder. Vercel + Supabase + Fly.io are all under the founder's accounts. Stripe is under AGI Automation LLC.
