# API Gateway Service

Status: Current
Owner role: Backend/data owner
Last updated: 2026-05-20
Kind: service
Criticality: high

## Purpose

`services/api-gateway` owns the Node/Express API gateway used for mobile companion and future managed/private compute experiments. It coordinates provider adapters, skills, MCP, auth, rate limits, and backend-facing service behavior.

## Consumers

- Mobile and web clients where gateway routes are enabled.
- Future managed/private compute runners.
- Provider adapter packages and Supabase-backed backend flows.

## Public API / Exports

This service exposes HTTP/WebSocket routes from `src/`. It is not imported by apps or packages.

Reusable schemas must live in `packages/types`; provider calls must go through provider packages; shared runtime behavior belongs in `packages/runtime` or `packages/llm-runtime`.

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

Use `.env.example` as the template. Never commit JWT secrets, Supabase service-role keys, provider keys, webhook secrets, managed compute tokens, or production URLs that imply secret access.

## Security, Privacy, Data Boundaries

Security/privacy review is required for auth, JWT handling, CORS, rate limits, provider routing, Managed mode, file handling, retention, logging, Supabase service-role use, and any customer usage/credit flow.

Managed cloud must stay private beta/waitlisted until abuse, metering, fraud, refunds, disputes, retention, and provider terms are solved.

## Tests Required For Changes

- Route change: add/update request validation and service tests.
- Auth/rate limit/provider change: include negative tests.
- Managed compute or billing-adjacent change: require security/privacy and backend/data review.

## Release / Deployment Notes

Deploy only with explicit environment review, rate-limit configuration, logging policy, and rollback path.

## Known Caveats

- Managed cloud is intentionally not a public default path.
- API gateway route mounting and future agents/MCP route decisions remain tracked in the parity TODO.

## CODEOWNERS

Primary: Backend/data owner.
Secondary: Security/privacy for auth, provider routing, logging, files, retention, and usage/billing-adjacent behavior.
