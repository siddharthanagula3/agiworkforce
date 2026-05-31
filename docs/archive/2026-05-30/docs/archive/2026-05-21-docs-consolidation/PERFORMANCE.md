# Performance

> Heavy-traffic patterns. Companion to `docs/SCALING.md` and
> `docs/HOSTING.md`.

## TL;DR

The dominant cost at our scale is **LLM inference**, not DB / web /
storage. Everything else fits in a $200/mo budget up to ~10K MAU.
This document covers patterns for staying performant _and_ cost-aware
as we grow.

## 1. Database connection pool sizing

Postgres connections cost ~10MB RAM each. Bad pool sizing tanks both
latency and cost.

### Rule of thumb

- **Per-pod max:** `2 * (cpu cores) + effective spindles`. For our
  Vercel functions (1 vCPU, no disk), that's `~3` direct connections.
- **Use a pooler** for any pod count > 5. `pool_mode = transaction`.
- **Pool size at the pooler** = `compute capacity / avg query duration`.
  E.g., 50K QPS, 10ms avg query → 500 backend connections.

### Today's setup

| Layer                       | Limit                        |
| --------------------------- | ---------------------------- |
| Supabase pooler (PgBouncer) | 200 connections (Pro tier)   |
| Per-Vercel-function         | 1 (we use SSR-bound clients) |
| Per-Fly.io-pod              | 10 (api-gateway pool)        |

If we see "remaining connection slots are reserved" errors, we're over
the pooler limit — either upgrade the tier or migrate to Neon (no
fixed limit).

### Neon-specific

Neon's HTTP driver multiplexes — no PgBouncer needed. Pool size per
function can be unlimited. The serverless tier scales to thousands of
concurrent requests automatically.

## 2. Caching layers

Three tiers, descending in latency:

### Browser

- **Static assets:** content-hashed filenames + 1-year `Cache-Control`.
  Already done by Next.js / Vite.
- **API responses:** `revalidate: 60` per route segment, or
  `Cache-Control: s-maxage=60, stale-while-revalidate=300`.
- **TanStack Query:** in-memory cache with `staleTime: 5 * 60_000`. Use
  for any data the user reads repeatedly.

### CDN

- **Vercel:** automatic for static, opt-in for ISR routes
  (`export const revalidate = 60`).
- **Cloudflare:** put in front of any origin. Edge cache with custom
  headers.

### Application (Redis / Upstash)

For per-user computed data:

```ts
import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();

// Cache user's plan tier for 5 minutes:
const cached = await redis.get<{ tier: string }>(`plan:${userId}`);
if (cached) return cached;
const fresh = await SubscriptionService.getSubscription(...);
await redis.set(`plan:${userId}`, fresh, { ex: 300 });
return fresh;
```

Upstash Redis free tier: 10K commands/day. Paid: $10/mo for 100K/day.

### Cache invalidation patterns

- **TTL-based:** simplest. Acceptable lag = TTL.
- **Event-driven:** invalidate on Supabase Realtime change events. More
  complex; only worth it for high-read / low-write data.
- **Tag-based:** Vercel's `revalidateTag('user:123')` invalidates all
  routes tagged with that key.

## 3. LLM streaming response backpressure

Streaming SSE / NDJSON over fetch is mostly automatic, but watch for:

### Slow client / fast LLM

If the client can't drain at the rate the LLM produces, the server's
write buffer fills. Solutions:

```ts
// In apps/web/app/api/llm/v1/chat/completions/route.ts:
const stream = new ReadableStream({
  async pull(controller) {
    const chunk = await llmIterator.next();
    if (chunk.done) controller.close();
    else controller.enqueue(chunk.value);
  },
});
```

`pull()` is called only when the client signals readiness — the LLM
iterator only produces when there's somewhere to put the data.

### Fast client / slow LLM (TTFT)

Time-to-first-token matters. Strategies:

- **Pre-buffer:** stream a "thinking…" token immediately so the client
  shows activity.
- **Speculate:** if running multiple providers (e.g. for failover), kick
  off both, return whichever streams first.
- **Cache:** for FAQ-style queries, cache the full response with
  semantic-similarity matching.

### Graceful disconnect

```ts
request.signal.addEventListener('abort', () => {
  llmIterator.return?.(); // cancel upstream LLM call
});
```

We pay for tokens; cancelling on abort is real money. Make sure every
provider adapter calls `cancel` on the underlying SDK.

## 4. Provider failover

Multi-provider in-thread switch is **also** our failover mechanism. When
Anthropic 429s, the user can flip to OpenAI mid-conversation —
`packages/llm-normalize` keeps the tool-call schema portable.

### Auto-failover logic (TODO — currently manual)

```ts
// pseudo
async function tryProviders(req: ChatRequest, fallbacks: ProviderId[]) {
  for (const id of fallbacks) {
    try {
      return await streamWith(id, req);
    } catch (err) {
      if (isTransient(err)) continue;
      throw err;
    }
  }
  throw new Error('All providers failed');
}
```

Order matters:

1. **User-pinned** provider (respect the choice).
2. **Cheapest equivalent** (cost-aware routing — see §6).
3. **Healthiest** (lowest recent error rate).

Failure modes to retry on:

- `429 Too Many Requests`
- `503 Service Unavailable`
- Network timeout (10s default)

Failure modes NOT to retry on:

- `401 Unauthorized` (bad API key — surface to user)
- `400 Bad Request` (bad input — surface to user)

## 5. Cost-aware routing

Why: GPT-5.4 is ~$0.005/1K tokens, Claude Haiku 4.6 is ~$0.0005/1K.
For "easy" queries (short factual lookups) the cheaper model is fine.

### Heuristics

```ts
function routeModel(req: ChatRequest): ModelId {
  const totalTokens = estimateTokens(req.messages);
  const hasTools = (req.tools?.length ?? 0) > 0;
  const hasThinking = !!req.thinking;

  // Free tier: always use cheapest viable model.
  if (req.userTier === 'free') {
    return hasTools ? 'haiku-4-6' : 'gpt-5.4-mini';
  }

  // Pro tier: respect user choice if pinned.
  if (req.userPinnedModel) return req.userPinnedModel;

  // Pro tier: route by complexity.
  if (hasThinking || totalTokens > 100_000) return 'claude-opus-4-7';
  if (hasTools) return 'claude-sonnet-4-7';
  return 'gpt-5.4-mini';
}
```

The actual implementation lives in `packages/routing` (per
`memory/auto-routing-spec-2026-05-07.md`). 6-tier matrix.

### Measuring savings

Track in PostHog:

- `model_inference_cost_cents` (per request)
- `model_id` (the routed model)
- `user_pinned_model` (user override or null)

Dashboard: average cost per query, broken down by model, by tier. Aim
for 60-70% routing to "fast" models for non-pinned queries.

## 6. Edge vs origin

Use the right runtime per route:

| Route type            | Runtime | Why                          |
| --------------------- | ------- | ---------------------------- |
| `/api/me`             | Node    | Uses `argon2` indirectly     |
| `/api/llm/...`        | Edge    | Streaming, low TTFB          |
| `/api/auth/...`       | Node    | Cookie crypto + Supabase SSR |
| `/api/stripe-webhook` | Node    | Stripe SDK, signing          |
| `/api/billing/...`    | Node    | Stripe SDK                   |
| Static pages          | Edge    | Cached at PoP                |

To pin runtime in Next.js:

```ts
// apps/web/app/api/llm/v1/chat/completions/route.ts
export const runtime = 'edge';
```

Edge has limits: no Node API, no `pg`, no `argon2`, 50ms CPU per request,
1MB code size. If those bite, fall back to Node.

## 7. WebSocket scaling

`signaling-server` holds long-lived ws connections. Memory budget:
~10KB per connection.

| Pod size  | Concurrent ws |
| --------- | ------------- |
| 256MB RAM | ~5K           |
| 1GB RAM   | ~25K          |
| 4GB RAM   | ~100K         |

For >100K concurrent: shard by user ID across pods (sticky session via
load balancer cookie) OR migrate to Cloudflare Durable Objects (one DO
per room, infinite scale).

## 8. Rate limiting at scale

Today: `@upstash/ratelimit` — single-region (us-east-1). Edge functions
in `lhr` round-trip to `us-east-1` for every check (~100ms added).

### Multi-region rate limiting

```ts
// Cloudflare KV (eventually consistent, ~60s)
const count = await env.RATE_LIMIT_KV.get(`rl:${ip}`);
```

OR

```ts
// Cloudflare Durable Objects (strongly consistent)
const stub = env.RATE_LIMIT_DO.get(env.RATE_LIMIT_DO.idFromName(ip));
const allowed = await stub.fetch('/check').then((r) => r.ok);
```

Trade-off: KV is faster (no central authority), DO is correct (strict
caps). Use KV for soft caps (per-IP scrape protection), DO for hard
caps (per-user quota).

## 9. Image / file delivery

Big payloads (PDFs, exports, generated images) — never send through the
API. Always:

1. API mints a signed URL via `StorageAdapter.signedUrl()`.
2. Client downloads directly from CDN.

This keeps API requests small and lets the CDN cache the bytes.

## 10. Database indexes

Critical indexes — verify with `pg_stat_user_indexes`:

```sql
-- Hot tables in our schema:
create index on conversations(user_id, updated_at desc);
create index on messages(conversation_id, created_at);
create index on subscriptions(user_id) where status = 'active';
create index on credit_accounts(user_id, period_start);

-- For fuzzy search:
create extension if not exists pg_trgm;
create index on messages using gin(content gin_trgm_ops);
```

Monitor slow queries:

```sql
select query, calls, mean_exec_time, total_exec_time
from pg_stat_statements
order by total_exec_time desc
limit 20;
```

If a query is in the top 10 and takes >100ms, it's a candidate for
indexing. Watch for missed `(user_id, ...)` composite indexes.

## 11. Cold start mitigation

Vercel functions cold-start in ~500ms (Node) / ~10ms (Edge).

- **Edge for hot paths:** anything user-facing must be edge.
- **Warming:** for unavoidable Node routes, hit them every 5min from a
  cron job to keep them warm. Vercel cron is free up to 1 invocation/day
  per route — chain through `/api/health` cascades for cheap warming.
- **Bundle size:** smaller bundles cold-start faster. Audit with
  `next build` output. Anything > 500KB per route gets investigated.

## 12. Observability

Don't optimize what you can't measure. Required dashboards:

1. **API latency p50 / p95 / p99** per route.
2. **DB query latency p95** + **slow query log**.
3. **LLM TTFT** per provider.
4. **LLM cost / day** per model.
5. **Error rate** per route, per provider.
6. **Concurrent ws** for signaling server.
7. **Rate-limit hits** per route.

Stack: Sentry + PostHog + Vercel Analytics today. Migrate to Grafana
Cloud at $1M MRR for cost control.

## 13. Where to focus first

If we have budget for one optimization sprint, in order:

1. **Cost-aware LLM routing.** Saves 30-50% on inference, our biggest line.
2. **Edge runtime for chat completions.** Saves 200ms TTFT.
3. **DB query indexes.** Catches 90% of latency regressions for free.
4. **Cache invalidation strategy.** Lets us cache aggressively without
   stale-data incidents.
5. **Provider failover automation.** Improves uptime numbers we'd quote
   to enterprise customers.
