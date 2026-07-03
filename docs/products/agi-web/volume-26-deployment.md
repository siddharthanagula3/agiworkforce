# AGI Web — Volume 26 — Deployment

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/web/AGENTS.md`, and real repo paths — `apps/web/vercel.json`, `apps/web/proxy.ts`, `apps/web/next.config.ts`, `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`, `apps/web/lib/sentry-shared.ts`, `apps/web/lib/logger.ts`, `apps/web/lib/server/health-check.ts`, `apps/web/app/api/health/route.ts`, `apps/web/app/status/page.tsx`, `apps/web/lib/managed-compute-gate.ts`, `apps/web/app/api/cron/reset-credits`, `.github/workflows/ci.yml`.

## Overview & stance

AGI Web is the **cloud-only** surface: no BYOK, no Local mode, ever. Deployment therefore serves exactly one trust boundary — Managed Cloud (public alpha, open by default for signed-in users; founder decision 2026-06-27). There are no on-device build artifacts, no local runtime host, and no per-device signing to ship; the deliverable is one Next.js 16 App Router application deployed on Vercel, backed by Clerk (auth), Neon Postgres (RLS), and Stripe (billing). Because Web hosts the Neon delta-sync APIs (`apps/web/app/api/{chat,memory,projects}/sync`) that Mobile and Desktop depend on, a Web deployment is a _shared-fabric_ deployment: a bad release breaks cross-device sync for every surface. That raises the bar on canary, rollback, and monitoring. The `proxy.ts` contract (Next.js 16 uses `proxy.ts` with an exported `proxy` function — never `middleware.ts`) is a deployment invariant: renaming it silently disables auth gating and per-request CSP nonces in production.

## CI/CD

✅ Built — `.github/workflows/ci.yml`, `apps/web/vercel.json`. CI runs on `push`/`pull_request` to `main` (docs/markdown-ignored), with concurrency cancellation. Blocking gates include `pnpm audit --audit-level=critical` and `--audit-level=high`, `pnpm lint` (`--max-warnings=0`, including the ESLint `no-restricted-syntax` rule that flags hardcoded model IDs and direct cloud DB clients), a Rust hardcoded-model-id gate (`scripts/check-no-hardcoded-models.sh`), and a conflict-marker gate. Vercel is the CD system: `vercel.json` sets `framework: nextjs`, a pnpm-pinned `buildCommand` (`apps/web/scripts/build-with-chat.sh`), and `git.deploymentEnabled.main: true`. Requirement: every PR produces a Vercel Preview deployment; only `main` promotes to Production. Additional E2E and CodeQL workflows (`e2e-tests.yml`, `codeql.yml`, `actions-pinned-check.yml`) must stay green before promotion.

## Feature Flags

🟡 Partial — `apps/web/lib/managed-compute-gate.ts`. Flags today are **environment-variable gates**, not a flag service. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an incident-response kill-switch (set `0`/`false`/`off` to re-gate managed compute; any other value keeps it open), and Sentry/CDN behavior keys off `NODE_ENV` + DSN presence. Gap: there is no runtime flag SDK, no per-user/percentage targeting, and no audit trail of flag flips — flag changes require an env change and redeploy. 🔭 Planned: a typed flag registry with server-evaluated targeting so alpha features can ship dark without a redeploy. Requirement: no flag may relax a trust boundary (a flag can never route Local/BYOK data into Cloud — Web has neither mode anyway).

## Canary Releases

🔭 Planned. The repo has no weighted/canary rollout config; `git.deploymentEnabled.main` promotes the whole app at once. Target: gate Production promotion behind a canary that serves a small traffic slice (Vercel Skew Protection + a staged rollout), with automatic abort on error-rate or `/api/health` regression. Until built, the substitute control is mandatory Preview verification (auth redirect, CSP nonce present, `/status` green, sync round-trip) before merging to `main`.

## Rollback

🟡 Partial — `apps/web/vercel.json` (`git.deploymentEnabled.main`). Application rollback uses Vercel's instant "promote previous deployment" (immutable build reuse), which is platform-provided and fast. Gap: there is no repo runbook or scripted rollback, and **database migrations are not auto-reverted** — canonical migrations live in `apps/web/db/neon` and must be written forward-compatible so an app rollback never lands on an incompatible schema. Requirement: additive migrations only during a release window; destructive changes ship one release after the code that stops using the column. 🔭 Planned: a documented one-command rollback tied to a health probe.

## Monitoring

✅ Built — `apps/web/lib/server/health-check.ts`, `apps/web/app/api/health/route.ts`, `apps/web/app/status/page.tsx`, `apps/web/vercel.json` crons. `runHealthChecks()` probes Neon (`select 1`), Stripe connectivity, and required env, returning `healthy|degraded|unhealthy` without leaking which vars are missing. `/status` calls the checker directly (not via a self-request URL — Host-header SSRF was closed 2026-06-11). A daily cron (`/api/cron/reset-credits`, `0 0 * * *`) is a monitored scheduled job. Requirement: `/api/health` stays public + rate-limited and is the promotion/rollback signal.

## Logging

✅ Built — `apps/web/lib/logger.ts`. Structured Pino logging: `pino-pretty` in development, JSON in production, level from `LOG_LEVEL`. Requirement: never log prompts, message content, tokens, keys, or Authorization/cookie headers — health and gate logs already log counts/redacted fields only (`health-check.ts` logs missing-var _names_ server-side but exposes only a count to clients). Vercel captures stdout for function logs; no separate sink is required for the alpha.

## Observability

✅ Built (default-off) — `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`, `apps/web/lib/sentry-shared.ts`. Sentry initializes only when `NODE_ENV === 'production'` AND a DSN is set; `sendDefaultPii: false` plus an aggressive `beforeSend` scrub redact prompts, messages, tokens, cookies, email/phone, and keys, keeping only a stable user `id`. `onRequestError = Sentry.captureRequestError` captures App Router server errors. Vercel Web Analytics/Speed Insights are permitted via CSP `connect-src` (`vitals.vercel-insights.com`). Gap/requirement: Sentry stays disabled without a DSN — no error telemetry until one is provisioned in Production.

## CDN

🟡 Partial (platform-provided) — `apps/web/vercel.json` (`framework: nextjs`), `apps/web/next.config.ts`. Static assets, RSC payloads, and images are served from Vercel's Edge Network; `img-src 'self' data: blob: https:` in the `proxy.ts` CSP admits remote images. There is no custom cache-control or asset-prefix layer in the repo. Requirement: the `proxy.ts` `matcher` must keep excluding `_next/static`, `_next/image`, and static image extensions so CDN-cacheable assets are not run through auth/CSP middleware. 🔭 Planned: explicit cache-control policy per route class and an artifact-sandbox CDN origin (`NEXT_PUBLIC_SANDBOX_ORIGIN`) hardening.

## Scaling

🟡 Partial (platform-provided) — Vercel serverless functions autoscale per route; Neon is serverless Postgres. Stripe-webhook and audio-transcription routes are excluded from `proxy.ts` and pinned `runtime = 'nodejs'` so HMAC/multipart handling is stable under scale. The delta-sync routes (`apps/web/app/api/{chat,memory,projects}/sync`) are cursor + tombstone + idempotent-upsert, so they tolerate concurrent multi-device fan-out. Gap: no load/soak test in CI and no explicit connection-pool ceiling documented. Requirement: sync endpoints stay idempotent and RLS-scoped; a burst must never cross user rows.

## Repository map

- `apps/web/vercel.json` — Vercel build/rewrite/cron config.
- `apps/web/proxy.ts` — exported `proxy`; CSP nonce, auth gating, matcher.
- `apps/web/next.config.ts` — Turbopack, build-error strictness.
- `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`, `apps/web/lib/sentry-shared.ts` — observability.
- `apps/web/lib/logger.ts` — structured logging.
- `apps/web/lib/server/health-check.ts`, `apps/web/app/api/health/route.ts`, `apps/web/app/status/page.tsx` — monitoring.
- `apps/web/lib/managed-compute-gate.ts` — kill-switch flag.
- `apps/web/app/api/cron/reset-credits`, `apps/web/app/api/{chat,memory,projects}/sync`, `apps/web/db/neon` — scheduled jobs, sync, migrations.
- `.github/workflows/ci.yml`, `e2e-tests.yml`, `codeql.yml` — CI.

## Competitor notes

Claude, ChatGPT, and Codex ship single-vendor cloud web apps with provider-owned infra and closed telemetry. AGI Web diverges deliberately: it is one node in a **multi-surface, per-trust-mode** system — its deployment must protect the boundary that Desktop/CLI/VS Code keep BYOK and Local off-cloud, and Web itself never gains BYOK or Local. Where competitors centralize compute, AGI Web only hosts Managed-Cloud state and the delta-sync fabric that lets local-first surfaces stay local. Observability is privacy-first (default-off, scrubbed) rather than vendor-default-on.

## Acceptance / Definition of Done

Production-ready gate: CI green (audit/lint/model-id gates), a Preview deployment verified, `/api/health` healthy, Sentry configured in Production, migrations forward-compatible, and `proxy.ts` intact.

- [ ] Build/CD: `pnpm lint`, `pnpm --filter @agiworkforce/web build`, and E2E pass; Vercel Preview promotes to Production only from `main`.
- [ ] Trust: no BYOK/Local affordance exists on Web; managed-compute kill-switch behaves; sync stays RLS-scoped, Managed-Cloud-only.
- [ ] Security: per-request CSP nonce present; no secrets/prompts in logs or Sentry; Stripe-webhook route excluded from `proxy.ts` and `runtime = 'nodejs'`.

## Anti-patterns

- Renaming `proxy.ts` to `middleware.ts` or unexporting `proxy` (breaks auth + CSP).
- Adding a BYOK or Local affordance, or routing Local/BYOK data into Web (Web has neither trust mode).
- Enabling Sentry with PII, or logging prompts/messages/tokens/cookies.
- Destructive migrations shipped with the code that still reads the column (blocks rollback).
- Hardcoding or inventing model IDs (use `packages/types/src/models.json`), routes, env vars, or INR prices; referencing removed tiers (Plus/pro_plus/Hobby) or credit top-ups.
- Referencing Supabase — the stack is Clerk + Neon + Stripe.
- Claiming canary/auto-rollback as shipped — both are 🔭 Planned.
