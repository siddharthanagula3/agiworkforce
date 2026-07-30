# API Gateway Service

Status: Current
Owner role: Backend/data owner
Last updated: 2026-05-21
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

`NEON_DATABASE_URL` backs two separate connection strategies out of `src/lib/neonClients.ts`:

- `getSystemClient(purpose)` — the one-shot `@neondatabase/serverless` `neon()` HTTP client with privileged database rights. Callers must name an allowlisted system purpose. It is reserved for pre-auth device authorization, health checks, and compatibility access to tables whose schema is not owned by canonical migrations.
- `getUserScopedClient({ userId, token })` — a pooled `@neondatabase/serverless` `Pool` via `@agiworkforce/data-layer`'s `NeonDatabaseAdapter`. It binds Postgres RLS per request (`SET LOCAL ROLE app_rls` plus `request.jwt.claim.sub`) and fails closed: token-binding, role, policy, connection, and query failures never retry through the system client. Use the **pooled** Neon connection string (dashboard → Connection Details → "Pooled connection"). This requires the role and policies from `0037_rls_user_isolation.sql` and `0054_gateway_user_scope_rls.sql` to exist on the target database.

Gateway compatibility tables without a canonical migration remain explicit privileged operations with application ownership predicates. Current examples include `agent_approval_requests`, `chat_messages`, `conversations`, `messages`, `device_pairings`, and the enterprise extension tables. (The former `worker_registrations`/`work_units` examples were removed with the worker-control plane in W9, 2026-07-15.) Do not add RLS policies for these names until their schema owner and canonical migration are established.

## Security, Privacy, Data Boundaries

Security/privacy review is required for auth, JWT handling, CORS, rate limits, provider routing, Managed mode, file handling, retention, logging, Neon service-role use, and any customer usage/credit flow.

Managed cloud is in public alpha and open by default — the private-beta/waitlist launch gate was removed (2026-06-27). `AGI_MANAGED_COMPUTE_PRIVATE_BETA` remains only as an incident-response kill-switch.

## Tests Required For Changes

- Route change: add/update request validation and service tests.
- Auth/rate limit/provider change: include negative tests.
- Managed compute or billing-adjacent change: require security/privacy and backend/data review.

## Release / Deployment Notes

Deploy only with explicit environment review, rate-limit configuration, logging policy, and rollback path.

## Known Caveats

- Managed cloud is intentionally not a public default path.
- API gateway route mounting and future agents/MCP route decisions remain tracked in the parity TODO.
- Enterprise routes are foundation endpoints only; public managed credits remain gated by ledger, cap, fraud, refund, dispute, and provider-term evidence.

## CODEOWNERS

Primary: Backend/data owner.
Secondary: Security/privacy for auth, provider routing, logging, files, retention, and usage/billing-adjacent behavior.
