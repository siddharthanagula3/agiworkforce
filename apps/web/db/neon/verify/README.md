# Verifying migrations and service SQL against a real Postgres

Every service test in `apps/web` mocks the database adapter. A query naming a
column that does not exist, casting wrongly, or violating a constraint passes
happily. This directory holds the recipe that catches those, and the harness
that found two real defects.

## Why bother

`check:neon-migrations` reads SQL as text. The unit suite mocks the adapter.
Between them they passed a migration set where all six new governance tables
granted `INSERT, UPDATE, DELETE` to `app_rls` while every one of their headers
said "writable by nobody through the application role" — see 0144.

## Bring up a throwaway database

```sh
docker run -d --name agi-migtest -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=agitest -p 55433:5432 postgres:16-alpine
```

## Apply the chain the way the runner does

Each file goes in its own transaction with the same timeouts
`scripts/lib/neon-migrations.mjs` sets. Applying them WITHOUT the transaction
produces a spurious failure on 0136 (`LOCK TABLE can only be used in transaction
blocks`) that does not happen in production.

```sh
for f in $(ls apps/web/db/neon/*.sql | sort); do
  { echo "BEGIN;"
    echo "SET LOCAL lock_timeout='10s';"
    echo "SET LOCAL statement_timeout='120s';"
    cat "$f"; echo
    echo "COMMIT;"
  } | docker exec -i agi-migtest psql -U postgres -d agitest -v ON_ERROR_STOP=1 -q \
    || echo "FAIL $(basename "$f")"
done
```

## Check the grants, not the SQL you wrote

The claim "writable by nobody" is about privileges, so read privileges:

```sql
SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
  FROM information_schema.role_table_grants
 WHERE grantee = 'app_rls'
 GROUP BY table_name ORDER BY table_name;
```

## Exercise RLS as the application role

`current_app_user_id()` reads `request.jwt.claim.sub` — a scalar GUC, not the
`request.jwt.claims` JSON blob a first guess reaches for. `SET LOCAL` needs a
transaction:

```sql
BEGIN;
SET LOCAL ROLE app_rls;
SET LOCAL "request.jwt.claim.sub" = '<user-id>';
SELECT count(*) FROM public.legal_holds;
COMMIT;
```

## Drive the services themselves

`service-sql-against-real-postgres.ts.txt` is a Vitest file that runs the real
SQL of the posture, model policy, connector policy, spend limit, usage, legal
hold, retention sweep, and audit streaming services against the real schema. It
is kept as `.txt` deliberately: it needs a live database on port 55433 and would
fail in CI, where no such database exists.

To use it, seed a workspace, copy it to
`apps/web/lib/services/__tests__/`, run it, and delete it again.

## Running the app itself against this database

The data layer speaks to Postgres over a WebSocket, so it cannot reach a plain
Postgres on TCP. Without the hook below, pointing `AGI_DATABASE_URL` at a local
database reaches "account_status lookup failed after retry; denying request
(fail-closed)" — the guard behaving correctly over a transport that cannot
connect.

`AGI_DATABASE_WS_PROXY` bridges that gap. It is loopback-only and refuses any
other host, because a deployment that picked the variable up from a stray export
would send database traffic and credentials over an unencrypted socket to
another machine.

```sh
docker run -d --name agi-wsproxy -p 5480:80   --add-host=host.docker.internal:host-gateway   -e APPEND_PORT=55433 -e ALLOW_ADDR_REGEX='.*'   ghcr.io/neondatabase/wsproxy:latest

# The app must be REBUILT after changing the data layer — `next start` serves
# the bundle, and a stale one silently ignores the hook.
NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm build

AGI_ALLOW_INVALID_ENV=1 AGI_DATABASE_WS_PROXY=localhost:5480 AGI_DATABASE_URL=postgresql://postgres:test@host.docker.internal/agitest CLERK_AUTHORIZED_PARTIES=http://localhost:3000 NEXT_PUBLIC_APP_URL=http://localhost:3000 EMAIL_HASH_PEPPER=$(openssl rand -hex 32)   npx next start
```

Two env guards will otherwise refuse to boot, and both are correct:
`EMAIL_HASH_PEPPER` must be set, and `APP_URL must use HTTPS in production`
unless `AGI_ALLOW_INVALID_ENV=1` says otherwise.

To seed a workspace worth testing against, insert an organization with
`billing_plan_tier = 'enterprise'`, an `organization_members` row with role
`owner` (a trigger refuses an organization with no owner), and set
`user_settings.settings->workspace->activeOrganizationId` to that organization —
that last one is how the app resolves scope.
