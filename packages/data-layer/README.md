# @agiworkforce/data-layer

Cloud-provider-portable data layer for AGI Workforce. The seam that lets us swap **Supabase → Neon** (or PlanetScale, RDS, self-hosted Postgres) by changing a config value, NOT by rewriting feature code.

## Why this exists

The codebase couples tightly to Supabase today. As traffic + cost + compliance constraints evolve, we need to migrate to other providers without an N-month rewrite. This package is the boundary:

- Feature code calls `createDatabaseClient()` / `createAuthClient()` / `createStorageClient()` / `createRealtimeClient()`.
- The factory reads `AGI_*_PROVIDER` env vars and returns the right adapter.
- Adapters wrap each vendor SDK behind the same minimal interface.

See [`docs/SCALING.md`](../../docs/SCALING.md) for migration playbooks and [`docs/BILLION_DOLLAR_PLAYBOOK.md`](../../docs/BILLION_DOLLAR_PLAYBOOK.md) for the strategic context.

## Adapter status

| Adapter        | Database | Auth                        | Storage | Realtime |
| -------------- | -------- | --------------------------- | ------- | -------- |
| Supabase       | LIVE     | LIVE                        | LIVE    | LIVE     |
| Neon           | skeleton | —                           | —       | —        |
| Postgres (raw) | skeleton | —                           | —       | —        |
| Auth0          | —        | — (skeleton sketch in docs) | —       | —        |
| Clerk          | —        | —                           | —       | —        |
| Cognito        | —        | —                           | —       | —        |
| S3             | —        | —                           | —       | —        |
| R2             | —        | —                           | —       | —        |
| B2             | —        | —                           | —       | —        |
| Pusher         | —        | —                           | —       | —        |
| Ably           | —        | —                           | —       | —        |

"Skeleton" = throws `NotImplementedError` with a pointer to the migration steps. Implement when migrating.

## Usage

```ts
import {
  createDatabaseClient,
  createAuthClient,
  createStorageClient,
  createRealtimeClient,
} from '@agiworkforce/data-layer';

// Reads AGI_DATABASE_PROVIDER env (default 'supabase').
const db = createDatabaseClient();

// RLS-bound query against the user's JWT.
const rows = await db.withUser(userJwt).query<User>('SELECT * FROM users WHERE id = $1', [userId]);

// Or use the escape hatch for SDK-specific calls until query/execute RPCs ship:
const client = db.withUser(userJwt).raw();
const { data } = await client.from('users').select('*').eq('id', userId).single();
```

## Configuration

Environment variables read at runtime:

```bash
AGI_DATABASE_PROVIDER=supabase  # supabase | neon | postgres
AGI_AUTH_PROVIDER=supabase      # supabase | auth0 | clerk | cognito
AGI_STORAGE_PROVIDER=supabase   # supabase | s3 | r2 | b2
AGI_REALTIME_PROVIDER=supabase  # supabase | pusher | ably | self-hosted

# Plus the provider-specific connection vars (see SCALING.md)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
# OR
DATABASE_URL=postgresql://...
```

## Adding a new method to an interface

1. Add to `src/types.ts` with a JSDoc explaining the contract.
2. Implement in `src/adapters/supabase.ts` (today's default).
3. Stub in `src/adapters/neon.ts` and `src/adapters/postgres.ts` with `throw new NotImplementedError(...)`.
4. Add a unit test in `src/__tests__/`.

The interfaces are intentionally minimal: add a method only when at least one concrete adapter can implement it cheaply. Don't pre-design for hypothetical providers.

## Migration patterns

For each kind of move, see the linked playbook:

- **Supabase → Neon**: [SCALING.md § Database migration](../../docs/SCALING.md)
- **Supabase Auth → Clerk / Auth0 / Cognito**: [SCALING.md § Auth migration](../../docs/SCALING.md)
- **Supabase Storage → S3 / R2 / B2**: [SCALING.md § Storage migration](../../docs/SCALING.md)
- **Supabase Realtime → Pusher / Ably / self-hosted**: [SCALING.md § Realtime migration](../../docs/SCALING.md)

## Vertical slice

`apps/web/app/api/me/route.ts` is the proof-of-concept route using `@agiworkforce/data-layer`. Read its inline migration guide as the template for migrating the remaining ~90 web routes.
