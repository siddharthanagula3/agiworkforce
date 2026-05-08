# Hosting

> Multi-cloud deployment guide. Companion to `docs/SCALING.md`.

## TL;DR

Today: **Vercel** for web, **Fly.io** for api-gateway + signaling-server,
**Supabase** for database. Tomorrow: any of those is swappable in
~1 day if it goes sideways. This document is the **runbook**.

## 1. Web hosting

### Vercel (current)

Why: best Next.js DX, automatic edge functions, generous free tier,
zero-config preview deploys.

```bash
# In apps/web:
vercel link
vercel env pull .env.local   # populates dev env from Vercel
vercel deploy --prod         # production deploy
```

Production env vars are set in Vercel dashboard. The full list:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
AGI_DATABASE_PROVIDER     # NEW — defaults to supabase
AGI_AUTH_PROVIDER         # NEW — defaults to supabase
AGI_STORAGE_PROVIDER      # NEW — defaults to supabase
AGI_REALTIME_PROVIDER     # NEW — defaults to supabase
```

Edge functions are picked automatically by Next.js — see route exports.
The `apps/web/app/api/me/route.ts` is a Node-runtime route (uses Supabase
SDK). Hot-path streaming routes pin `export const runtime = 'edge'`.

### Cloudflare Pages

Why migrate: Vercel's Edge Functions cost $20/M invocations after the
free tier. Cloudflare Pages is $0.15/M requests. At 100M req/mo, save
~$2K/mo.

```bash
# In apps/web:
npm install -g wrangler
npm install @cloudflare/next-on-pages
npx @cloudflare/next-on-pages
wrangler pages deploy .vercel/output/static
```

Caveats:

- **Node-runtime routes need adapters.** `@cloudflare/next-on-pages`
  rewrites them to edge runtime; some Node-only deps (argon2, pg)
  break. Workaround: keep those routes on a separate origin (Fly.io).
- **Build size limit: 25MB per worker.** Our SSR bundle is ~5MB —
  fine.
- **Image optimization:** use Cloudflare Images CDN instead of
  `next/image` defaults.

### Netlify

Functionally similar to Vercel. ~20% cheaper at scale. Edge functions
work via Netlify Edge Functions (Deno-based).

```bash
npm install -g netlify-cli
netlify deploy --prod
```

### Self-hosted (Docker)

For air-gap deployments or enterprise on-prem.

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter web build
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
```

Build:

```bash
docker build -t agiworkforce/web:latest .
docker run -p 3000:3000 --env-file .env.production agiworkforce/web:latest
```

For HA: run behind nginx + multiple replicas + a shared session store
(Redis or Postgres-backed).

### Comparison

| Host             | Cost @ 1M req/mo | Edge support | DX  | When to use         |
| ---------------- | ---------------- | ------------ | --- | ------------------- |
| Vercel           | $20–100          | Yes          | A+  | Default             |
| Cloudflare Pages | $0.15            | Yes          | B+  | Save money at scale |
| Netlify          | $19–80           | Yes (Deno)   | A   | Vercel alternative  |
| Self-hosted      | hardware         | No           | C   | On-prem / air-gap   |

## 2. API Gateway hosting

`services/api-gateway` (Express v5, 15 routes, MCP). Stateless, easy to
horizontally scale.

### Fly.io (current)

```bash
cd services/api-gateway
fly deploy
```

`fly.toml`:

```toml
app = "agiworkforce-api"
primary_region = "iad"
[[services]]
  internal_port = 8080
  protocol = "tcp"
  [[services.ports]]
    handlers = ["http"]
    port = 80
  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

Pricing: ~$5/mo for shared-cpu-1x with 256MB RAM. Add regions for
multi-region — `fly machine clone --region lhr`.

### Railway

Drop-in for Fly.io. ~$10/mo for the same workload.

```bash
railway link
railway up
```

### Render

```bash
# render.yaml
services:
  - type: web
    name: agiworkforce-api
    env: node
    buildCommand: pnpm install && pnpm --filter @agiworkforce/api-gateway build
    startCommand: pnpm --filter @agiworkforce/api-gateway start
```

### AWS ECS (Fargate)

For compliance / VPC integration. ~$30/mo + ALB ~$20/mo. Worth it only at
scale or for HIPAA / SOC2 reasons.

### Comparison

| Host    | Cost @ 1 instance | Multi-region | DX  | When to use        |
| ------- | ----------------- | ------------ | --- | ------------------ |
| Fly.io  | $5                | Easy         | A+  | Default            |
| Railway | $10               | Manual       | A   | Fly.io alternative |
| Render  | $7                | Manual       | A   | Bigger free tier   |
| AWS ECS | $30 + ALB         | Yes          | C+  | Compliance / VPC   |

## 3. Signaling server hosting

`services/signaling-server` — WebRTC signaling for Dispatch + Cowork.
Stateful (in-memory peer registry), so horizontal scaling needs sticky
sessions or external state.

### Fly.io (current)

Same setup as api-gateway. The 1.5K-line `index.ts` runs as a single
instance per region; clients connect to the nearest region.

### Cloudflare Durable Objects

For globally-replicated WebRTC signaling:

```ts
// signaling-do.ts
export class SignalingRoom {
  state: DurableObjectState;
  peers = new Map<string, WebSocket>();

  async fetch(request: Request) {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    server.addEventListener('message', (msg) => this.broadcast(msg));
    return new Response(null, { status: 101, webSocket: client });
  }
}
```

Wins:

- Global edge (40+ locations).
- Strongly consistent — no sticky-session hack.
- ~$0.15/M requests.

Loses:

- Migration is L-effort (port the 1.5K LOC).
- Cloudflare-only.

## 4. Multi-region patterns

### Edge functions vs origin functions

| Edge functions                       | Origin functions          |
| ------------------------------------ | ------------------------- |
| Run at 40+ PoPs globally             | Run at 1–4 fixed regions  |
| ~10ms cold start                     | ~100–500ms cold start     |
| Limited Node API (no `pg`, `argon2`) | Full Node API             |
| Cap: ~50ms CPU per request           | Cap: ~10s CPU per request |
| Stream-friendly                      | Stream-friendly           |

Rule: **edge for read paths**, **origin for write paths or anything
needing argon2 / pg / heavy compute**.

### Database in multi-region

Three patterns:

1. **Primary + read replicas.** Writes go to one region, reads can hit
   any. Eventually consistent reads. Easiest. See `docs/SCALING.md`
   §"Read replicas".

2. **Geo-partitioning.** Different rows live in different regions
   (e.g. EU users on `db.eu`, US users on `db.us`). Hard. Don't do this
   until you have a regulatory requirement (GDPR strict residency).

3. **Multi-master (CRDT).** Write anywhere, conflicts auto-resolve.
   Postgres doesn't do this natively — use CockroachDB, FaunaDB, or
   PlanetScale. Big architectural change.

### CDN + cache

Vercel ships a global CDN automatically. For self-hosted, put Cloudflare
in front:

```
Browser → Cloudflare (cache hit) → 5ms
Browser → Cloudflare (cache miss) → Origin → 50–500ms
```

Cache TTLs:

- Static assets: 1 year, content-hashed.
- API GET responses: 60s default, route-specific override.
- Image / file downloads: 1 hour.

## 5. Domain switching

Today: `agiworkforce.com`. To swap domains (acquisition, rebrand):

### Web

1. Add new domain to Vercel project. Vercel handles SSL automatically.
2. Update `NEXT_PUBLIC_APP_URL` env var.
3. Set old domain as a 301 redirect in Vercel:
   ```
   Source:      https://agiworkforce.com/(.*)
   Destination: https://newdomain.com/$1
   Permanent:   yes
   ```

### Stripe

Webhook URL is fixed in Stripe dashboard. Update:

```
https://agiworkforce.com/api/stripe-webhook
→
https://newdomain.com/api/stripe-webhook
```

Then rotate `STRIPE_WEBHOOK_SECRET`.

### Supabase callback

OAuth redirect URLs are configured in Supabase Auth → URL Configuration.
Update:

```
Site URL: https://agiworkforce.com
Redirect URLs: https://agiworkforce.com/auth/callback
```

### Mobile / Desktop / Extension

`apps/mobile/app.json`, `apps/desktop/src-tauri/tauri.conf.json`, and
`apps/extension/manifest.json` reference the hardcoded API URL. Each
needs:

1. Bump version.
2. Replace `agiworkforce.com` with `newdomain.com`.
3. Re-sign + re-publish.

### CLI

`apps/cli` reads `~/.agiworkforce/config.toml` — no domain hardcoded.
Default endpoint is set in code; bump release.

### DNS cutover

Lower TTLs to 60s a week before cutover. Switch records. Old domain's
301 redirects keep deep links working forever.

## 6. Environments

| Environment | Purpose             | URL                       | DB                                 |
| ----------- | ------------------- | ------------------------- | ---------------------------------- |
| `prod`      | Customer-facing     | agiworkforce.com          | Supabase prod                      |
| `staging`   | Pre-prod, manual QA | staging.agiworkforce.com  | Supabase staging                   |
| `preview`   | Per-PR via Vercel   | <branch>.agiworkforce.com | Supabase staging                   |
| `dev`       | Local               | localhost:3000            | Supabase staging or local Postgres |

Branches deploy to preview automatically via Vercel. `staging` mirrors
prod weekly via `pg_dump | pg_restore` (or Supabase branching when GA).

## 7. CI/CD

10 GitHub workflows live in `.github/workflows/`:

| Workflow                      | Triggers                  | Purpose                          |
| ----------------------------- | ------------------------- | -------------------------------- |
| `ci.yml`                      | PR + push                 | Lint, typecheck, test            |
| `release.yml`                 | tag `v*`                  | Publish npm / brew / cargo       |
| `release-desktop.yml`         | tag `v-desktop-*`         | Build + sign Tauri bundles       |
| `release-cli.yml`             | tag `v-cli-*`             | Build + publish CLI binaries     |
| `build-windows-release.yml`   | matrix from `release.yml` | Windows-specific signing         |
| `e2e-tests.yml`               | nightly                   | Playwright across surfaces       |
| `deploy-signaling-server.yml` | push to main              | Auto-deploy to Fly.io            |
| `codeql.yml`                  | weekly                    | Security scanning                |
| `actions-pinned-check.yml`    | PR + push                 | Verify GitHub Actions are pinned |
| `agiworkforce-bot.yml`        | comment trigger           | PR ops bot                       |

Auto-deploy on `main` push for the api-gateway + signaling-server.
Web deploys via Vercel's GitHub integration on push.

## 8. Disaster recovery

### Database

- Supabase: daily snapshots, kept 7 days. Pro tier extends to 30 days.
- Neon: point-in-time restore to any second within retention (1 day on
  free, 7+ on paid).
- RDS: configurable retention up to 35 days + snapshots.

For **catastrophic** loss (region down for hours):

1. Weekly `pg_dump` to S3 + Glacier — owned by us, not the vendor.
2. Restore drill quarterly.
3. RPO target: 1 hour. RTO target: 4 hours.

### Static assets

R2 / S3 cross-region replication. ~$0.02/GB/mo for redundancy.

### Code

GitHub is single-source. Mirror to GitLab weekly via
`git push --mirror gitlab`.

### Secrets

- Today: Vercel + Fly.io built-in secret stores.
- Future: HashiCorp Vault for centralized rotation.

## 9. Observability

- **Logs**: pino (structured JSON) → Vercel logs / Fly.io logs / Better
  Stack.
- **Metrics**: PostHog for product, Vercel Analytics for web vitals.
- **Tracing**: OpenTelemetry-compatible — Sentry is the current sink.
- **Alerts**: PagerDuty integration on Sentry; severity-based routing.

For self-hosted: Grafana + Loki + Prometheus + Tempo stack (~$0 if you
run it, ~$200/mo for Grafana Cloud).

## 10. Disaster runbooks (one-pagers, TODO)

- `runbooks/db-down.md` — TODO
- `runbooks/region-out.md` — TODO
- `runbooks/stripe-webhook-storm.md` — TODO
- `runbooks/llm-provider-down.md` — multi-provider failover already
  partially handled via in-thread switch; a runbook formalizes it.
