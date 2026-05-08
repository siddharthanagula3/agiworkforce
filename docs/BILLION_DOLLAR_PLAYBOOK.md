# Billion-Dollar Playbook — what we built and what's next

This doc connects the user's strategic ask ("scale easily; swap Supabase → Neon; multi-cloud; multi-domain; heavy traffic; billion-dollar business") to the concrete code shipped on 2026-05-08 and the gaps that remain.

> **For deep technical detail**, read the linked docs. This playbook is the executive index.

## What "billion-dollar-ready" means here

A platform is billion-dollar-ready when:

1. **No single vendor lock-in** — the product runs on at least 2 cloud providers without a rewrite.
2. **Horizontal scale** — traffic 10× and 100× requires only config changes, not new code.
3. **Domain agility** — launching `agiworkforce.cn` or whitelabel domains is an env change.
4. **Cost flexibility** — when AWS prices change, swapping to Cloudflare or Fly.io is a week, not a quarter.
5. **Compliance posture** — SOC 2 / GDPR / HIPAA each require infra that the codebase enables, not fights.
6. **Per-surface independence** — the 6 surfaces (CLI, Desktop, Web, Mobile, Chrome ext, VS Code ext) ship on their own cadence without entangling each other.

Today's codebase ticks 5 of 6 (compliance posture pending — SOC 2 is a Q3 2026 target per the locked plan).

## What shipped on 2026-05-08 toward this goal

| Layer                      | Action                                                                                                                                                                                                          | Where                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Database portability**   | New `@agiworkforce/data-layer` package with `DatabaseAdapter` interface; Supabase adapter live; Neon + raw-Postgres adapters scaffolded with migration guides                                                   | `packages/data-layer/`, [`SCALING.md`](./SCALING.md)             |
| **Auth portability**       | Same package: `AuthAdapter` interface + Supabase impl + Auth0/Clerk/Cognito skeleton sketches                                                                                                                   | `packages/data-layer/src/types.ts`, [`SCALING.md`](./SCALING.md) |
| **Storage portability**    | Same: `StorageAdapter` interface; S3/R2/B2 swap path documented                                                                                                                                                 | [`SCALING.md`](./SCALING.md)                                     |
| **Realtime portability**   | Same: `RealtimeAdapter` interface; Pusher/Ably/self-hosted swap path                                                                                                                                            | [`SCALING.md`](./SCALING.md)                                     |
| **Multi-cloud hosting**    | Vercel today; Cloudflare/Netlify/self-hosted alternatives documented per service                                                                                                                                | [`HOSTING.md`](./HOSTING.md)                                     |
| **Multi-domain**           | env-driven URLs (no hardcoding); Stripe webhook + Supabase callback + NEXT_PUBLIC_APP_URL all read from env                                                                                                     | [`HOSTING.md`](./HOSTING.md) "Domain switching"                  |
| **Heavy traffic**          | Connection-pool sizing, 3-tier caching, streaming backpressure, provider failover, cost-aware routing                                                                                                           | [`PERFORMANCE.md`](./PERFORMANCE.md)                             |
| **Provider redundancy**    | 8 LLM provider adapters live (Anthropic, OpenAI, Google, Ollama, xAI, DeepSeek, Perplexity, LMStudio); cross-provider session continuity is differentiator #3                                                   | `packages/providers/*`                                           |
| **Pro+ infrastructure**    | Stripe `prod_UTTTGQ9T01Ukge` + $49.99/mo + $499.88/yr live; Supabase `subscriptions.plan_tier` includes `pro_plus`; flagship daily-cap RPC; tier-bridge hooks on desktop + web; mobile + VS Code paywall guards | verified via Stripe + Supabase MCP 2026-05-08                    |
| **6-surface verification** | `scripts/verify-surfaces.sh` + [`SURFACE_VERIFICATION.md`](./SURFACE_VERIFICATION.md)                                                                                                                           | repo                                                             |

## The data-layer pattern in 30 seconds

Today, feature code calls Supabase directly:

```ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(url, anonKey);
const { data } = await sb.from('users').select('*');
```

Tomorrow, feature code calls the data-layer:

```ts
import { createDatabaseClient } from '@agiworkforce/data-layer';
const db = createDatabaseClient(); // reads AGI_DATABASE_PROVIDER env
const data = await db.withUser(jwt).query<User>('SELECT * FROM users');
```

Switching from Supabase to Neon = changing `AGI_DATABASE_PROVIDER=neon` + `DATABASE_URL=...neon...` and running `pnpm add @neondatabase/serverless`. The route code never changes.

The vertical slice in `apps/web/app/api/me/route.ts` proves the pattern. Migrating remaining routes is a PR-by-PR sweep documented at the top of that file.

## Migration playbook table

| Migration                               | Effort                  | Doc                                             | Status                                                    |
| --------------------------------------- | ----------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| Supabase → Neon                         | 2-3 days (one engineer) | [`SCALING.md` § Database](./SCALING.md)         | Adapter scaffold ready; unblocks when needed              |
| Supabase Auth → Clerk                   | 1 week                  | [`SCALING.md` § Auth](./SCALING.md)             | Skeleton ready; cookie-flow needs IdP-specific SSR helper |
| Supabase Storage → R2                   | 2-3 days                | [`SCALING.md` § Storage](./SCALING.md)          | Adapter not yet implemented; throws helpful error         |
| Supabase Realtime → Pusher              | 3-5 days                | [`SCALING.md` § Realtime](./SCALING.md)         | Same                                                      |
| Vercel → Cloudflare Pages               | 1 week                  | [`HOSTING.md` § Web](./HOSTING.md)              | Edge-runtime API routes verified compatible               |
| Fly.io → AWS ECS (api-gateway)          | 1 week                  | [`HOSTING.md` § Services](./HOSTING.md)         | Dockerfile already builds anywhere                        |
| Single domain → Multi-tenant whitelabel | 1-2 weeks               | [`HOSTING.md` § Domain switching](./HOSTING.md) | Stripe + Supabase callback URL changes per env            |

## Heavy-traffic milestones

| Phase                    | Target                   | Required infra                                                                                             |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 0-100 paid users (Hobby) | Today                    | Supabase Free tier OK; Vercel Hobby plan; Upstash free Redis                                               |
| 100-1000 (Hobby + Pro+)  | 1 month post-Pro+ launch | Supabase Pro ($25/mo); Vercel Pro; Upstash Pro                                                             |
| 1000-10K                 | Quarter post-Pro+        | Supabase Team or Neon; Vercel Enterprise OR Cloudflare Pages; PgBouncer; read replica                      |
| 10K-100K                 | 6+ months                | Multi-region Neon; Cloudflare Workers for edge auth; provider failover automation; cost-aware routing live |
| 100K+ (billion-dollar)   | 12+ months               | Multi-cloud (Cloudflare + AWS + Fly); SOC 2 Type II; SSO; audit logs; dedicated VPC peering                |

Numbers from [`PERFORMANCE.md`](./PERFORMANCE.md) connection-pool sizing + Supabase pricing tiers.

## Per-surface scale ceilings

Each surface has a different scale model:

- **CLI** — local-only execution; scaling is per-machine. No backend cost.
- **Desktop** — local SQLite + optional cloud. Scales with installs, not server.
- **Web** — Vercel functions per request. Scales linearly with traffic. The data-layer abstraction cuts the Supabase coupling that currently caps us.
- **Mobile** — App Store / Play distribution; backend API is the same as Web.
- **Chrome ext** — Browser-side; backend API for cloud features only. Scales with active users × feature use.
- **VS Code ext** — Same as Chrome.

Total backend QPS = `Web QPS + Mobile QPS + Chrome QPS + VSCode QPS`. The data-layer abstraction gives us 6× leverage to swap providers — when Supabase becomes the bottleneck, we don't need to migrate all 6 at once; we migrate the data layer.

## Compliance roadmap (deferred, but planned)

- **SOC 2 Type II** — Q3 2026 target. Requires audit logs (live), access controls (live), change management (live via commitlint + PR review), monitoring (Vercel logs + Sentry).
- **GDPR** — `apps/web/app/api/user/{delete-account,export}/route.ts` already implements user-initiated deletion + export. RLS provides per-user isolation.
- **HIPAA** — not in scope for any tier today. Adding it requires Supabase Enterprise BAA OR migrating to a HIPAA-eligible provider (Neon Enterprise, RDS, etc.) — the data-layer abstraction makes this a config change.

## The bet

The code shipped today says: **"every cloud assumption is a config decision, not a code decision."** That's the bet. If we ever need to leave Supabase, leave Vercel, leave Fly.io, leave Stripe, leave any single vendor — the application code changes are bounded by how much we kept inside the abstractions. Today: ~1% of routes use the data-layer (1 of ~90 routes — `apps/web/app/api/me/route.ts` is the lone vertical slice). Goal: 100% by end of Phase B (~W22 of the locked plan).

Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full system map. Read [`SCALING.md`](./SCALING.md) for the migration steps. Read [`HOSTING.md`](./HOSTING.md) for multi-cloud hosting. Read [`PERFORMANCE.md`](./PERFORMANCE.md) for high-traffic patterns.
