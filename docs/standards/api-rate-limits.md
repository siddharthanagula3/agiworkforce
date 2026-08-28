# Developer API rate limits

Status: Current
Owner: Platform lead
Last updated: 2026-08-13

Every number below is read from `apps/web/lib/rate-limit.ts` (`rateLimitConfigs`)
and pinned by
`apps/web/app/api/llm/v1/__tests__/developer-api-contract.test.ts`, so the table
cannot drift from the limiter without a red test.

## Base URLs

```
https://agiworkforce.com/api/llm/v1
```

The complete first-party API uses the base above. The checked-in deployment
contract also exposes these OpenAI-compatible aliases at
`https://api.agiworkforce.com`: `/v1/models`, `/v1/chat/completions`,
`/v1/embeddings`, `/v1/audio/transcriptions`, and `/v1/credits/balance`.

Those aliases are owned by `apps/web/lib/api-host-route-contract.ts`; both
Next's host rewrite table and Proxy's pass-through decision consume that same
list. The prior `vercel.json` copy was removed because Vercel ignored it for
this Next.js project. The source correction still requires a production deploy
and a live authenticated request before the API hostname can be treated as
release-verified; use the complete base URL above until that verification is
recorded.

## Limits

| Endpoint                          | Limit    | Window | Bucket                           | Redis outage |
| --------------------------------- | -------- | ------ | -------------------------------- | ------------ |
| `GET /models`                     | 100 req  | 1 min  | caller (see _Buckets_)           | fail open    |
| `GET /credits/balance`            | 60 req   | 1 min  | caller                           | fail open    |
| `POST /audio/transcriptions`      | 20 req   | 1 min  | caller                           | fail closed  |
| `POST /chat/completions` (per IP) | 1500 req | 1 min  | client IP, before authentication | fail closed  |
| `POST /chat/completions`          | 30 req   | 1 min  | authenticated user               | fail closed  |
| `POST /embeddings`                | 60 req   | 1 min  | caller                           | fail open    |

`/chat/completions` is metered twice: the pre-auth IP ceiling admits the request
and the per-user ceiling is applied after the credential verifies.

"Fail closed" means the limiter refuses the request with `429` when Redis is
unavailable in production, because in-memory counting is per-function-instance
and therefore no limit at all on a serverless deploy. "Fail open" endpoints are
allowed through instead.

## Buckets

The bucket is the authenticated user (`user:<id>`) only when the request carries
a credential the limiter can verify **locally** — a Clerk session JWT or a
first-party device token. An AGI API key (`sk_live_…` / `sk_test_…`) is opaque to
the limiter, so those requests fall back to the client IP.

Two consequences worth planning around:

- API-key traffic from one egress IP (a serverless deploy, an office NAT) shares
  a single bucket, so the effective per-key limit is lower than the table.
- `/chat/completions` passes an explicit `user:<id>` identifier after
  authentication, so that one endpoint is per-user for every credential type.

`rateLimitConfigs` also supports scaling a ceiling by the plan's advertised
concurrency (`resolveTierRateLimit`). No developer-API route passes a plan tier
today, so every limit above is the flat base value on every plan.

## Being rate limited

A refused request returns `429` with:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please wait before trying again.",
    "retry_after_seconds": 41,
    "reset_at": "2026-08-09T12:34:56.000Z"
  },
  "rateLimit": {
    "limit": 30,
    "remaining": 0,
    "reset": "2026-08-09T12:34:56.000Z",
    "reset_at": "2026-08-09T12:34:56.000Z",
    "retry_after_seconds": 41
  }
}
```

Headers on that response: `Retry-After` (seconds), plus `X-RateLimit-Limit`,
`X-RateLimit-Remaining` and `X-RateLimit-Reset` when the limiter reached Redis.
A response refused because the limiter itself was unavailable carries
`X-RateLimit-Error: rate-limiter-unavailable` and `Retry-After: 60` instead.

Successful responses carry no `X-RateLimit-*` headers, so a client cannot read
its remaining budget without hitting the limit. Back off on `Retry-After`.

## Related quotas

Rate limits bound request frequency only. They are not the spend ceiling —
managed usage is metered separately and surfaces as `402` with
`insufficient_quota`, and concurrent managed turns are capped per plan by
`BILLING_PLAN_PRODUCT_LIMITS.maxConcurrentTurns`
(`packages/contracts/types/src/billing-catalog.ts`). `GET /credits/balance`
reports the usage percentage and reset instant for the calling account.
