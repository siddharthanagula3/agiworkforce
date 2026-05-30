# Surface Inventory Audit — Web (apps/web)

Auditor slice: Web surface (Next.js 16 + React 19). Read-only recon.
Date: 2026-05-29. Scope: `apps/web`.

## Summary

The web surface is large (~1,100 .ts/.tsx files, 141 API route handlers under `app/api`)
and **genuinely well-hardened**. Auth, money (Stripe), cross-boundary token mint, webhooks,
admin authorization, and XSS sinks are all properly guarded, with extensive in-code audit
history (WEB-xx / SEV-WEB-xx fix comments). I found **no P0** and **no unauthenticated
privileged/mutating route**. The material findings are quality/AI-slop and one tracked
architectural drift — not security holes.

Alive status: **shipping** (real Neon-backed runtime, real Clerk auth, real Stripe). A few
orphaned modules (fabricated analytics dashboard, disconnected settings hooks) ship in the
import graph but are not reachable by users.

## Purpose & Architecture

- Next.js 16 App Router. `proxy.ts` (NOT middleware.ts — lock honored) wraps `clerkMiddleware`
  but **only sets a per-request nonce + CSP**; it does NOT call `auth.protect()`. Auth is
  enforced per-route. (`apps/web/proxy.ts:45-61`)
- Auth: Clerk. Canonical server helper `getClerkAuthUser(request)` (`lib/api-auth.ts:33`)
  supports Clerk session cookie OR `Bearer` token (desktop/CLI/mobile), throws 401 otherwise.
  Used in ~100 routes. Two other valid gates: `requireCurrentUserId()` (`lib/server/neon-chat.ts:33`,
  used by chat routes) and `requireAdmin()`/`requireRole()` (`lib/auth-guards.ts:34`).
- DB: Neon (`@neondatabase/serverless`) via `lib/server/neon-db.ts` / `lib/server/neon-chat.ts`.
  Parameterized queries throughout the routes I read; user-scoped by `user_id`.
- Billing: Stripe (`stripe-webhook`, `checkout`, `credit-topup`, `portal`, `sync-subscription`).
- Embedded desktop SPA: `package.json` build step builds `apps/desktop` via Vite to
  `public/chat` (base `/chat/`) then runs `next build`. Web chat surface lives at `features/chat`.
- Marketing: ~90 static route folders under `app/` (pricing, about, blog, careers, legal, etc.).
- i18n: i18next + react-i18next + browser language detector (`app/i18n`).
- MCP web bridge: `app/api/mcp/route.ts` + `@agiworkforce/mcp`.

Primary paths: `app/api` (141 routes), `features/chat` (large), `features/settings`,
`features/billing`, `features/teams`, `lib/server`, `lib/llm-providers`, `core/ai/llm`.

## Alive vs Dead

ALIVE (reachable from routes/pages, real data):
- All API routes I sampled are wired and used by client hooks/components.
- `features/chat/components/tokens/TokenAnalyticsDashboard.tsx` — rendered by `app/billing/page.tsx`;
  uses React Query (`useTokenAnalytics`) against real endpoints. NO fabrication.
- Settings: `UserSettings.tsx` uses the *working* hooks (`useAllSettingsData`, `useUpdateProfile`,
  `useUpdateSettings`, `useCreateAPIKey`, `useToggle2FA`, etc.) which call real routes.

DEAD / ORPHANED (in import graph but not user-reachable):
- **`features/analytics/` (entire dir)** — `pages/AnalyticsDashboard.tsx` fabricates ALL data via
  `Math.random()` + hardcoded names ("Priya S.", "Marcus T.") and execution/token/cost numbers
  (`AnalyticsDashboard.tsx:38-205`). Exported from `features/analytics/index.ts:15` but **no page
  or component imports it** (grep for `@features/analytics` / `AnalyticsDashboard` outside the dir
  returns nothing). Not shipped to users. Pure AI-slop dead code. The `handleExport` is a
  `toast.info('Export is coming soon')` no-op (`AnalyticsDashboard.tsx:276`).
- **Disconnected settings hooks** in `features/settings/hooks/use-settings-queries.ts`:
  `useOrganizationSettings` returns `null` (`:567-570`), `useUpdateOrganizationSettings` returns the
  input `updates` then fires `toast.success` without persisting (`:596-604`), `useTeamMembers`
  returns `[]` (`:646-651`), `useInviteTeamMember`/`useRemoveTeamMember`/`useUpdateTeamMemberRole`
  throw "pending implementation" (`:676-712,748`). These are NOT consumed by any component
  (`UserSettings.tsx` imports only the working hooks), so the fake-success toasts never reach a
  user — but the TODOs claiming the routes don't exist are **stale**: the routes DO exist and are
  fully implemented (see Broken/half-built features).

## Test Coverage

- 175 test files (`*.test.ts(x)` / `*.spec.ts`) excluding node_modules; vitest + Testing Library + MSW.
- 3 Playwright e2e specs under `e2e/`. `playwright.config.ts` present.
- Frontend-parity report (anchor doc) notes "31 pre-existing failing tests" in
  `core/integrations/*.test.ts` + security tests after the RLS→Neon migration; deferred. I did not
  run tests (instructed not to) so cannot confirm current count — treat as a known, possibly-stale claim.
- Coverage is broad for a surface this size; security-sensitive helpers (csrf, device-token-crypto,
  totp-2fa, secrets-audit, stripe idempotency) have dedicated tests.

## Panic / Crash sites

The web "panic" analog is unhandled throws on client render paths and non-null assertions.
- 390 `throw new Error` across `app/api`/`lib`/`core` — these are normal route error handling routed
  through `withErrorHandler` → JSON 4xx/5xx, NOT crash sites. Not tabled.
- Section + shell error boundaries exist (`components/ErrorBoundary.tsx`, `shared/ui/SectionErrorBoundary.tsx`,
  `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`).
- `as any` density is low (4 source files). No user-reachable unwrap-style crash found.

## TODO / FIXME

59 TODO/FIXME/HACK in non-test source. Concentrations:
- `features/settings/hooks/use-settings-queries.ts` — ~9 TODOs claiming `/api/settings/{organization,team,activity,audit-logs}`
  routes are missing. **STALE** — those routes exist (see below).
- `features/settings/services/user-preferences.ts` — ~12 TODOs re: 2FA/api-keys/profile routes
  "once server route is implemented"; several of those routes also now exist.
- `core/integrations/*.ts` + `core/security/*.ts` — ~8 TODOs "implement via /api/... once
  <table> ported to Neon" (analytics_events, social_media_analyses). These are honest migration markers.
- `app/api/webhooks/directory-sync/route.ts:88` — SCIM/directory-sync explicitly not implemented (waitlist).
- `lib/marketing-constants.ts:139` — "confirm against a live cargo grep when desktop tooling stabilises".

## Security-sensitive code (all reviewed = OK)

- **proxy.ts**: strict CSP with per-request nonce (no `unsafe-inline` in script-src), `frame-ancestors 'none'`,
  `object-src 'none'`. `style-src` keeps `unsafe-inline` (documented Tailwind/Radix constraint). Correctly
  excludes `stripe-webhook` and `llm/v1/audio` from the matcher to preserve raw body. (`proxy.ts:16-83`)
- **Stripe webhook** (`app/api/stripe-webhook/route.ts` + `lib/verify.ts` + `lib/idempotency.ts`):
  HMAC signature verify via `verifyStripeSignature`, idempotency check, rate limit, `runtime='nodejs'`,
  `force-dynamic`. Correct. (`stripe-webhook/route.ts:50-66`)
- **GitHub webhook** (`app/api/github/webhook/route.ts`): HMAC-SHA256 verify (`lib/github-app.ts:45-49`
  uses `timingSafeEqual`), spend-cap + debounce + monthly quota. Signature is the auth. Correct.
- **WorkOS directory-sync webhook** (`app/api/webhooks/directory-sync/route.ts`): HMAC verify with
  `timingSafeEqual` (`:78`) + timestamp replay tolerance, then returns 501 (provisioning waitlist-gated).
  Honest stub, not deceptive.
- **Desktop-token mint** (`app/api/auth/desktop-token/route.ts`): requires Clerk auth, scrypt KDF
  (N=2^15) over a >=64-byte/hex-32 key source, AES-256-GCM, 60s TTL, one-time nonce, CSRF, rate-limit.
  Strong cross-boundary handoff. (`:1-60+`)
- **device/poll** (`app/api/device/poll/route.ts`): unauthenticated by design (device_id is the secret),
  validates device_id format `^[a-zA-Z0-9-_]{1,128}$`, encrypted tokens, atomic consume, rate-limit. OK.
- **cron/reset-credits** (`app/api/cron/reset-credits/route.ts`): `CRON_SECRET` bearer required; dev
  bypass requires BOTH `NODE_ENV=development` AND `CRON_DEV_BYPASS=1` AND loopback host (WEB-NEW-010 fix). OK.
- **Admin routes**: `admin/sso`, `admin/directory-sync`, `admin/security` all enforce org owner/admin
  role via `organization_members` lookup or Clerk `publicMetadata.role` before any read/mutation.
- **Diagnostic/info-leak endpoints**: `debug/llm-status` (admin-only in prod, returns `configured:!!apiKey`
  booleans only), `control-plane/status` (auth required), `webhook-diagnostic` (`requireAdmin`, env-presence
  booleans only). No secret values leaked.
- **BYOK lock compliance**: `byok/env-key-status` returns only `{id,envVar,isSet}` booleans, never key
  values (`app/api/byok/env-key-status/route.ts:28-32`). `app/settings/byok/page.tsx:125` marks UI key
  entry "Coming soon — only env-based keys supported in v1". `settings/test-provider` uses server env keys
  (not user-supplied) and returns only reachability status. Consistent with "Web does not expose BYOK".
- **XSS sinks**: all 4 user-facing `dangerouslySetInnerHTML` sites sanitize:
  `ArtifactPreview.tsx` (`sanitizeArtifact`/`sanitizeSVG`, sandboxed iframe), `ArtifactBlock.tsx`
  (DOMPurify + `sandbox="allow-scripts"` no-same-origin), `MermaidRenderer.tsx` (mermaid
  `securityLevel:'strict'` + DOMPurify), `CalculationCard.tsx` (DOMPurify). See AI-slop for the
  one unsanitized (but static-content) marketing site.
- No hardcoded secrets/API keys found in source. `.env.local` is gitignored AND not tracked.

## AI-slop

- **Fabricated analytics dashboard** (dead): `features/analytics/pages/AnalyticsDashboard.tsx` — full
  Math.random/hardcoded mock data generator (`buildMockData`, `generateUsageTimeSeries`). Dead but
  misleading; should be deleted or wired to a real endpoint.
- **Disconnected React Query layer**: `use-settings-queries.ts` ships fully-typed org/team/activity/
  audit hooks that return placeholders / throw / fake-success while the real backend routes exist.
  Classic "scaffold built, never connected" slop.
- **Stale TODOs** asserting routes don't exist when they do (see Broken features). Misleads future agents.
- **Dual UI primitive dirs**: `components/ui/` (39 files) AND `shared/ui/` (78 files) — duplicated
  shadcn primitives, parity report flagged the same. Consolidation candidate.
- **`SurfaceShowcase.tsx:661,800`**: `dangerouslySetInnerHTML={{ __html: f }}` on feature strings
  with no DOMPurify. `f` is a hardcoded static string from the `surfaces` const (`:523-590`), so XSS
  risk is low, but it's an inconsistent anti-pattern vs the sanitized chat sinks.

## Broken / half-built features (with evidence)

1. **Settings org/team management UI layer is disconnected from working backend** — the hooks in
   `features/settings/hooks/use-settings-queries.ts` (`useOrganizationSettings:567`, `useTeamMembers:646`,
   `useInviteTeamMember:676`, `useRemoveTeamMember`, `useUpdateTeamMemberRole`,
   `useUpdateOrganizationSettings:596`) return placeholders / throw "pending implementation", BUT the
   server routes are fully implemented and Neon-backed:
   `app/api/settings/organization/route.ts` (6.5KB, auth+CSRF+Zod), `app/api/settings/team/route.ts`
   (209 lines), `app/api/settings/team/[memberId]/route.ts`, `app/api/settings/activity/route.ts`,
   `app/api/settings/audit-logs/route.ts`. Net effect: a working backend with no live UI consumer, plus
   the fake-success mutation pattern (`useUpdateOrganizationSettings` returns `updates` + `toast.success`).
   Mitigant: the broken hooks are currently NOT consumed by any rendered component, so users don't hit the
   fake toasts today — but the moment someone wires the org/team settings tab to these hooks, it silently lies.
2. **Fabricated analytics dashboard** (`features/analytics/`) — dead, not user-reachable, but pure mock data.
3. **SCIM / directory-sync** — `app/api/webhooks/directory-sync/route.ts` verifies signature then 501s.
   Intentional (enterprise waitlist), documented; not a defect, listed for completeness.
4. **Web search tool-execution loop** — per anchor docs (`web-search-tool-loop-needed.md`), web chat
   triggers search but may not loop results into a follow-up completion. Not re-verified in code this pass.

## Severity-ranked issues

### P1
- **Disconnected settings hooks vs implemented backend + fake-success mutations** —
  `features/settings/hooks/use-settings-queries.ts:567,596-604,646,676,712,748`.
  Routes exist (`app/api/settings/organization`, `.../team`, `.../activity`, `.../audit-logs`).
  Fix: wire the hooks to the real routes (or delete the dead hooks); remove the
  `return updates; toast.success(...)` fake-success path. Currently masked because no component consumes
  them, but it is a latent data-loss/UX-lie footgun. Stale TODOs must be corrected.

### P2
- **Fabricated analytics dashboard shipped as dead code** —
  `features/analytics/pages/AnalyticsDashboard.tsx:38-205`. Delete or wire to a real usage endpoint.
- **Stale TODOs that misstate repo reality** — `use-settings-queries.ts` (~9), `user-preferences.ts` (~12).
  Misleads agents into rebuilding existing routes. Fix: audit each TODO against the route list and update/remove.
- **Dual UI primitive directories** — `components/ui/` (39) vs `shared/ui/` (78). Consolidate to one.

### P3
- **Unsanitized `dangerouslySetInnerHTML` on static marketing strings** —
  `components/SurfaceShowcase.tsx:661,800`. Wrap in DOMPurify for consistency even though content is static.
- **Unauthenticated `POST /api/shared`** stores up to 2MB conversations (capability-token model). Rate-limited;
  minor abuse/storage vector. Consider auth or stricter quota. (`app/api/shared/route.ts`)
- **Doc staleness** in anchor `reports/frontend-parity-r1/surfaces/web.md`: says "Next.js 14" (now 16),
  cites `supabase/migrations` (repo is Neon-only per NEON-01). Update the anchor, do not re-derive.

## Known flaws (reference, do NOT re-file)
- **WEB-PROVIDER-DRIFT-01** (Tracked, High): confirmed still present. `app/api/llm/v1/chat/completions/route.ts:5,37,65`
  and `app/api/settings/test-provider/route.ts:7` use the **legacy** `LLMProviderFactory`
  (`lib/llm-providers/factory.ts`) rather than canonical `@agiworkforce/providers`. `lib/ai-sdk/providers.ts`
  is a third wrapper. Migration must preserve OpenAI-compatible SSE framing/usage/credits per the ledger row.
- 31 pre-existing failing integration tests, Stripe-migration prod NO-GO — per anchor docs; not re-verified here.

## Open questions / uncertainty
- I did NOT run tests/builds (instructed). The "31 failing tests" and Stripe-migration NO-GO are taken from
  anchor docs and may be stale.
- I systematically swept all 141 routes for auth presence and deep-read the security-critical and
  no-auth-pattern subset (~30 routes + all money/token/admin/webhook/diagnostic paths). I did NOT read every
  one of the 141 route bodies line-by-line; the unread remainder all reference a recognized auth gate.
- `getUserId` (used ~38×) is defined locally per-route in places (e.g. `admin/security`, `settings/team/[memberId]`);
  I confirmed those routes gate properly but did not enumerate all 38 definitions.
- Web-search tool-loop gap (item 4) was taken from anchor docs, not re-verified in code this pass.
- Whether the disconnected settings hooks are slated for deletion vs wiring is unknown (intent question).
