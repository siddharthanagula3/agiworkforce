# Web end-to-end suite

Status: Current
Owner: Web surface maintainers
Last updated: 2026-10-06

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

## What runs on a push, and what does not

CI's signed-out step runs every spec at the top level of this directory that
does not import `qa-capability-harness`. `__tests__/web-e2e-ci-coverage.test.ts`
fails when the step's list and that set differ, so a new public spec is either
in the push gate or the test is red.

`matrix/` is the one exception, for specs whose size keeps them off a push:

- `matrix/public-design-standard.spec.ts` checks every public route at eight
  widths in both themes, about 3,200 cases and hours of browser time.
- `matrix/public-footer-measured.spec.ts` captures the shared footer on three
  pages at the same eight widths in both themes, 48 cases at about 42 seconds
  each. Its capture helpers live in `lib/public-footer-capture.ts`, and their
  self-tests stay in `landing-keyboard.spec.ts`, in the push gate.

Both run on demand from `.github/workflows/web-public-matrix.yml`, and the same
test pins which specs may live in the folder. Locally, narrow them before
running them:

```
PUBLIC_DESIGN_ROUTES=/pricing,/about PUBLIC_DESIGN_WIDTHS=390,1440 \
PLAYWRIGHT_REUSE_RUNNING_SERVER=1 \
pnpm exec playwright test e2e/matrix --project=chromium
```

`public-typography-source.spec.ts` is a ratchet. It counts literal type sizes
per public source file against `public-typography-source.baseline.json` and
fails when a file exceeds its number or falls below it; in the second case
lower the number, so the improvement cannot be spent again.

`visual/README.md` covers the separate screenshot capture and compare harness.
