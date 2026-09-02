# Web end-to-end suite

Status: Current
Owner: Web surface maintainers
Last updated: 2026-09-01

`pnpm --filter @agiworkforce/web test:e2e` runs the specs in this directory
against a server Playwright starts from `playwright.config.ts`. That server is
handed blank Redis credentials and a scaled rate limit, so the batch uses the
in-process limiter and counts nothing against production.

Both halves of that isolation matter. A server started from `.env.local`
inherits the real Upstash credentials, which puts its limiter on the same live
bucket production uses: the batch then spends the QA account's actual
`chat-message` and `llm-completion` allowance, consumes Upstash command quota,
and 429s its own later specs, because the specs send messages back to back and
one account is behind all of them. Those failures look like product defects and
are not.

## Reusing a server you started yourself

`PLAYWRIGHT_REUSE_RUNNING_SERVER=1` tells Playwright not to start a server,
which also means the isolation above is yours to apply:

```
AGI_RATE_LIMIT_SCALE=50 \
UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= \
KV_REST_API_URL= KV_REST_API_TOKEN= \
pnpm --filter @agiworkforce/web dev
```

`next start` needs `VERCEL_ENV=preview` on top of that. Without it `next start`
is a production runtime, so `lib/rate-limit.ts` refuses to boot without Redis
and would ignore the scale anyway. CI's authenticated server uses the same
exemption.

`AGI_RATE_LIMIT_SCALE` multiplies every ceiling by a positive integer and is
read only outside a production runtime. Anything else, a deployed environment
included, logs an error and leaves the configured ceilings in place.

`visual/README.md` covers the separate screenshot capture and compare harness.
