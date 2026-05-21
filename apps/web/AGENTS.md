# Web Agent Rules

Status: Current
Owner: Web lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `apps/web/README.md`.

## Scope

`apps/web` owns hosted account, projects, synced app chats, artifacts, waitlist/billing UI, admin paths, and web-only API routes.

## High-Risk Areas

- Auth, cookies, CSRF, CSP, iframe/artifact rendering, file uploads, provider routing, Supabase service-role use, billing, rate limits, and Local/BYOK/Managed labels.
- Do not put shared schemas, provider adapters, or desktop/CLI behavior in the web app.
- Root `supabase/` is canonical for migrations until the migration split is resolved.

## Verification

- Small change: `pnpm --filter @agiworkforce/web typecheck`
- Behavior/API change: `pnpm --filter @agiworkforce/web test`
- Build/routing change: `pnpm --filter @agiworkforce/web build`
- Repo-boundary change: `pnpm check:boundaries`
