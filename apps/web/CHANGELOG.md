# CHANGELOG — Web Surface Audit & Remediation

> Single source of truth for all audit fixes. Read before writing, log after completing.

**Audit:** 2026-03-25
**Scope:** `apps/web/` — Next.js 16 App Router (marketing + SaaS dashboard + API)
**Build status:** `tsc --noEmit` PASS, `next build` PASS (zero errors)

---

## Phase 1 — Critical + High Fixes (Direct)

### [FIX-W001] LLM routes: anon key → service role key for JWT verification

- **Files:** 7 API route files (`llm/v1/chat/completions`, `llm/v1/models`, `llm/v1/credits/balance`, `llm/v1/audio/transcriptions`, `llm/completion`, `sync-subscription`, `settings/test-provider`)
- **Severity:** Critical — **What:** Replaced anon key with `SUPABASE_SERVICE_ROLE_KEY` on Bearer token auth path.

### [FIX-W002] Remove `'use client'` from 17 pass-through page.tsx files

- **Files:** 17 page.tsx (download, careers, help, blog, blog/[slug], legal, cookies, resources, support, contact-sales, api-docs, gallery, marketplace, 4 use-cases, device-auth)
- **Severity:** High — **What:** Pages that only render a single child now server-render. Child feature components received `'use client'` instead.

### [FIX-W002b] Add `'use client'` to 16 feature components missing it

- **Files:** 16 feature components (`ApiReference`, `ArtifactGallery`, `BlogList`, `BlogPost`, `ContactSales`, `DeviceAuth`, `HelpCenter`, `BusinessLegalPage`, `PublicMarketplace`, `Resources`, `SupportCenter`, 4 use-case pages, `particles.tsx`)
- **Severity:** High — **What:** These components use React hooks but lacked the directive, causing build failures when pages became server components.

### [FIX-W004] Fix broken realtime reconnect

- **Files:** `hooks/useConversationRealtime.ts`
- **Severity:** High — **What:** Added `reconnectTrigger` state + converted `connectionState` from ref to useState. Channels now re-subscribe after errors.

### [FIX-W005] Fix toggleMode dead code in UI store

- **Files:** `stores/unified/ui.ts`
- **Severity:** High — **What:** Replaced `{} as any` with actual store `.getState()` calls. Tier-based auto-mode model selection now works.

### [FIX-W006a] Fix token pack purchase (wrong fields + missing CSRF)

- **Files:** `features/billing/services/token-pack-purchase.ts`
- **Severity:** High — **What:** Fixed request body to `{ amount_cents }` and added CSRF headers.

### [FIX-W006b] Add rate limiting to marketplace API

- **Files:** `app/api/marketplace/route.ts`
- **Severity:** High — **What:** Added `withRateLimit(request, 'default')`.

### [FIX-W007a] Wrap logout in try/catch

- **Files:** `shared/stores/authentication-store.ts`
- **Severity:** Medium — **What:** Logout cleanup now proceeds even if authService.logout() fails.

### [FIX-W007b] Fix draft timestamp deserialization

- **Files:** `stores/unified/ui.ts`
- **Severity:** Medium — **What:** Reconstruct Date objects during rehydration so draft cleanup works.

---

## Phase 2 — SEO Fixes (Agent: seo-fixer)

### [FIX-SEO-001] Add metadata to 7 zero-tag pages

- **Files:** `app/use-cases/startups/page.tsx`, `app/use-cases/consulting/page.tsx`, `app/use-cases/sales-teams/page.tsx`, `app/use-cases/it-providers/page.tsx`, `app/cookies/page.tsx`, `app/legal/page.tsx`, `app/contact-sales/page.tsx`
- **What:** Each now has `export const metadata: Metadata` with title, description, and openGraph.

### [FIX-SEO-002] Add /contact-sales to sitemap

- **Files:** `app/sitemap.ts`

### [FIX-SEO-003] Add billing/error.tsx and auth/error.tsx

- **Files:** `app/billing/error.tsx` (new), `app/auth/error.tsx` (new)

### [FIX-SEO-004] Add JSON-LD to 5 pages

- **Files:** `app/changelog/page.tsx`, `app/blog/layout.tsx`, `app/marketplace/layout.tsx`, `app/gallery/layout.tsx`, `app/careers/layout.tsx`

### [FIX-SEO-005] Fix canonical URL inconsistency

- **Files:** `app/changelog/page.tsx` — Changed absolute canonical to relative.

### [FIX-SEO-006] Expand optimizePackageImports

- **Files:** `next.config.ts` — Added sonner, react-markdown, 5 Radix UI packages, class-variance-authority.

---

## Phase 3 — Store/Hook/Feature Fixes (Agent: services-web-fixer)

### [FIX-SVC-001] pendingCommands periodic cleanup

- **Files:** `services/api-gateway/src/websocket.ts` — 60s interval prunes expired entries.

### [FIX-SVC-002] accountStatusCache periodic cleanup

- **Files:** `services/api-gateway/src/middleware/auth.ts` — 5min interval evicts expired entries.

### [FIX-SVC-003] authFailures size cap

- **Files:** `services/signaling-server/src/middleware/adminAuth.ts` — Cap at 10K entries.

### [FIX-SVC-004] secureCompare random key

- **Files:** `services/signaling-server/src/middleware/adminAuth.ts`, `services/signaling-server/src/index.ts` — Replaced zeroed HMAC key with `randomBytes(32)`.

### [FIX-SVC-005] readFileSync → async in agents/execute

- **Files:** `app/api/agents/execute/route.ts` — Replaced `readFileSync`/`existsSync` with `readFile`/`access` from `fs/promises`.

### [FIX-SVC-006] GitHub installations rate limiting

- **Files:** `app/api/github/installations/route.ts` — Added `withRateLimit` to GET and DELETE.

### [FIX-SVC-007] Notification store auto-cleanup on rehydrate

- **Files:** `shared/stores/notification-store.ts` — Added `onRehydrateStorage` callback.

### [FIX-SVC-008] Auth store refreshUser guard

- **Files:** `stores/unified/auth.ts` — Added `refreshInFlight` module-level guard.

### [FIX-SVC-009] AudioContext leak fix

- **Files:** `shared/stores/notification-store.ts` — Module-level AudioContext reuse.

### [FIX-SVC-010] Delete \_chat-deprecated/

- **Files:** `app/_chat-deprecated/` — Deleted entire directory.

### [FIX-SVC-011] billingUsage budgetAlerts cap

- **Files:** `stores/unified/billingUsage.ts` — Capped at 50 entries.

### [FIX-SVC-012] checkpointHistory cap

- **Files:** `shared/stores/chat-store.ts` — Capped at 10 entries.

---

## Phase 4 — Package/Type Fixes (Agent: package-type-fixer)

### [FIX-PKG-001] AgentConfig type shadowing

- **Files:** `packages/api/src/agent.ts` — Removed opaque local type, imported from `@agiworkforce/types`.

### [FIX-PKG-002] MessageRole + 'tool'

- **Files:** `packages/types/src/conversation.ts`

### [FIX-PKG-003] RiskLevel + 'critical'

- **Files:** `packages/types/src/conversation.ts`

### [FIX-PKG-004] SSR misclassification fix

- **Files:** `packages/runtime/src/detect.ts` — Added `isServer` check, excluded from `isCloudWeb`.

### [FIX-PKG-005] Stub stores consolidation

- **Files:** `stores/unified/desktop-stubs.ts` (new), 6 stub files now re-export from it.

### [FIX-PKG-006] Billing IDOR ownership check

- **Files:** `lib/services/subscription-service.ts` — Email fallback now checks `metadata.supabase_user_id`.

### [FIX-PKG-007] Stripe API version consistency

- **Files:** `lib/stripe-config.ts` (new), `subscription-service.ts`, `checkout/route.ts`, `stripe-webhook/route.ts` — All use `'2026-02-25.clover'`.

### [FIX-PKG-008] Team invite O(1) lookup

- **Files:** `app/api/teams/[id]/members/route.ts` — Replaced `listUsers()` with targeted `profiles` table query.

---

## Phase 5 — Desktop Store/Component Fixes (Agent: desktop-fixes)

### [FIX-DSK-001] mcpStore operation counter

- **Files:** `apps/desktop/src/stores/mcpStore.ts` — Replaced single `isLoading` boolean with `activeOperations` counter.

### [FIX-DSK-002] automationStore array caps

- **Files:** `apps/desktop/src/stores/automationStore.ts` — Capped recordings (100), executionHistory (100), pendingActions (1000).

### [FIX-DSK-003] auth retryCount reset on user change

- **Files:** `apps/desktop/src/stores/auth.ts`

### [FIX-DSK-004] WelcomeDialog export default removed

- **Files:** `apps/web/features/chat/components/WelcomeDialog.tsx`

### [FIX-DSK-005] SettingsPanel notificationSettings deps fix

- **Files:** `apps/desktop/src/components/Settings/SettingsPanel.tsx`

### [FIX-DSK-006] MCPServerManager finally blocks

- **Files:** `apps/desktop/src/components/MCP/MCPServerManager.tsx`

### [FIX-DSK-007] marketing-constants wired into homepage

- **Files:** `app/page.tsx` — Replaced hardcoded stats with `MARKETING` constants.

---

## Phase 6 — Signaling/API Fixes (Direct)

### [FIX-SIG-001] Signaling server 404 handler repositioned

- **Files:** `services/signaling-server/src/index.ts` — Moved 404 + error handlers from before routes (line 298) to after all route definitions (line 683). **This was a major bug — every HTTP request to the signaling server returned 404.**

### [FIX-API-001] OPTIONS handler misrouting

- **Files:** `app/api/llm/v1/credits/balance/route.ts`, `app/api/llm/v1/models/route.ts` — OPTIONS now returns 204 with CORS headers instead of running full handler.

### [FIX-API-002] Debug endpoint wrapped in withErrorHandler

- **Files:** `app/api/debug/llm-status/route.ts`

### [FIX-API-003] CSRF route cleanup

- **Files:** `app/api/csrf/route.ts` — Removed unused `createSupabaseServerClient` import and `getSession()` call. Added documentation comment.

### [FIX-API-004] Command validator defense-in-depth documented

- **Files:** `apps/desktop/src-tauri/src/sys/security/command_validator.rs`

---

## Phase 7 — TypeScript Error Resolution (Direct)

### [FIX-TS-001] Fix 7 TypeScript errors from audit fixes

- **Files:** `app/api/portal/route.ts`, `app/api/sync-subscription/route.ts`, `features/billing/services/token-pack-purchase.ts`, `lib/services/subscription-service.ts`
- **What:** Fixed index signature access (`metadata.supabase_user_id` → `metadata['supabase_user_id']`), removed unused `supabaseAnonKey` variable, removed unused `userEmail` destructuring.
- **Result:** `tsc --noEmit` passes with zero errors.

---

## Verification

- `pnpm typecheck` — **PASS** (zero errors)
- `pnpm build:next-only` — **PASS** (zero errors, all routes compile)
- `pnpm lint` — 205 errors / 13,025 warnings (all pre-existing, none in modified files)
