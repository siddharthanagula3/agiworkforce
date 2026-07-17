# AGI Web — Volume 14 — Security

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/web/AGENTS.md`, and real repo paths: `apps/web/proxy.ts`, `apps/web/lib/server/rls-db.ts`, `apps/web/lib/api-auth.ts`, `apps/web/lib/csrf.ts`, `apps/web/lib/rate-limit.ts`, `apps/web/lib/security-audit.ts`, `apps/web/lib/services/security-monitoring-service.ts`, `apps/web/lib/device-token-crypto.ts`, `apps/web/app/api/chat/sync/route.ts`, `apps/web/app/api/stripe-webhook/route.ts`, and migrations `apps/web/db/neon/{0005_api_keys,0025_two_factor,0037_rls_user_isolation,0043_audit_log_immutability}.sql`. Cross-refs `docs/products/agi-web/volume-02-authentication.md` and `volume-13-subscription.md`.

## Overview & stance

AGI Web is the **cloud-only** surface: no Local mode, no BYOK — ever. Every session is a signed-in Managed-Cloud session (public alpha, open by default). That collapses the trust model versus Desktop/CLI: there are no on-device secrets to protect and no user provider keys to broker, so Web's security surface is the classic hosted-SaaS set — authenticated identity, per-tenant data isolation, transport/at-rest encryption, and abuse/cost control on expensive server-side inference and billing. The stack is **Clerk (auth) + Neon Postgres (RLS) + Stripe (billing)** on Vercel with Next.js 16 `proxy.ts` (never `middleware.ts`; never Supabase). Because Web _hosts_ the Neon delta-sync APIs that Mobile and Desktop call, its authorization and isolation guarantees are load-bearing for the whole suite — a broken conversation route here leaks cross-device. This volume's central mandate: **defense in depth for tenant isolation**, with the dormant-RLS gap made explicit and IDOR-safety enforced on every conversation-scoped route.

## Authentication

Clerk is the sole identity provider. `proxy.ts` wraps requests in `clerkMiddleware`, redirects unauthenticated hits on `/chat`, `/settings`, `/billing`, `/admin` to `/login`, and API routes resolve the caller via `getUserScopedDb(request)` (`apps/web/lib/server/rls-db.ts`), which supports two verified paths: a Clerk **session** (browser, `getToken()`) and a **Bearer** token (mobile/desktop, `verifyToken` from `@clerk/backend`). Both call `assertAccountActive(userId)` (`apps/web/lib/api-auth.ts`) so suspended accounts 403 before any query. **✅ Built** (`apps/web/lib/server/rls-db.ts`). There is deliberately **no free env-key chat** — access is subscription/account-backed.

## OAuth

Social sign-in (Google/GitHub/etc.) is delegated entirely to Clerk's hosted OAuth; Web never handles OAuth authorization codes or provider client secrets directly. GitHub App installation OAuth for the connector path is a separate, scoped flow (`apps/web/app/api/github/install`, token material encrypted per `apps/web/lib/github-app.ts`). **🟡 Partial** — social OAuth is Clerk-managed and live via `proxy.ts`/`clerkMiddleware`; connector-grade OAuth token storage/rotation beyond GitHub is **🔭 Planned**. Web must never expose a raw OAuth callback that mints its own session outside Clerk.

## JWT

Session assertions are Clerk-issued JWTs. Two rules are non-negotiable and already enforced: (1) **signature verification before trust** — Bearer tokens run through `verifyToken({ secretKey })`, and the CSRF Bearer-bypass only fires for a cryptographically valid JWT (`isBearerTokenValid` in `apps/web/lib/csrf.ts`, the RT-04 fix); (2) **no unverified `sub` for security decisions** — rate-limit bucketing must not decode an unverified JWT payload (SEV-WEB-09 fix in `apps/web/lib/rate-limit.ts`). The verified `sub` is bound as the Neon RLS subject via `withUser(token)` → `SET LOCAL request.jwt.claim.sub`. **✅ Built** (`apps/web/lib/server/rls-db.ts`, `apps/web/lib/csrf.ts`).

## Session Management

Clerk owns session cookies (`__session`, `__client`, `__clerk*`); `proxy.ts` fast-rejects protected app routes lacking a browser session cookie before Clerk runs (`hasBrowserSessionCookie`). CSRF protection covers cookie-session state-changers (POST/PUT/PATCH/DELETE) with an HMAC-SHA256 token bound to the session id, constant-time compared, rotation-aware (`CSRF_SECRET` + `CSRF_SECRET_PREV`), and anonymous sessions pinned to a `__Host-`-prefixed cookie (SEV-WEB-M-1). Valid-Bearer requests bypass CSRF (same-origin policy blocks forgery). **✅ Built** (`apps/web/lib/csrf.ts`, `apps/web/proxy.ts`). Session revocation/step-up (re-auth for destructive actions) is **🔭 Planned**.

## Rate Limits

`apps/web/lib/rate-limit.ts` implements per-endpoint sliding-window limits on Upstash Redis, keyed by verified user id when available else IP (rightmost `x-forwarded-for`/`x-real-ip`, not the spoofable leftmost). Security-sensitive buckets (`auth-login`, `2fa-verify`, `llm-completion`, `image/video-generation`, `api-key-create`, `user-data-delete`) are **fail-closed**; business-critical ones (`checkout`, webhooks) fail-open. Production runtime **throws at cold-start without Redis** (SEV-WEB-13) because in-memory limits multiply across serverless instances. **✅ Built** (`apps/web/lib/rate-limit.ts`). Conversation/sync routes use the `chat-conversation` bucket (`apps/web/app/api/chat/sync/route.ts`).

## Abuse Prevention

Every rate-limit breach is written to the `security_audit_logs` trail (`logRateLimitExceeded` → `apps/web/lib/security-audit.ts`), and the admin `SecurityMonitoringService` (`apps/web/lib/services/security-monitoring-service.ts`) aggregates events, computes per-severity metrics, ranks top offending IPs, and evaluates alert thresholds (auth-failure spikes, invalid signatures, suspicious activity). The audit log is **append-only** for the app role — UPDATE/DELETE revoked, retention/GDPR purges run as `SECURITY DEFINER` (`apps/web/db/neon/0043_audit_log_immutability.sql`). Zod-validated, size-capped payloads on sync/LLM routes cap resource abuse. **✅ Built** for logging + monitoring; automated blocking/quarantine off the alert signals is **🔭 Planned**.

## Fraud Detection

Stripe is the billing trust anchor. The webhook verifies HMAC signatures over the **raw** body via `stripe.webhooks.constructEvent`; `proxy.ts` explicitly excludes `api/stripe-webhook` from the matcher and pins `runtime = 'nodejs'` so signature bytes are never mutated (WEB-4). Per-plan usage is metered against the canon ladder — **Free $0 / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise** — with **no credit top-ups** (path stays env-gated off). Payment-fraud scoring, chargeback/refund automation, and velocity checks on signups are **🔭 Planned** (`apps/web/app/api/stripe-webhook/route.ts` is the built verification surface).

## Encryption

Transport: `proxy.ts` CSP sets `upgrade-insecure-requests`, `block-all-mixed-content`, `frame-ancestors 'none'`, and a per-request script nonce (no `unsafe-inline` for scripts). At rest: Neon provides storage-level encryption; secrets are additionally application-encrypted — TOTP secrets via **AES-256-GCM** (`TOTP_ENCRYPTION_KEY`) with SHA-256-hashed one-time backup codes (`apps/web/db/neon/0025_two_factor.sql`, `apps/web/app/api/settings/2fa/setup/route.ts`), device/bridge tokens via the shared AES-256-GCM helper `apps/web/lib/device-token-crypto.ts` (IV‖ciphertext‖authTag), and API keys stored as **hash + prefix only**, never plaintext (`apps/web/db/neon/0005_api_keys.sql`). **✅ Built** for the above. A central field-level encryption/KMS-rotation layer for all PII columns is **🔭 Planned**.

### Dormant RLS & IDOR-safety for conversation routes

Migration `apps/web/db/neon/0037_rls_user_isolation.sql` enables + FORCEs Row-Level Security on `web_conversations`, `web_messages`, `profiles`, `subscriptions`, `user_projects`, `user_memories`, etc., with `USING` **and** `WITH CHECK` on the bound `request.jwt.claim.sub`, enforced only when queries run as the non-BYPASSRLS `app_rls` role. This is **🟡 Partial**: RLS _is_ active on routes going through `getUserScopedDb`/`withUser` (e.g. `apps/web/app/api/chat/sync/route.ts`), but the migration's own caveat records that legacy live paths using `getNeonDb()` do **not** set the GUC, leaving RLS **correct-but-dormant** there — app-layer `where user_id = $1` remains the active control until every conversation route is migrated onto `withUser`. Until then, IDOR-safety is mandatory: server-derive `user_id` from the verified session (**never** the request body — see the sync push, which forces `userId` and rejects mismatches), scope every read/write by `user_id`, and treat any conversation/message/artifact route lacking both the app-layer filter and the RLS backstop as a P0.

## Repository map

- `apps/web/proxy.ts` — CSP/nonce, security headers, protected-route + Clerk session gating.
- `apps/web/lib/server/rls-db.ts`, `apps/web/lib/api-auth.ts` — authenticated, RLS-scoped DB access + account-active gate.
- `apps/web/lib/csrf.ts`, `apps/web/lib/rate-limit.ts` — CSRF + per-endpoint rate limiting.
- `apps/web/lib/security-audit.ts`, `apps/web/lib/services/security-monitoring-service.ts` — audit trail + monitoring/alerts.
- `apps/web/lib/device-token-crypto.ts` — AES-256-GCM secret encryption helper.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — IDOR-safe delta-sync surfaces.
- `apps/web/app/api/stripe-webhook/route.ts` — HMAC-verified billing webhook.
- `apps/web/db/neon/{0005_api_keys,0025_two_factor,0037_rls_user_isolation,0043_audit_log_immutability}.sql` — key hashing, 2FA, RLS, audit immutability.

## Competitor notes

Claude, ChatGPT, and Codex web run single-vendor hosted auth + tenant isolation much like this. AGI's deliberate divergence: (1) **per-surface trust** — Web is intentionally cloud-only, so the "no local/BYOK on Web" boundary is a _security_ invariant, not a feature gap; secrets other surfaces hold (provider keys, local sessions) simply cannot exist here. (2) **Suite-hosting responsibility** — Web's conversation routes are the sync backend for Mobile/Desktop, so isolation bugs are cross-device, raising the IDOR bar above a standalone chat app. (3) **Defense-in-depth DB isolation** via Neon RLS as a backstop to app-layer filters — a control the parity products do not document. AGI does not claim frontier-model exclusivity; it competes on private, per-surface, isolated cloud state.

## Acceptance / Definition of Done

Production-ready when: no conversation/message/artifact route derives `user_id` from the request body; every such route enforces app-layer scoping **and** runs through `withUser` so RLS bites; Redis-backed rate limits are live with fail-closed on security-sensitive buckets; CSRF + CSP + HMAC webhook verification hold; secrets are encrypted at rest; the audit trail is append-only and monitored.

- [ ] Build/trust: `pnpm --filter @agiworkforce/web typecheck` + `test` + `build` green; `pnpm check:boundaries` passes.
- [ ] Trust boundary: no Local/BYOK affordance renders on Web; no route trusts a body-supplied `user_id`; sync rejects cross-tenant writes (RLS `WITH CHECK` proven by `rls-probe.mjs`).
- [ ] Security: rate-limit fail-closed verified; CSRF/CSP headers asserted; Stripe webhook rejects tampered signatures; secrets confirmed encrypted (no plaintext keys/TOTP in Neon).

## Anti-patterns

- Trusting an **unverified** JWT `sub` for auth, rate-limit bucketing, or RLS binding.
- Reading `user_id` from the request body on any conversation route (IDOR); relying on app-layer filters alone while RLS stays dormant on that path.
- Running user queries as the BYPASSRLS owner role instead of `app_rls`.
- Adding Local or BYOK to Web; routing Local/BYOK data into the cloud sync store.
- Renaming `proxy.ts` → `middleware.ts`; referencing Supabase; weakening CSP to `unsafe-inline` scripts.
- Re-granting blanket UPDATE/DELETE on `security_audit_logs` to `app_rls` (breaks immutability).
- Hardcoding model IDs (use `packages/contracts/types/src/models.json`), inventing INR prices, or reintroducing removed tiers ("Plus"/`pro_plus`/"Hobby") or credit top-ups.
