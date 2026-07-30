# Signaling Server

Status: Current
Owner role: Backend/data owner
Last updated: 2026-05-20
Kind: service
Criticality: medium

## Purpose

`services/signaling-server` owns real-time signaling for pairing, companion, collaboration, or remote-control flows that need a backend relay.

## Consumers

- Mobile/Desktop pairing and companion flows.
- Future local-host remote-control and notification workflows.
- Web or managed services when explicit signaling is required.

## Public API / Exports

This service exposes HTTP/WebSocket behavior from `src/`. It is not imported by apps or packages.

- `POST /pairings` — internal-secret-authenticated pairing creation.
- `GET /pairings/:code` — uniform, rate-limited live-session status.
- `POST /pairings/:code/claim` — rate-limited exchange of the 12-character manual Mobile code for its short-lived, role-bound WebSocket token.
- `DELETE /pairings/:code` — internal-secret-authenticated cancellation.
- `GET /ws` — token-authenticated Desktop/Mobile signaling and bounded relay.

Shared message schemas belong in `packages/contracts/types`; reusable queue/runtime behavior belongs in `packages/client/client-runtime`.

## What Belongs Here

- Signaling-specific HTTP/WebSocket routes.
- Pairing/session validation.
- Connection lifecycle, presence, relay, and rate-limit behavior.
- Service deployment config and tests.

## What Does Not Belong Here

- Chat persistence source of truth.
- Provider calls or model routing.
- UI code.
- Secrets, local `.env`, build output, or generated reports.

## Key Files

- `src/` - service source.
- `__tests__/` - service tests.
- `Dockerfile`, `fly.toml`, `railway.toml` - deployment config.
- `.env.example` - env template.

## Commands

- `pnpm --filter @agiworkforce/signaling-server build`
- `pnpm --filter @agiworkforce/signaling-server typecheck`
- `pnpm --filter @agiworkforce/signaling-server test`
- `pnpm --filter @agiworkforce/signaling-server dev`

## Environment / Secrets

Use `.env.example` as the template. Never commit service tokens, Neon credentials,
production URLs with credentials, pairing secrets, or relay credentials.

## Security, Privacy, Data Boundaries

Security/privacy review is required for pairing codes, auth tokens, WebSocket admission, CORS, rate limits, logging, message retention, and any relay of local/private content.

Signaling should carry only the minimum metadata needed to establish or coordinate a session. Manual codes are five-minute bearer secrets: never log them with role tokens, keep the claim endpoint uniformly fail-closed for invalid/expired input, and preserve its strict rate limit.

## Tests Required For Changes

- Route or WebSocket change: add/update service tests.
- Auth/pairing change: add negative tests for invalid, expired, reused, and cross-user tokens.
- Deployment change: verify env var and health-check behavior.

## Release / Deployment Notes

Deploy only with rate limits, health checks, logging policy, and rollback path verified.

## Known Caveats

- This is not the managed compute runtime. It should not become a dumping ground for model/provider execution.

## CODEOWNERS

Primary: Backend/data owner.
Secondary: Security/privacy for auth, pairing, relay, retention, and logging behavior.
