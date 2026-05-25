# Web Agent Rules

Status: Current
Owner: Web lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `apps/web/README.md`.

## Scope

`apps/web` owns hosted account, projects, synced app chats, artifacts, waitlist/billing UI, admin paths, and web-only API routes.

## Lane Contract

- Primary lanes: `web-ui`, `web-api-billing`, and `enterprise-admin-surface`.
- `web-ui` owns product UI under `apps/web/app/**`, `components/**`, `features/**`, `hooks/**`, and `lib/**` except API/admin paths.
- `web-api-billing` owns Web API, auth, billing, and waitlist route mechanics.
- Enterprise admin work that also touches `services/api-gateway/src/routes/enterprise.ts` must use the enterprise lane or an integrator.
- Shared contracts, migrations, package manifests, and CI files are blocked from Web feature lanes.

## High-Risk Areas

- Do not put shared schemas, provider adapters, or desktop/CLI behavior in the web app.

## Verification

- Small change: `pnpm --filter @agiworkforce/web typecheck`
- Behavior/API change: `pnpm --filter @agiworkforce/web test`
- Build/routing change: `pnpm --filter @agiworkforce/web build`
- Repo-boundary change: `pnpm check:boundaries`
