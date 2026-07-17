# AGI Mobile — Volume 28 — Analytics

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: Grounded in `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and verified against `apps/mobile/storage/telemetry.ts`, `apps/mobile/storage/migrations.ts`, `apps/mobile/services/performanceMonitor.ts`, `apps/mobile/services/usage.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/app/error.tsx`, `apps/mobile/app/(app)/error.tsx`, `apps/mobile/app/(app)/settings/performance.tsx`, and `apps/mobile/__tests__/telemetry-consent-gate.test.ts`.

## Overview & stance

This volume specifies how AGI Mobile measures product use, conversion, retention, runtime health, crashes, and rollout — without breaking the trust model. Mobile exposes exactly two trust modes: **Local** (a small on-device LLM, free) and **Managed Cloud** (public alpha, open by default). **Mobile has no BYOK** and never will; nothing in this volume may add an API-key affordance.

The governing rule is **zero-leak by trust mode**. Local-mode activity is on-device only: prompts, responses, files, memory, and projects never reach any AGI collector unless the user runs an explicit reviewed transfer. Product telemetry is therefore **opt-in and Cloud-only** — it fails closed when consent is unset, unreadable, or the app is in Local mode. On-device performance data stays on the device. This stance is stricter than ChatGPT/Claude mobile, where analytics SDKs typically fire by default.

## Events — product events

Product events are funneled through the local telemetry queue, not a third-party SDK. The queue is gated by `isTelemetryAllowed()`, which returns `true` only when MMKV `telemetry_opted_in === true` **and** `appMode === 'cloud'`; any thrown error drops the event. `enqueueTelemetryEvent()` writes only when that gate passes, and stores **counts and durations only — never prompt/response content**.

- ✅ Built — opt-in, fail-closed, content-free queue and table (`apps/mobile/storage/telemetry.ts`, `telemetry_queue` in `apps/mobile/storage/migrations.ts`; enforced by `apps/mobile/__tests__/telemetry-consent-gate.test.ts`).
- 🟡 Partial — the queue exists but has **no production emitters yet**: `enqueueTelemetryEvent` has no callers outside tests. A named, versioned event taxonomy (e.g. `chat_started`, `model_switched`, `cloud_upgrade_viewed`) and a consented flush path are not wired (`apps/mobile/storage/telemetry.ts`). Gap: define the schema and call sites.
- 🔭 Planned — server-side ingestion, dashboards, and a documented event dictionary. Events must carry a trust-mode tag and never a model ID invented client-side; model identifiers, where logged, come only from `packages/contracts/types/src/models.json`.

## Funnels

Funnels reconstruct the activation path: install → onboarding → first Local chat → sign-in (real Clerk auth gate, no demo bypass) → first Cloud chat → paid plan. Because Local is private, the onboarding/first-Local-chat steps can only be measured as **consented, content-free counts** after the user opts into telemetry and is in Cloud mode; pre-consent and Local-only steps stay uninstrumented by design.

- 🔭 Planned — funnel definitions and analysis are not built. They depend on the event emitters above plus Cloud-side aggregation.
- Conversion funnels must use canonical tiers only: **Free $0, Basic $8/mo (₹399/mo), Pro $20/mo, Max $100/mo and $200/mo, Enterprise custom**. Never instrument "Plus", `pro_plus`, or "Hobby". Pro/Max INR are TBD — do not log invented INR values. No credit top-ups exist to measure.

## Retention

Retention (D1/D7/D30, returning Local vs Cloud cohorts) is derived Cloud-side from consented event timestamps and Clerk identity for signed-in users. Local-only users who never opt in are intentionally invisible to retention analytics — this is a feature of the trust model, not a gap to "fix" by silently sampling Local activity.

- 🔭 Planned — no retention pipeline exists. Cohorting must distinguish trust mode and never join Local on-device records into Cloud cohorts without an explicit reviewed transfer.

## Performance telemetry

Runtime performance is captured **on-device** and stored locally in MMKV — separate from product telemetry and not subject to the opt-in gate, because it never leaves the phone.

- ✅ Built — per-inference tok/s, first-token latency, peak memory, backend, and thermal state, with rolling stats and an on-device benchmark runner (`apps/mobile/services/performanceMonitor.ts`); surfaced in the Performance settings screen (`apps/mobile/app/(app)/settings/performance.tsx`).
- 🟡 Partial — `peakMemoryMB` is a heuristic/0 until a native module surfaces it, and `recordPerfEvent` is not yet wired into the live inference path (only the benchmark runner persists results) (`apps/mobile/services/performanceMonitor.ts`).
- 🔭 Planned — optional, consented upload of **aggregate** perf stats (never raw events) via the same Cloud-only gate; correlating Cloud-stream latency (TTFT) with on-device metrics.
- Mobile must not become the heavy local compute/measurement surface first; image generation is cloud-backed and is measured as a Cloud event, not a local benchmark.

## Crash Reporting

There is no crash-reporting SDK in the app (no Sentry/Crashlytics/Bugsnag in `apps/mobile/package.json`). Today crash handling is graceful in-app recovery via Expo Router error boundaries.

- ✅ Built — route-level error boundaries render a recovery UI instead of a hard crash (`apps/mobile/app/error.tsx`, `apps/mobile/app/(app)/error.tsx`).
- 🔭 Planned — remote crash/ANR/JS-exception reporting. When added it must be **Cloud-trust, opt-in, and content-scrubbed**: no prompt/response text, no file contents, no on-device model artifacts in stack frames or breadcrumbs. Crash reports from Local-only, non-consented users must not be transmitted.

## Feature Flags — controlled rollouts (v1FeatureFlags)

Rollout is governed by a single static source of truth, not a remote flag service, keeping behavior auditable and review-build deterministic.

- ✅ Built — `FEATURES` master switch (`apps/mobile/lib/v1FeatureFlags.ts`): `cloudChat`, `auth`, `projects`, `webSearch`, and `imageGen` on; `billing`, `byokKeys`, `agents`, `dispatch`, `companion`, `crossDeviceSync` off. `byokKeys: false` encodes the no-BYOK rule.
- ✅ Built — Cloud access is open-by-default in public alpha (signing in is the entitlement); the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is an incident kill-switch only, and `remoteChatGate` fails closed when Cloud is disabled (`apps/mobile/services/remoteChatGate.ts`, `apps/mobile/lib/v1FeatureFlags.ts`).
- 🔭 Planned — remote/percentage rollout, per-cohort flags, and A/B experiment assignment. Any future remote flag system must not become a backdoor that flips Local→Cloud routing or enables BYOK; the `v1LocalOnly`/`cloudChat` dual-flag deadlock note in the source must be honored.

## Repository map

- `apps/mobile/storage/telemetry.ts` — opt-in, Cloud-only, content-free event queue.
- `apps/mobile/storage/migrations.ts` — `telemetry_queue` table.
- `apps/mobile/services/performanceMonitor.ts` — on-device perf + benchmarks.
- `apps/mobile/app/(app)/settings/performance.tsx` — perf UI.
- `apps/mobile/services/usage.ts` — Cloud usage summary (billing-gated, off in v1).
- `apps/mobile/lib/v1FeatureFlags.ts` — rollout switches.
- `apps/mobile/services/remoteChatGate.ts` — fail-closed Cloud gate.
- `apps/mobile/app/error.tsx`, `apps/mobile/app/(app)/error.tsx` — error boundaries.
- `apps/mobile/__tests__/telemetry-consent-gate.test.ts` — zero-leak gate tests.
- Cloud ingestion (🔭) would land alongside Neon delta-sync APIs (`apps/web/app/api/...`); none are mobile-analytics-specific yet.

## Competitor notes

ChatGPT and Claude mobile ship analytics/crash SDKs that initialize at launch and report by default, with opt-out buried in settings. AGI diverges deliberately: (1) **per-surface trust** — Local activity is never sampled; (2) **opt-in, fail-closed, content-free** product telemetry gated to Cloud mode; (3) **on-device performance** measurement for the small Local LLM, which neither competitor exposes; (4) **no-BYOK-on-mobile**, so there are no key-usage events to collect. The cost is thinner default analytics; the benefit is a defensible privacy story.

## Acceptance / Definition of Done

Production-ready when product events have a defined taxonomy with consented emitters, the flush path provably respects `isTelemetryAllowed()`, perf telemetry stays on-device unless aggregated and consented, and crash reporting (when added) is content-scrubbed and Cloud-trust.

- [ ] Build: event taxonomy defined; emitters wired; perf events recorded on the live inference path; flags drive all rollouts from `v1FeatureFlags.ts`.
- [ ] Trust: no Local-mode or pre-consent event ever leaves the device; gate tests green; tiers/labels use canon names only (no Plus/Hobby/pro_plus).
- [ ] Security: no prompt/response/file content in any payload, crash frame, or breadcrumb; no Supabase; no hardcoded/invented model IDs or INR prices.

## Anti-patterns

- Adding a BYOK or API-key event, screen, or flag to mobile.
- Auto-sending Local-mode events or "anonymized" Local content to any collector.
- Dropping in an analytics/crash SDK that fires by default or bypasses the opt-in + Cloud gate.
- Claiming events/funnels/retention/crash reporting are shipped without a real repo path (most are 🔭).
- Logging invented model IDs, routes, env vars, or INR prices; referencing removed tiers; referencing Supabase.
