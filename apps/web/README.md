# Web App

Status: Current
Owner role: Web lead
Last updated: 2026-05-20
Kind: app
Criticality: high

## Purpose

`apps/web` owns the browser-hosted AGI Workforce application: account flows, waitlist/billing surfaces, synced Web/Mobile/Desktop chat, projects, artifacts, admin paths, and web-only API routes.

## Consumers

- End users in the hosted web product.
- Desktop web-build embedding through `apps/web/public/chat`.
- Backend/data owners for Supabase, billing, and API route behavior.

## Public API / Exports

This is an app, not a package. Other apps and packages must not import from `apps/web`.

Runtime API boundaries live under `app/api`, `api`, `lib`, and shared packages. Reusable contracts belong in `packages/types`, `packages/runtime`, `packages/providers`, or `packages/unified-chat`.

## What Belongs Here

- Next.js App Router routes and layouts.
- Web-specific account, billing, waitlist, project, artifact, admin, and chat UI.
- Web API routes that are specific to the hosted app.
- Web tests, Playwright config, and web deployment config.

## What Does Not Belong Here

- Shared provider/runtime schemas.
- Desktop-only local file or Tauri behavior.
- CLI or VS Code session logic.
- Secrets, generated build output, or long-lived reports.

## Key Files

- `app/` - App Router pages, layouts, and API routes.
- `features/` - product-domain feature code.
- `lib/` - web runtime helpers and server utilities.
- `public/` - shipped public assets only.
- `pnpm-workspace.yaml` - nested Vercel/web-subdirectory install adapter; root `pnpm-workspace.yaml` remains canonical for normal monorepo work.

## Commands

- `pnpm --filter @agiworkforce/web dev`
- `pnpm --filter @agiworkforce/web typecheck`
- `pnpm --filter @agiworkforce/web test`
- `pnpm --filter @agiworkforce/web build`
- `pnpm --filter @agiworkforce/web test:e2e`

## Environment / Secrets

Use `apps/web/.env.example` as the local template. Never commit `.env.local`, production secrets, Supabase service-role keys, Stripe live keys, provider API keys, or webhook secrets.

## Security, Privacy, Data Boundaries

Security/privacy review is required for auth, cookies, CSRF, CSP, iframe/artifact rendering, file uploads, generated files, provider routing, service-role Supabase use, billing, rate limits, and any Local/BYOK/Managed privacy-mode flow.

Local and BYOK payloads must not route through managed gateways unless the UI explicitly labels Managed mode and the user consents.

## Tests Required For Changes

- UI/domain change: run web typecheck and targeted Vitest tests.
- API/auth/billing/security change: run targeted tests plus relevant security grep/audit checks.
- Routing/build change: run `pnpm --filter @agiworkforce/web build`.
- Artifact/sandbox change: include iframe/CSP regression tests.

## Release / Deployment Notes

Web deploys through Next.js/Vercel-style hosting. Production releases must verify environment variables, Supabase migrations, Stripe webhook config, and sandbox origin config.

## Known Caveats

- `apps/web/pnpm-workspace.yaml` exists only so web-subdirectory installs treat the app as a workspace root when needed. Do not add packages there; update root `pnpm-workspace.yaml`.
- `build` currently embeds the Desktop web build under `/chat/`.

## CODEOWNERS

Primary: Web lead.
Secondary: Backend/data for API routes, Supabase, and billing. Security/privacy for auth, CSP, files, provider routing, and service-role behavior.
