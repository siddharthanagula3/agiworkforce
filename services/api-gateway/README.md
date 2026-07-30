# API Gateway Service

Status: Current
Owner role: Backend/data owner
Last updated: 2026-07-30
Kind: service
Criticality: high

## Purpose

`services/api-gateway` owns the Node/Express API gateway used for mobile companion and future managed/private compute experiments. It coordinates provider adapters, skills, MCP, auth, rate limits, and backend-facing service behavior.

## Consumers

- Mobile and web clients where gateway routes are enabled.
- Future managed/private compute runners.
- Enterprise admin clients for policy, audit, usage-ledger, and support workflows.
- Provider adapter packages and Neon-backed backend flows.

## Public API / Exports

This service exposes HTTP/WebSocket routes from `src/`. It is not imported by apps or packages.

Reusable schemas must live in `packages/contracts/types`; provider calls must go through provider packages; shared runtime behavior belongs in `packages/client/client-runtime` or `packages/ai/provider-runtime`.

## What Belongs Here

- Gateway-specific HTTP/WebSocket route handlers.
- Auth, rate limiting, request validation, and backend orchestration.
- Server-only provider/MCP/skills coordination.
- Service tests and deployment config.

## What Does Not Belong Here

- UI code.
- Shared provider implementations.
- Billing ledger source of truth until the managed-cloud policy is approved.
- Secrets, local `.env`, build output, or generated reports.

## Key Files

- `src/` - service source.
- `src/routes/enterprise.ts` - enterprise control-plane route foundation.
- `__tests__/` - service tests.
- `Dockerfile` - container build.
- `mcp-servers.json` - service MCP server config.
- `.env.example` - env template.

## Commands

- `pnpm --filter @agiworkforce/api-gateway build`
- `pnpm --filter @agiworkforce/api-gateway test`
- `pnpm --filter @agiworkforce/api-gateway lint`
- `pnpm --filter @agiworkforce/api-gateway dev`

## Environment / Secrets

Use `.env.example` as the key/reference contract and export local values from
the shell; the gateway runtime does not load `.env` or `.env.local`. Never
commit JWT secrets, Neon service-role keys, provider keys, webhook secrets,
managed compute tokens, or production URLs that imply secret access.

After loading your local Zsh configuration, run
`pnpm env:doctor -- --scope gateway --mode production`; the command reports key
names only and never prints values.

`NEON_DATABASE_URL` backs two separate connection strategies out of `src/lib/neonClients.ts`:

- `getSystemClient(purpose)` — the one-shot `@neondatabase/serverless` `neon()` HTTP client with privileged database rights. Callers must name an allowlisted system purpose. It is reserved for pre-auth device authorization and health checks.
- `getUserScopedClient({ userId, token })` — a pooled `@neondatabase/serverless` `Pool` via `@agiworkforce/data-layer`'s `NeonDatabaseAdapter`. It binds Postgres RLS per request (`SET LOCAL ROLE app_rls` plus `request.jwt.claim.sub`) and fails closed: token-binding, role, policy, connection, and query failures never retry through the system client. Use the **pooled** Neon connection string (dashboard → Connection Details → "Pooled connection"). This requires the role and policies from `0037_rls_user_isolation.sql` and `0054_gateway_user_scope_rls.sql` to exist on the target database.

The privileged client is restricted to pre-auth device authorization and health
checks. Gateway chat, pairing, approval, and enterprise routes use canonical
tables plus `getUserScopedClient`; `0076` and `0077` own those schemas and RLS
policies. Do not add user-owned tables to a system-client allowlist.

Apply schema changes only through the root ledger runner:

- `pnpm db:migrate -- status`
- `pnpm db:migrate -- apply --target local|ci|branch|production`
- `pnpm db:migrate -- verify`
- `pnpm db:rls-probe -- --target local|ci|branch`

## Security, Privacy, Data Boundaries

Security/privacy review is required for auth, JWT handling, CORS, rate limits, provider routing, Managed mode, file handling, retention, logging, Neon service-role use, and any customer usage/credit flow.

Managed cloud is in public alpha and open by default — the private-beta/waitlist launch gate was removed (2026-06-27). `AGI_MANAGED_COMPUTE_PRIVATE_BETA` remains only as an incident-response kill-switch.

## Tests Required For Changes

- Route change: add/update request validation and service tests.
- Auth/rate limit/provider change: include negative tests.
- Managed compute or billing-adjacent change: require security/privacy and backend/data review.

## Release / Deployment Notes

Build the production image from the monorepo root:

```bash
docker build \
  --file services/api-gateway/Dockerfile \
  --build-arg RELEASE_SHA="$(git rev-parse HEAD)" \
  --tag agiworkforce-api-gateway:local \
  .
```

`GET /health` is an unthrottled process-liveness contract. `GET /ready`
returns 200 only after the listener is accepting traffic and the database
dependency responds; it returns 503 before startup completion, while draining,
or when the dependency is unavailable. Both HTTP responses and WebSocket
authentication carry a bounded `x-request-id` correlation value.

The process handles SIGTERM and SIGINT, removes itself from readiness first,
drains HTTP and WebSocket traffic, disposes database resources, and force-closes
remaining sockets after `SHUTDOWN_GRACE_MS` (25 seconds by default).

The root `.dockerignore` is the build-context security boundary. Do not build
from the service directory or add local `.env*` files to the context.

Deploy only through the CI-owned immutable-image workflow after explicit
environment review, rate-limit configuration, logging policy, and rollback
path.

## Known Caveats

- WebSocket pending commands and live connection ownership are process-local;
  keep one replica until the durable-state/two-replica ticket is complete.
- Readiness depends on the canonical Neon schema and returns 503 when it cannot
  verify that dependency.
- Enterprise routes are foundation endpoints only; public managed credits remain gated by ledger, cap, fraud, refund, dispute, and provider-term evidence.

## CODEOWNERS

Primary: Backend/data owner.
Secondary: Security/privacy for auth, provider routing, logging, files, retention, and usage/billing-adjacent behavior.
