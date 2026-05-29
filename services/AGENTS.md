# Services Agent Rules

Status: Current
Owner: Backend/data owner
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then the service README closest to the code.

## Scope

`services/` owns API gateway, signaling, and future managed/private compute services.

## Lane Contract

- Primary lane: `backend-services`; enterprise-only admin route work may use `enterprise-admin-surface`.
- Owned write path: `services/**`, except files explicitly assigned to a narrower enterprise lane.
- Read-only context: `cloudDb/**`, `packages/types/**`, and `packages/data-layer/**`.
- Migrations, shared contracts, package manifests, and UI surfaces require their owner lane or integrator approval.

## Architecture Boundary

- Services are deployable server boundaries, not shared libraries for apps.
- Actions/routes own auth, ownership, privacy-mode policy, quota decisions, state transitions, and user-facing errors.
- Reusable provider, sandbox, API, generated-file, browser/computer-use, and transport mechanics belong in explicit service modules with structured inputs and outputs.
- Shared schemas belong in `packages/types`; apps and packages must not import service internals.

## High-Risk Areas

- Auth, JWTs, CORS, rate limits, WebSockets, provider routing, managed compute, logging, retention, file handling, and usage/billing-adjacent behavior.
- Services must not import UI packages.
- Managed cloud stays waitlisted/private beta until ledgering, metering, fraud, refunds, chargebacks, abuse controls, retention, deletion, and provider terms are solved.

## Verification

- API gateway: `pnpm --filter @agiworkforce/api-gateway test`
- Signaling: `pnpm --filter @agiworkforce/signaling-server test`
- Boundary changes: `pnpm check:boundaries`
