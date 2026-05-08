# Scaling

> Migration playbooks for swapping Supabase out, scaling reads + writes, and
> handling heavy traffic. Companion to `docs/ARCHITECTURE.md` and
> `docs/HOSTING.md`.

## TL;DR

The codebase couples to Supabase today. The `@agiworkforce/data-layer`
package is the seam for swapping it out. This document is the
**migration playbook** — exact steps, env vars, gotchas, rollback plan.

## Migration roadmap

| Tier             | Provider today   | Migration target   | Effort | When                        |
| ---------------- | ---------------- | ------------------ | ------ | --------------------------- |
| Database         | Supabase         | Neon               | M      | When DB cost > $1K/mo       |
| Database (heavy) | Supabase         | RDS / Cloud SQL    | L      | When write-QPS > 5K/s       |
| Auth             | Supabase Auth    | Clerk / Auth0      | L      | If Supabase Auth bottleneck |
| Storage          | Supabase Storage | S3 / R2            | S      | When storage cost > $200/mo |
| Realtime         | Supabase RT      | Pusher / self-host | M      | When concurrent ws > 50K    |
| Rate limit       | Upstash          | Cloudflare KV      | S      | If multi-region needed      |

Effort: **S** = days, **M** = weeks, **L** = month-plus.

## 1. Supabase to Neon (database only)

Why: Neon (https://neon.tech) is serverless Postgres, 10x cheaper than
Supabase Pro at small scale, autoscales. No Auth / Storage / Realtime
included — pair with separate adapters.

### Steps

1. **Provision Neon.**
   - Create a project in `us-east-2` (matches our current region).
   - Copy the connection string.

2. **Schema migration.**
   - Canonical SQL is in `supabase/migrations/`.
   - Vanilla Postgres — copy verbatim. RLS policies port without change.
   - Run with `psql` or `node-pg-migrate`.

   ```bash
   for f in supabase/migrations/*.sql; do
     psql "$NEON_URL" -f "$f"
   done
   ```

3. **Auth swap.** Neon doesn't ship auth. You MUST pick:
   - **Clerk** (recommended for fastest time-to-value; ~$25/mo for first
     10K MAU).
   - **Auth0** (enterprise SSO, ~$240/mo for 1K MAU).
   - **Cognito** (cheapest, AWS-native, painful DX).

   Each issues JWTs with a `sub` claim. RLS policies that today read
   `auth.uid()` need to read
   `current_setting('request.jwt.claims', true)::json->>'sub'`. Write a
   small migration:

   ```sql
   -- For every policy:
   alter policy "users see own rows" on conversations
     using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid);
   ```

4. **Implement the Neon adapter.** Today `packages/data-layer/src/adapters/neon.ts`
   throws `NotImplementedError`. To finish:

   ```bash
   pnpm --filter @agiworkforce/data-layer add @neondatabase/serverless
   ```

   Replace the skeleton class with the reference implementation
   documented in the file's JSDoc.

5. **Switch env vars.**

   ```bash
   AGI_DATABASE_PROVIDER=neon
   AGI_DATABASE_URL=postgresql://user:pwd@ep-xxx.us-east-2.aws.neon.tech/db?sslmode=require
   AGI_AUTH_PROVIDER=clerk           # or auth0 / cognito
   ```

6. **Migrate data.**
   - Use `pg_dump` from Supabase, `pg_restore` to Neon.
   - For zero-downtime, set up logical replication first (Supabase can
     act as the publisher; Neon as subscriber).
   - Plan a 5-10 minute read-only window during the cutover.

7. **Cutover.**
   - Update Vercel env vars.
   - Redeploy.
   - Verify `/api/me` returns 200 from a real account.
   - Monitor `error rate` for 30 minutes.

8. **Rollback plan.** If anything is wrong, flip env back and redeploy.
   The data-layer abstraction means there's no code rollback needed.

### Gotchas

- **`exec_sql` RPC.** Our Supabase adapter calls a custom RPC that wraps
  raw SQL. The Neon adapter uses real SQL strings — better, but you need
  to drop `exec_sql_count` and use Postgres's native `RETURNING` clauses.
- **Realtime is gone.** Postgres LISTEN/NOTIFY works on Neon but is not
  high-fan-out. Pair with Pusher/Ably; see §"Realtime migration".
- **Storage is gone.** See §"Storage migration".
- **Connection limits.** Neon's serverless tier supports thousands of
  concurrent HTTP-pooled connections; if you stay on long-lived TCP
  (`pg.Pool`), cap at 100 / pod and use external pooling.

## 2. Auth provider migration

Pick one IdP. The new IdP issues JWTs that we verify in
`AuthAdapter.verifyJwt()`.

### Clerk

**Pros**: drop-in, great DX, free up to 10K MAU, ships UI components.
**Cons**: opinionated, harder to self-host.

Implementation sketch (replace `SupabaseAuthAdapter`):

```ts
import { verifyToken } from '@clerk/backend';

export class ClerkAuthAdapter implements AuthAdapter {
  constructor(private secret: string) {}

  async verifyJwt(token: string): Promise<VerifiedJwt | null> {
    try {
      const claims = await verifyToken(token, { secretKey: this.secret });
      return {
        userId: claims.sub,
        email: typeof claims['email'] === 'string' ? claims['email'] : undefined,
        raw: claims,
      };
    } catch {
      return null;
    }
  }
  // ...
}
```

### Auth0

```ts
import { auth, requiresAuth } from 'express-openid-connect';
import jwksClient from 'jwks-rsa';
import jwt from 'jsonwebtoken';

const client = jwksClient({ jwksUri: 'https://YOUR_DOMAIN/.well-known/jwks.json' });
async function verify(token: string) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header.kid) return null;
  const key = await client.getSigningKey(decoded.header.kid);
  return jwt.verify(token, key.getPublicKey(), { algorithms: ['RS256'] });
}
```

### Cognito

```ts
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_POOL_ID!,
  tokenUse: 'access',
  clientId: process.env.COGNITO_CLIENT_ID!,
});
const claims = await verifier.verify(token);
```

### Cookie-flow caveat

Our `apps/web/app/api/me/route.ts` uses `@supabase/ssr` for the cookie
flow on web. This is **identity-provider specific** — when migrating, you
swap to the IdP's SSR helper:

| IdP      | SSR helper                             |
| -------- | -------------------------------------- |
| Supabase | `@supabase/ssr` (today)                |
| Clerk    | `@clerk/nextjs` (`auth()`)             |
| Auth0    | `@auth0/nextjs-auth0` (`getSession()`) |
| Cognito  | `aws-amplify/auth/server`              |

The data-layer's `AuthAdapter` only abstracts the **server-side JWT
verification**. Cookie/session flows are surface-specific.

## 3. Storage migration

Supabase Storage maps cleanly to S3 / R2 / B2. The `StorageAdapter`
interface is intentionally vendor-neutral.

### S3 / R2 / B2

```ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3StorageAdapter implements StorageAdapter {
  private s3: S3Client;
  constructor(opts: {
    region: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    this.s3 = new S3Client(opts);
  }

  async put(bucket: string, key: string, data: Uint8Array) {
    await this.s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data }));
    return { url: `https://${bucket}.s3.amazonaws.com/${key}`, key };
  }

  async signedUrl(bucket: string, key: string, ttlSeconds: number) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }
  // ...
}
```

R2 (Cloudflare): same SDK, `endpoint: https://<account-id>.r2.cloudflarestorage.com`.
B2: same SDK, `endpoint: https://s3.<region>.backblazeb2.com`.

### Pricing

| Provider        | Storage      | Egress         | Notes             |
| --------------- | ------------ | -------------- | ----------------- |
| Supabase        | $0.021/GB/mo | $0.09/GB       | Free up to 1GB    |
| AWS S3 Standard | $0.023/GB/mo | $0.09/GB       | + request fees    |
| Cloudflare R2   | $0.015/GB/mo | **$0** (zero!) | Wins at any scale |
| Backblaze B2    | $0.005/GB/mo | $0.01/GB       | Cheapest archival |

Recommendation: **R2** for new projects. Zero egress means you can serve
public assets directly without Cloudfront / CloudFlare in front.

### Migration

```bash
# Mirror Supabase Storage to R2:
aws s3 sync s3://supabase-bucket s3://r2-bucket --endpoint-url https://<account>.r2.cloudflarestorage.com
```

Then flip `AGI_STORAGE_PROVIDER=r2`.

## 4. Realtime migration

Supabase Realtime is fine up to ~10K concurrent ws. Beyond that:

### Pusher (managed)

```ts
import Pusher from 'pusher';
import PusherClient from 'pusher-js';

// Server:
const pusher = new Pusher({ appId, key, secret, cluster });
await pusher.trigger(channel, 'message', payload);

// Client:
const client = new PusherClient(key, { cluster });
const ch = client.subscribe(channel);
ch.bind('message', onMessage);
```

Pricing: $49/mo for 100 connections, $499/mo for 10K. Hard cap.

### Ably

Similar API to Pusher. Cheaper at scale ($30/mo for 100 connections,
$300/mo for 10K). Better global edge.

### Self-hosted (Cloudflare Durable Objects)

The cheapest option at scale. ~$0.15/M requests. Already use Fly.io for
`signaling-server`; could adapt that.

```ts
// packages/data-layer/src/adapters/cloudflare-do.ts (TODO)
export class DurableObjectRealtimeAdapter implements RealtimeAdapter {
  // POST /publish/:channel
  // GET /subscribe/:channel  (websocket)
}
```

### Migration

`packages/data-layer/src/adapters/supabase.ts:SupabaseRealtimeAdapter`
implements `subscribe()` + `publish()`. Replace with the new adapter,
flip `AGI_REALTIME_PROVIDER`. Channel names port without change.

## 5. Connection pooling for high traffic

Postgres has per-connection RAM overhead (~10MB / conn). At scale you
need a pooler.

### Supabase pooler (today)

Supabase ships PgBouncer at `db.<ref>.supabase.co:6543`. Use this URL
instead of the direct one when DB connection count > 50/pod.

### PgBouncer (self-hosted Postgres)

```ini
# /etc/pgbouncer/pgbouncer.ini
[databases]
agiworkforce = host=db-host port=5432 dbname=agiworkforce
[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
```

`pool_mode = transaction` is critical: it lets us multiplex thousands of
client connections onto ~25 backend connections.

### Neon serverless

Neon's HTTP driver does multiplexing for free — no PgBouncer.

### RDS Proxy

AWS-managed pooler. ~$0.015/hr/vCPU. Use when on RDS.

## 6. Read replicas

Postgres supports streaming replication. For analytics workloads:

```ts
// packages/data-layer/src/types.ts (TODO)
interface DatabaseAdapter {
  withReadOnly(): DatabaseAdapter;
  // ...
}
```

Implement: route SELECTs to a read pool, writes to the primary pool.
Stale-read tolerance must be measured per query — typically <1s lag.

| Provider  | Read replicas | Cost                  |
| --------- | ------------- | --------------------- |
| Supabase  | Pro tier      | +$25/mo per replica   |
| Neon      | Branches free | Branch = read replica |
| RDS       | Yes           | ~50% of primary cost  |
| Cloud SQL | Yes           | ~50% of primary cost  |

## 7. Rate limiting

Today: `@upstash/ratelimit` + Upstash Redis. Edge-friendly, single-region
(us-east-1). 199 callsites use `withRateLimit`.

### Multi-region

Switch to Cloudflare KV or Cloudflare Durable Objects for true edge
rate limits.

```ts
// pseudo
const RATE_LIMIT_KV = env.RATE_LIMIT_KV; // Cloudflare KV binding
const key = `rl:${ip}:${endpoint}`;
const count = parseInt((await RATE_LIMIT_KV.get(key)) ?? '0', 10);
if (count >= 100) return new Response('429', { status: 429 });
await RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 60 });
```

KV is eventually consistent (~60s globally). For tight burst caps, use
Durable Objects (single-region but strongly consistent).

## 8. Vertical-slice migration log

The route-by-route migration off direct `@supabase/supabase-js` calls.
PRs that migrate a route should append here.

| Route                          | Migrated   | PR     | Notes                                |
| ------------------------------ | ---------- | ------ | ------------------------------------ |
| `apps/web/app/api/me/route.ts` | 2026-05-08 | (this) | Proof-of-concept; pattern documented |
| `apps/web/app/api/llm/...`     | TODO       | —      | Hot path; needs careful streaming    |
| `apps/web/app/api/auth/...`    | TODO       | —      | Cookie flow stays on `@supabase/ssr` |
| `apps/web/app/api/billing/...` | TODO       | —      | Stripe webhooks use service-role     |

The pattern for each migration is documented at the top of
`apps/web/app/api/me/route.ts`.

## 9. Cost-aware routing (for LLM costs)

Not strictly a scaling-the-DB concern, but the dominant cost at our
scale. See `docs/PERFORMANCE.md` §"Cost-aware routing".

## 10. When NOT to migrate

Stay on Supabase if:

- Total monthly cost < $200.
- Engineering team < 3 people.
- No EU data-residency requirement (Supabase is US-only).

Migrate if:

- DB cost > $1K/mo (Neon is 5-10x cheaper at that scale).
- Need EU residency (Supabase doesn't have EU as of 2026-05).
- Need write QPS > 5K/s (Supabase pooler caps; RDS scales linearly).
- Want zero egress (R2 vs Supabase Storage).

## 11. Rollback strategies

Every migration should be reversible:

1. **DB:** keep Supabase running for 30 days post-cutover. Logical
   replication keeps it warm. Flip `AGI_DATABASE_PROVIDER` back if
   anything breaks.
2. **Auth:** issue dual-IdP JWTs (e.g. via Clerk + Supabase shadow
   account) for 30 days; verify both in `AuthAdapter`.
3. **Storage:** mirror new uploads to old bucket for 30 days.
4. **Realtime:** dual-publish for 30 days — clients ignore duplicates by
   message ID.
