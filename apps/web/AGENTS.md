# Web Agent Rules

Status: Current
Owner: Web lead
Last updated: 2026-06-03

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
- Public pages, chat, connectors, plugins, auth, pricing, and settings must pass the unusual-behavior loop before handoff: readable UI in light/dark contexts, no dead primary controls, no confusing waitlist copy for usable Local/BYOK/plan-entitled features, no unexpected auth redirects, no signed-out API spam, and no visible console errors except intentional development-key warnings.
- Connector UI must use official product icons where available. Gmail, Google Calendar, Google Drive, Google Sheets, and other Google surfaces are separate connectors unless product requirements explicitly merge them.
- Hosted cloud upgrades may use request-access/waitlist flows, but signed-in Local/BYOK and plan-entitled hosted features should be shown as usable rather than globally waitlisted.

## Verification

- Small change: `pnpm --filter @agiworkforce/web typecheck`
- Behavior/API change: `pnpm --filter @agiworkforce/web test`
- Build/routing change: `pnpm --filter @agiworkforce/web build`
- Repo-boundary change: `pnpm check:boundaries`
