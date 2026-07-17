# AGI Web — Volume 23 — QA Test Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/web/AGENTS.md`, and real repo paths: `apps/web/playwright.config.ts`, `apps/web/e2e/*.spec.ts`, `apps/web/vitest.config.ts`, `apps/web/proxy.ts`, `apps/web/app/api/{chat,memory,projects}/sync/route.ts`, `apps/web/db/neon/0037_rls_user_isolation.sql`, `apps/web/db/neon/0038_cloud_sync_versioning.sql`, `apps/web/lib/pricing.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

AGI Web is the cloud-only surface — no Local mode, no BYOK, ever. Every QA case here therefore assumes exactly one trust boundary: Managed Cloud, gated by Clerk auth and user-scoped Neon (RLS). There are no local-runtime, key-entry, or provider-selection affordances to test on this surface; a test asserting their presence is a failed test. Cross-device data sync is the Neon delta-sync APIs Web itself hosts (`apps/web/app/api/{chat,memory,projects}/sync/route.ts`), so sync QA lives here and must prove Local/BYOK rows never appear (they carry no `cloud_id`). Managed Cloud is public alpha, open by default — no waitlist gate to test. A real Playwright e2e harness exists (`apps/web/playwright.config.ts`), so launch-critical flows are verified by screenshot/e2e, not typecheck alone. This volume is a target/design QA spec; it does not authorize new implementation (serial-by-surface lock holds; Mobile is the active surface).

## Functional

- ✅ Playwright harness runs against `pnpm dev` on `http://localhost:3000` with the `e2e` test dir (`apps/web/playwright.config.ts`); `pnpm test:e2e` is the entry point.
- ✅ Signed-out/public flows have an e2e spec (`apps/web/e2e/public-auth-clean.spec.ts`); route rendering + page-error capture exists (`apps/web/e2e/visual-verification.spec.ts`).
- ✅ Unit/integration coverage exists via Vitest (`apps/web/vitest.config.ts`) across many `apps/web/**/__tests__/` suites (chat, api, sync, providers).
- 🟡 Delta-sync functional cases (push/pull cursor, tombstones, idempotent upsert, LWW vs append-only messages) — logic and caps exist in `apps/web/app/api/chat/sync/route.ts`, but no dedicated e2e sync spec is wired; add one asserting server-side `user_id` and that no-`cloud_id` rows are rejected.
- 🔭 Launch-critical journey suite (sign-in → new cloud chat → stream → artifact → billing upgrade) as one gated e2e path — most journeys are covered piecemeal in unit tests, not end-to-end.
- Model-dependent cases must read IDs from `packages/contracts/types/src/models.json`; never assert a hardcoded model ID string.

## UI

- ✅ Screenshot capture (full + viewport) of `/`, `/projects`, and empty-state routes exists and writes deliverables for reviewer parity checks (`apps/web/e2e/visual-verification.spec.ts`, `apps/web/e2e/round-17-visual-verification.spec.ts`, `round-18-…`).
- 🟡 Screenshots are captured but parity is a manual reviewer comparison against reference images — no automated visual-diff/baseline assertion. Add pixel/DOM-snapshot baselines for launch-critical routes.
- 🔭 Streaming chat UI states (token stream, stop, tool-call rendering, error/retry) need dedicated visual cases; today they are asserted at component level, not captured.

## Accessibility

- 🟡 `@axe-core/playwright` is a declared dependency (`apps/web/package.json`) but no spec imports it — a11y automation is scaffolded, not wired. First case: inject axe on `/`, `/login`, `/chat`, `/billing` and fail on serious/critical violations.
- 🔭 Keyboard-only traversal, focus-visible, ARIA roles for the composer/message list, and reduced-motion honoring — planned; assert against a WCAG 2.1 AA target.
- 🔭 Screen-reader label coverage for streamed messages and live regions (aria-live for token stream) — planned.

## Security

- ✅ Per-request CSP with nonce, protected-route matcher, and signed-out redirect are implemented in `apps/web/proxy.ts` (Next.js 16 `proxy` export — never `middleware.ts`). Test: unauthenticated `/chat`, `/settings`, `/billing`, `/admin` redirect to `/login?redirectTo=…`; response carries a `Content-Security-Policy` header with a fresh nonce.
- ✅ Sync endpoints enforce RLS via user-scoped DB, CSRF token, rate limiting, and Zod body validation with hard row caps (`apps/web/app/api/chat/sync/route.ts`: `getUserScopedDb`, `requireCsrfToken`, `withRateLimit`, `MAX_*` constants). Test: body-supplied `user_id` is ignored (set server-side); cross-user row access is blocked by RLS (`apps/web/db/neon/0037_rls_user_isolation.sql`).
- ✅ Trust-boundary test: rows without `cloud_id` (Local/BYOK-shaped) must never be persisted or returned by any sync route — assert on `chat`, `memory`, `projects` sync.
- 🟡 CSRF/rate-limit unit coverage exists for some routes; extend to memory + projects sync parity.
- 🔭 Stripe webhook signature-verification negative tests (tampered payload rejected) — the webhook path is excluded from proxy body handling by design; add explicit HMAC-failure cases.

## Performance

- 🔭 Core Web Vitals budgets (LCP/CLS/INP) per key route — planned; Vercel Web Vitals is wired in the CSP `connect-src` (`apps/web/proxy.ts`) but no CI budget gate exists.
- 🔭 Streaming latency (time-to-first-token, tokens/sec) assertions against a stubbed provider — planned.
- 🔭 Sync throughput at the documented caps (500 conversations / 2000 messages push) without timeout — planned; caps are defined in `apps/web/app/api/chat/sync/route.ts`.

## Regression

- ✅ Vitest suite (`pnpm test`) plus Playwright e2e (`pnpm test:e2e`) form the regression baseline; CI retries e2e twice and captures trace/screenshot/video on failure (`apps/web/playwright.config.ts`).
- ✅ Documented past-incident guards belong in regression: the `type:"module"` prod-500 (proxy.ts note) and the CJS Playwright-config loader note — add cases that fail if either regresses.
- 🔭 Migration-drift regression: assert the app boots against the latest `apps/web/db/neon/*.sql` head (through `0038_cloud_sync_versioning.sql` and later) with RLS on.

## Localization

- 🟡 Currency locale is the concrete near-term case: pricing must render USD for US and ₹399 for India **Basic only**; Pro/Max INR are TBD and must not display an invented number. Ground price lookups in `apps/web/lib/pricing.ts` / `@agiworkforce/types` (`getPlanPriceUsd`), never a literal.
- 🔭 UI string localization (i18n framework, RTL, date/number formatting) — not present in repo; mark planned. First case once built: no hardcoded user-facing strings in launch routes.

## Cross-browser

- 🟡 Playwright config declares only a `chromium` project (`apps/web/playwright.config.ts`) — cross-browser coverage is single-engine today.
- 🔭 Add `firefox` and `webkit` projects and run launch-critical specs on all three; assert CSP-nonce hydration and Clerk session cookie handling per engine.

## Responsive Layout

- 🟡 The harness pins a fixed 1920×1080 desktop viewport (`apps/web/playwright.config.ts`) — no responsive breakpoints are exercised.
- 🔭 Add viewport-matrix cases (mobile 390, tablet 768, desktop 1440) for `/`, `/chat`, `/projects`, `/billing`; assert no horizontal scroll, composer reachable, and nav collapses correctly.

## Repository map

- `apps/web/playwright.config.ts` — e2e harness (chromium, `e2e` dir, `pnpm dev` server).
- `apps/web/e2e/` — `visual-verification.spec.ts`, `round-17/18-visual-verification.spec.ts`, `public-auth-clean.spec.ts`.
- `apps/web/vitest.config.ts`, `apps/web/**/__tests__/` — unit/integration suites.
- `apps/web/proxy.ts` — CSP, auth redirect, route matchers (security cases).
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — delta-sync (functional + trust-boundary cases).
- `apps/web/db/neon/0037_rls_user_isolation.sql`, `0038_cloud_sync_versioning.sql` — RLS + sync versioning.
- `apps/web/lib/pricing.ts` — price/locale grounding.
- `apps/web/package.json` — `@axe-core/playwright`, `test`/`test:e2e` scripts.

## Competitor notes

Claude, ChatGPT, and Codex web QA target a single first-party provider and one cloud trust mode; their suites never assert "Local rows must not sync" because those products have no local trust boundary. AGI's deliberate divergence: Web is intentionally cloud-only (no BYOK, no Local), so its distinctive, must-not-skip cases are trust-boundary tests — proving no-`cloud_id` rows never sync and that per-surface trust holds even though other AGI surfaces (Desktop/CLI/VS Code) do offer BYOK/Local. Where competitors ship one model family, AGI's model-dependent cases read from `packages/contracts/types/src/models.json`, keeping tests provider-agnostic. Parity references only — no proprietary code or branding is copied.

## Acceptance / Definition of Done

Production-ready gate: launch-critical flows are covered by e2e with screenshots (not typecheck alone); a11y axe runs on core routes; sync trust-boundary tests pass; CSP/redirect security cases pass; regression suite is green in CI.

- [ ] Build: `pnpm test` and `pnpm test:e2e` green in CI (chromium), trace/screenshot/video artifacts retained on failure.
- [ ] Trust: sync specs prove server-side `user_id`, RLS cross-user denial, and that no-`cloud_id` (Local/BYOK) rows never persist or return.
- [ ] Security: unauthenticated protected routes redirect with a nonce'd CSP header; CSRF + rate-limit + Zod caps enforced on all three sync routes.

## Anti-patterns

- Do not add a Local-mode, BYOK, or provider-key test path to Web — those affordances must not exist on this surface.
- Do not assert a hardcoded model ID; read from `packages/contracts/types/src/models.json`.
- Do not invent INR numbers for Pro/Max, or reference removed tiers (Plus, `pro_plus`, Hobby) or credit top-ups; Basic INR is ₹399 only.
- Do not reference Supabase; the stack is Clerk + Neon + Stripe.
- Do not rename `proxy.ts` to `middleware.ts` or test for a `middleware` export.
- Do not mark work done from typecheck/build success alone, or treat a captured screenshot as an automated parity assertion.
- Do not claim a11y/cross-browser/responsive coverage as shipped — the harness is chromium-only at a fixed desktop viewport with axe unwired today.
