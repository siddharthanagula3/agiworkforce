# AGI Web — Volume 17 — Analytics

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/web/AGENTS.md`; and the real Web paths this volume grounds in — `apps/web/core/monitoring/analytics-tracker.ts`, `apps/web/core/monitoring/system-monitor.ts`, `apps/web/components/GoogleAnalytics.tsx`, `apps/web/app/layout.tsx`, `apps/web/instrumentation-client.ts`, `apps/web/instrumentation.ts`, `apps/web/lib/sentry-shared.ts`, `apps/web/core/security/gradual-rollout.ts`, `apps/web/lib/managed-compute-gate.ts`, `apps/web/app/api/usage/analytics/route.ts`, `apps/web/proxy.ts`.

## Overview & stance

This volume defines product and operational analytics for AGI Web: user-behavior events, funnels, retention, session tracking, error monitoring, performance/RUM, and feature flags. AGI Web is the **cloud-only** surface — no BYOK, no Local mode — so analytics here observes only Managed-Cloud activity and account/billing state. There are no Local or BYOK rows on Web to protect from a sync leak, but the stronger rule still binds: **analytics must never capture conversation content** — prompts, messages, files, completions, or provider keys are out of scope for every telemetry sink. Web must also never ingest Local/BYOK telemetry produced by Desktop/CLI/VS Code; per-surface trust means each surface owns its own instrumentation and never back-channels private compute into Web's analytics. Web's own delta-sync APIs (`apps/web/app/api/{chat,memory,projects}/sync`) are the data plane, not an analytics plane. Where a capability is not built, it is marked 🔭 and must not be presented as shipped.

## Events

Client behavior events flow through two sinks. GA4 is wired via `apps/web/components/GoogleAnalytics.tsx` and rendered from `apps/web/app/layout.tsx` only when `NEXT_PUBLIC_GA_TRACKING_ID` is set; it fires `page_view` on every App Router navigation and honors the per-request CSP nonce from `apps/web/proxy.ts`. `apps/web/core/monitoring/analytics-tracker.ts` provides the typed event API (`trackEvent`, `trackPageView`, `trackEngagement`, `trackConversion`, `trackFeatureUsage`, `trackUserJourney`, `trackABTest`) and mirrors events into the monitoring bridge (`apps/web/core/monitoring/system-monitor.ts`). Requirements: every material user action emits a named event with a bounded, schema-typed property bag; property values must exclude message/content/PII (enforced consistent with the sensitive-key scrub below). **🟡 Partial** — the event API and GA4 wiring exist (`analytics-tracker.ts`, `GoogleAnalytics.tsx`), but there is no unified server-side event schema or warehouse; product events are client-only and GA4-scoped. Gap: a governed event catalog (names, versions, owners) and a first-party sink are 🔭.

## Funnels

Conversion funnels (visit → sign-up → first cloud chat → paid upgrade) must be defined declaratively, computed over first-party events, and segmentable by plan (Free / Basic / Pro / Max / Enterprise) without reading conversation content. The primitives exist — `trackConversion` and `trackUserJourney` in `apps/web/core/monitoring/analytics-tracker.ts` emit ordered journey steps and conversion markers — but there is no funnel definition, step-completion computation, or drop-off reporting. **🔭 Planned** — funnels are not built; only journey/conversion event primitives exist. Do not report funnel metrics until a first-party computation layer lands.

## Retention

Retention/cohort analysis (D1/D7/D30 return rates, cohort by signup week, plan-tier retention) must derive from account activity and Managed-Cloud usage rows, never from message bodies. The nearest built primitive is usage aggregation: `apps/web/app/api/usage/analytics/route.ts` computes daily tokens, cost, and session counts from Neon, RLS/user-scoped, over `7d/30d/90d/all` ranges — a metering dashboard, not retention cohorts. **🔭 Planned** — no cohort or return-rate computation exists. Requirement when built: cohorts computed from Clerk-identified account activity + Neon usage, exposed in `app/admin`, aggregate-only, no per-user content.

## Session Tracking

Session analytics covers session start/end, foreground/background, and duration — not "sessions" in the trust-boundary sense. `apps/web/core/monitoring/analytics-tracker.ts` records `sessionStartTime` and emits `session_start`, `session_end`, `page_hidden`, and `page_visible` with session duration, and exposes `getSessionData()`; `apps/web/core/monitoring/system-monitor.ts` mints a `sessionId`. Sentry contributes release/session health when enabled. **🟡 Partial** — client-side session lifecycle is instrumented (`analytics-tracker.ts`, `system-monitor.ts`), but there is no server-side session store or cross-visit stitching. Gap: durable session records keyed to Clerk user id (id only) are 🔭.

## Errors

Error monitoring is the most mature area. Sentry (`@sentry/nextjs` 10.53.1) initializes on the browser (`apps/web/instrumentation-client.ts`) and Node/edge runtimes (`apps/web/instrumentation.ts`), with `onRequestError`/`onRouterTransitionStart` captured. `apps/web/lib/sentry-shared.ts` enforces a privacy-first posture: **default-disabled** unless `NODE_ENV === 'production'` and a DSN (`NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`) is set; `sendDefaultPii: false`; and an aggressive `beforeSend`/`beforeBreadcrumb` scrub that drops request bodies, cookies, query strings, and all headers, keeps only a stable user `id`, and redacts any value under a sensitive key name (auth, cookie, token, prompt, message, content, conversation, completion, email, etc.). `analytics-tracker.trackError` and `system-monitor.captureError` route into the same sink. **✅ Built** — `apps/web/lib/sentry-shared.ts`, `apps/web/instrumentation{,-client}.ts`. Requirement: no new error path may bypass the shared scrub.

## Performance

Performance/RUM must capture Core Web Vitals (LCP, CLS, FID/INP, TTFB) and route-level timing without content. `apps/web/core/monitoring/system-monitor.ts` declares a `PerformanceMetrics` shape (FCP/LCP/CLS/FID/TTI) and sets up `PerformanceObserver`-based collection plus a Sentry tracing bridge; `apps/web/lib/sentry-shared.ts` sets `tracesSampleRate: 0.1`. There is no `web-vitals` library dependency and no dedicated RUM dashboard. **🟡 Partial** — collection scaffolding and 10% trace sampling exist (`system-monitor.ts`, `sentry-shared.ts`), but Web Vitals are not reported to a first-party store and there is no perf dashboard. Gap: `web-vitals` wiring + budget alerting are 🔭.

## Feature Flags

Feature flagging today is security-scoped: `apps/web/core/security/gradual-rollout.ts` provides `isFeatureEnabled` with deterministic per-user bucketing (anonymous traffic fails closed), percentage rollout, `targetUsers`/`excludeUsers`, date windows, error-threshold auto-rollback, and preset strategies (conservative/aggressive/beta/canary). Its `FeatureFlag` union is limited to security features, and storage is **in-memory** (the file itself notes production should use a DB or flag service). Separately, `apps/web/lib/managed-compute-gate.ts` reads the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env as an incident-response kill-switch (Managed Cloud is open by default; set `0`/`false`/`off` to re-gate). **🟡 Partial** — a deterministic rollout engine and the Cloud kill-switch exist, but there is no durable, product-wide flag store or admin UI. Gap: Neon-backed flag persistence + non-security flag domains are 🔭.

## Repository map

- `apps/web/core/monitoring/analytics-tracker.ts` — client event/journey/conversion API + GA4 bridge.
- `apps/web/core/monitoring/system-monitor.ts` — session id, performance observers, Sentry bridge.
- `apps/web/components/GoogleAnalytics.tsx`, `apps/web/app/layout.tsx` — GA4 wiring (env-gated, CSP nonce).
- `apps/web/instrumentation-client.ts`, `apps/web/instrumentation.ts`, `apps/web/lib/sentry-shared.ts` — Sentry init + PII scrub.
- `apps/web/core/security/gradual-rollout.ts`, `apps/web/lib/managed-compute-gate.ts` — rollout flags + Cloud kill-switch.
- `apps/web/app/api/usage/analytics/route.ts`, `apps/web/app/settings/usage/page.tsx` — Neon usage aggregation (RLS/user-scoped).
- `apps/web/proxy.ts` — CSP nonce that gates inline analytics scripts.

## Competitor notes

Claude, ChatGPT, and Codex ship heavy first-party product analytics tied to a single-provider funnel. AGI diverges deliberately: analytics is **privacy-first and content-blind** (Sentry default-disabled with a mandatory scrub), **per-surface trust** (Web never ingests Local/BYOK telemetry from Desktop/CLI/VS Code, and local-first surfaces keep their own instrumentation), and **multi-provider-aware** (funnels/retention segment by plan and, where applicable, model routing, without leaking which model a private session used). Cloud-only Web is the one surface where server-side product analytics is appropriate at all — the local-first surfaces minimize telemetry by design.

## Acceptance / Definition of Done

Production-ready gate: every analytics sink is default-safe (off without explicit config), passes the sensitive-key scrub, respects the CSP nonce, and never records conversation content or provider keys; flags are deterministic and fail closed for anonymous traffic; usage/retention reads are RLS/user-scoped and aggregate-only.

- [ ] Build: `pnpm --filter @agiworkforce/web typecheck`, `test`, and `build` pass; GA4/Sentry are no-ops without env config.
- [ ] Trust: no Local/BYOK affordance or telemetry ingest on Web; no event property carries message/file/completion content; per-surface separation preserved.
- [ ] Security/privacy: `sendDefaultPii: false`; `beforeSend`/`beforeBreadcrumb` scrub covers new fields; flags never leak entitlement or route Local→Cloud data.

## Anti-patterns

- Logging prompts, messages, files, completions, emails, or provider keys into any analytics/error event — violates the `sentry-shared.ts` scrub contract.
- Ingesting Desktop/CLI/VS Code Local or BYOK telemetry into Web analytics, or presenting Web as having Local/BYOK.
- Enabling Sentry/GA4 by default, or emitting analytics scripts without the `proxy.ts` CSP nonce.
- Anonymous feature-flag rolls that fail open or flicker per request (regression of the deterministic-bucketing fix in `gradual-rollout.ts`).
- Claiming funnels/retention/RUM dashboards as shipped — they are 🔭 today.
- Hardcoding or inventing model IDs (source only `packages/types/src/models.json`), referencing removed tiers (Plus/pro_plus/Hobby), inventing INR prices, adding credit top-ups, or referencing Supabase.
