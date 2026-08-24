# Verifying migrations and service SQL against a real Postgres

Every service test in `apps/web` mocks the database adapter. A query naming a
column that does not exist, casting wrongly, or violating a constraint passes
happily. This directory holds the recipe that catches those, and the harnesses
that found three real defects.

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

`audit-stream-live-delivery.ts.txt` drives a real signed delivery: it stands up
a TLS server with a throwaway certificate, points a destination at a
`192.0.2.0/24` address (RFC 5737 documentation space, which the egress guard
accepts because it is not private, and which never leaves the machine), and
routes the socket to the local receiver through the `fetchImpl` seam. The
receiver recomputes the HMAC independently. It found the cursor-precision
defect below.

### The defect this one found

`timestamptz` holds microseconds. A JS `Date` holds milliseconds. The cursor
was read out with `toIso()` and passed back as a query parameter, so
`2026-08-24T00:11:25.812267Z` became `.812` — strictly BEFORE the row it was
taken from. Every drain re-selected the tail of the batch it had just
delivered, and the stream never reached `nothing_due`.

Both directions had to change: the write now resolves `last_delivered_at` from
the event id inside SQL, and the read joins the destination row so the
comparison happens in the database. The cursor never crosses the JS boundary.
Unit tests could not see this — they mock the adapter, and a mock returns
whatever string the test wrote.

`connector-policy-live-catalog.ts.txt` watches a connector leave the offered
catalog. It seeds a verified `github_installations` row (which puts the static
GitHub tool defs in the catalog without any network call), then drives the real
`loadUserConnectorToolDefs` — the single function chat, scheduled tasks, and
cloud agent runs all load their catalog through. It asserts the connector is
present while ungoverned, gone once blocked, back when the block is lifted, and
gone again under an allowlist that omits it. The first assertion is what makes
the second meaningful: without it, "not offered" could mean the catalog was
empty all along.

Set the five `GITHUB_APP_*` variables to any non-empty values — the gate only
checks that they are present, and nothing calls GitHub.

`service-sql-against-real-postgres.ts.txt` is a Vitest file that runs the real
SQL of the posture, model policy, connector policy, spend limit, usage, legal
hold, retention sweep, and audit streaming services against the real schema. It
is kept as `.txt` deliberately: it needs a live database on port 55433 and would
fail in CI, where no such database exists.

To use either, seed a workspace, copy it to
`apps/web/lib/services/__tests__/`, run it FROM `apps/web` (the `@/` alias
resolves against that package's Vitest config, not the root one), and delete it
again. The delivery harness resets its own state, so it can be re-run.

## Read the Test Files line, not only the Tests line

A harness whose `beforeAll` throws reports `Tests 6 skipped (6)` — which scans
as green if you are grepping for failures. The suite-level result is on the
`Test Files` line, and it says `1 failed`. A skipped verification is worse than
a failed one, because it is silent.

Each harness owns and reseeds the rows it asserts on, so they can be run in any
order and twice in a row. They did not start that way: the audit-stream harness
counted the workspace's audit events, and the connector harness writes audit
events of its own, so running the second changed the first's answer.

## Driving the console and its enforcement in a browser

`apps/web/e2e/workspace-console.spec.ts` and
`apps/web/e2e/enterprise-enforcement.spec.ts` run against the local stack above
with `PLAYWRIGHT_REUSE_RUNNING_SERVER=1` and `CLERK_SECRET_KEY` exported. The
second one is the important one: it changes a control through the real API and
then makes a request that must be DENIED, because a PATCH returning 200 proves
only that a row was written.

Two things it must keep doing, both learned by getting them wrong:

- **Send `x-agi-surface`.** Managed Cloud refuses a request that does not name a
  supported client surface, and that gate fires BEFORE the workspace policy
  gate. Without the header the turn is still refused, for a different and
  correct reason, which would let the spec claim the policy bound when it had
  never been consulted. The spec now asserts the denial is NOT
  `managed_cloud_surface_unknown`.
- **Do not truncate the response.** The posture body is longer than 400
  characters, so a `slice(0, 400)` helper reports signals as missing that are
  present.

To confirm the enforcement assertions are not vacuous, flip the column in SQL
(`update organization_admin_policies set audit_export_enabled = false`) and
re-run: the spec must fail on the FIRST assertion, before it changes anything.

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
# Do NOT set APPEND_PORT. The hook already sends the full host:port in
# ?address=, and letting wsproxy append its own dials 5543355433 and fails.
docker run -d --name agi-wsproxy -p 5480:80 \
  --add-host=host.docker.internal:host-gateway \
  -e ALLOW_ADDR_REGEX='.*' \
  ghcr.io/neondatabase/wsproxy:latest

# The app must be REBUILT after changing the data layer — `next start` serves
# the bundle, and a stale one silently ignores the hook.
NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm build

AGI_ALLOW_INVALID_ENV=1 AGI_DATABASE_WS_PROXY=localhost:5480 AGI_DATABASE_URL=postgresql://postgres:test@host.docker.internal:55433/agitest CLERK_AUTHORIZED_PARTIES=http://localhost:3000 NEXT_PUBLIC_APP_URL=http://localhost:3000 EMAIL_HASH_PEPPER=$(openssl rand -hex 32)   npx next start
```

Two env guards will otherwise refuse to boot, and both are correct:
`EMAIL_HASH_PEPPER` must be set, and `APP_URL must use HTTPS in production`
unless `AGI_ALLOW_INVALID_ENV=1` says otherwise.

To seed a workspace worth testing against, insert an organization with
`billing_plan_tier = 'enterprise'`, an `organization_members` row with role
`owner` (a trigger refuses an organization with no owner), and set
`user_settings.settings->workspace->activeOrganizationId` to that organization —
that last one is how the app resolves scope.

## Seeding a workspace the console will actually accept

Four gates stand between a seeded row and a rendered console. Each is correct;
each looks like a bug until you know it.

```sql
-- 1. The profile, and its terms acceptance. The console layout redirects to the
--    terms page until terms_version equals POLICY_LAST_UPDATED.terms.
INSERT INTO public.profiles (id, email, terms_version, terms_accepted_at, terms_accepted_surface)
  VALUES ('<clerk-user-id>', 'qa@example.test', '<POLICY_LAST_UPDATED.terms>', now(), 'web')
  ON CONFLICT (id) DO UPDATE SET terms_version = excluded.terms_version,
                                 terms_accepted_at = excluded.terms_accepted_at;

-- 2. The organization. licensed_seats defaults to 1 and a CHECK refuses more
--    members than that, so set it before adding anyone.
INSERT INTO public.organizations (name, slug, licensed_seats, owner_user_id)
  VALUES ('Verified Co', 'verified-co', 25, '<clerk-user-id>');

-- 3. An OWNER member. A trigger refuses an organization left without one.
INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES ('<org-id>', '<clerk-user-id>', 'owner');

-- 4. THE ONE THAT COSTS A DAY: entitlement comes from the OWNER'S subscription,
--    not organizations.billing_plan_tier. Setting the org column alone leaves
--    plan: "free" and every admin API answers 403.
INSERT INTO public.subscriptions (user_id, plan_tier, status)
  VALUES ('<clerk-user-id>', 'enterprise', 'active')
  ON CONFLICT (user_id) DO UPDATE SET plan_tier = 'enterprise', status = 'active';

-- 5. Active scope. This is how the app resolves which workspace you are in.
UPDATE public.user_settings
   SET settings = jsonb_set(coalesce(settings, '{}'::jsonb),
                            '{workspace,activeOrganizationId}', to_jsonb('<org-id>'::text), true)
 WHERE user_id = '<clerk-user-id>';
```
