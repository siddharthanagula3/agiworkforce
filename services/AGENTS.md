# Services Agent Rules

Status: Current
Owner: Backend/data owner
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then the service README closest to the code.

## Scope

`services/` owns API gateway, signaling, and future managed/private compute services.

## High-Risk Areas

- Auth, JWTs, CORS, rate limits, WebSockets, provider routing, managed compute, logging, retention, file handling, and usage/billing-adjacent behavior.
- Services must not import UI packages.
- Managed cloud stays waitlisted/private beta until ledgering, metering, fraud, refunds, chargebacks, abuse controls, retention, deletion, and provider terms are solved.

## Verification

- API gateway: `pnpm --filter @agiworkforce/api-gateway test`
- Signaling: `pnpm --filter @agiworkforce/signaling-server test`
- Boundary changes: `pnpm check:boundaries`
