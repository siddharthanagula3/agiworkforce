# AGI Web — Volume 02 — Authentication

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`; grounded in `apps/web/proxy.ts`, `apps/web/app/{login,signup,sign-in}/page.tsx`, `apps/web/app/auth/{callback,update-password,device}`, `apps/web/app/verify/`, `apps/web/lib/{api-auth,auth-guards,rate-limit,security-audit,csrf,safe-redirect}.ts`, `apps/web/app/api/auth/*`, `apps/web/db/neon`.

## Overview & stance

AGI Web is the **cloud-only** surface: no Local mode, no BYOK, ever. Every product feature (chat, projects, artifacts, billing, admin) sits behind a signed-in Managed-Cloud account, so authentication is the single gate for the whole surface. Auth is **Clerk-backed** — the app never hand-rolls credential storage, OAuth token exchange, or password hashing. Neon Postgres holds only user-scoped profile/entitlement rows (RLS-guarded); Stripe holds billing; Supabase is not used anywhere.

Because Managed Cloud is **public alpha, open by default** (founder decision 2026-06-27), auth presents as immediately available: sign up, verify, and start. There is no waitlist gate on account creation. The `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident kill-switch, not an auth gate. Subscription tier (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) gates **features and usage**, never the ability to authenticate. Local and BYOK are irrelevant here — there is no account-free path on Web, and no trust-mode fork to design.

## Splash Screen — entry experience

The entry experience is the marketing-wrapped auth shell, not a native splash. `/login` and `/signup` render inside `AuthShell` (`apps/web/components/marketing/AuthShell.tsx`) with a title, lede, and trust points, embedding the Clerk widget. **✅ Built** — `apps/web/app/login/page.tsx`, `apps/web/app/signup/page.tsx`. Copy must stay honest: it advertises "managed cloud is open in public alpha," one account across Web/Mobile/Desktop Cloud, and that Local Mode (on other surfaces) never needs an account. Requirement: unauthenticated hits to protected routes redirect to `/login?redirectTo=<path>` and land back after sign-in (**✅ Built** — `proxy.ts` `buildSignedOutRedirect`).

## Sign In

Rendered by Clerk `<SignIn>` at `/login` with `routing="hash"`, `signUpUrl="/signup"`, and a validated `fallbackRedirectUrl` (**✅ Built** — `apps/web/app/login/page.tsx`; redirect sanitized via `apps/web/lib/safe-redirect.ts` `getSafeRedirectUrl`). External deep links to Clerk's default `/sign-in` are aliased to `/login`, preserving query params (**✅ Built** — `apps/web/app/sign-in/page.tsx`). Requirement: post-sign-in redirect targets must be same-origin or fall back to `/chat`; open-redirects are a security defect.

## Sign Up

Clerk `<SignUp>` at `/signup`, with `signInUrl="/login"` and validated redirects (**✅ Built** — `apps/web/app/signup/page.tsx`). Account creation writes a Clerk user; the corresponding Neon `profiles` row (`account_status`, role, entitlements) is provisioned server-side and read on every request. Requirement: no waitlist interstitial on sign-up; new users reach `/chat` on a Free entitlement immediately.

## OAuth — Google / Apple / GitHub via Clerk

Social sign-in is delegated entirely to Clerk's `<SignIn>`/`<SignUp>` components; the app holds no OAuth client secrets and runs no callback exchange. The legacy custom callback is **retired and hard-failed** to the visible error page (**✅ Built** — `apps/web/app/auth/callback/route.ts` returns a 307 to `/auth/error`). CSP already allow-lists Clerk origins for the SSO popup/redirect (**✅ Built** — `proxy.ts` `script-src`/`connect-src` include `*.clerk.accounts.dev`, `*.clerk.com`). **🟡 Partial:** Google/Apple/GitHub button visibility depends on Clerk-dashboard provider enablement, which is not provable from repo code — treat which providers are live as config, and verify in the Clerk instance before claiming shipped.

## Magic Link

Passwordless email-link / email-code sign-in is a Clerk strategy surfaced by the same `<SignIn>`/`<SignUp>` widgets; no bespoke UI exists in-repo. **🟡 Partial** — component path `apps/web/app/login/page.tsx`; the strategy must be enabled in the Clerk dashboard and is not repo-verifiable. Requirement: link/code emails resolve to the same validated `redirectTo` as password sign-in and never to an off-origin URL.

## Session Management

Sessions are Clerk cookies (`__session`, `__client`, `__clerk*`). `proxy.ts` does a fast cookie presence check to gate protected routes (`/chat`, `/chats`, `/settings`, `/billing`, `/admin`) before hitting Clerk (**✅ Built**). Server auth resolves two paths in `apps/web/lib/api-auth.ts` `getClerkAuthUser`: (1) Clerk browser session via `auth()`, (2) `Authorization: Bearer` Clerk JWT (verified with `CLERK_SECRET_KEY`) for Desktop/CLI/Mobile calls — **✅ Built**. Cross-surface token handoff (desktop/CLI device link) is served by `apps/web/app/api/auth/{set-token,desktop-token}/route.ts` and `app/api/device/approve`, all CSRF- and rate-limit-guarded (**✅ Built** — `set-token/route.ts` calls `withRateLimit(..., 'auth-login')` + `requireCsrfToken` and re-verifies the JWT before writing a cookie). Suspended/banned accounts are rejected on every request via `assertAccountActive` (**✅ Built**).

## Password Reset

Clerk's code-based reset is embedded in the `<SignIn>` widget at `/login`; there is no standalone reset form to maintain. The old Supabase email-link callback is dead-ended: `/auth/update-password` now redirects to `/login` so no orphan form is reachable (**✅ Built** — `apps/web/app/auth/update-password/page.tsx`, whose comment records the Clerk migration). Requirement: reset flows must not leak whether an email exists beyond Clerk's own responses.

## Verification

Email-address verification is handled by Clerk during `<SignUp>` (**🟡 Partial** — dashboard-configured; component at `apps/web/app/signup/page.tsx`). Separately, **device verification** (approving a Desktop/CLI login from the browser) is fully in-repo: `/verify?code=…` requires a signed-in session, fetches a CSRF token, and POSTs approve/deny to `/api/device/approve` (**✅ Built** — `apps/web/app/verify/verify-client.tsx`). Requirement: a signed-out user hitting `/verify` is prompted to sign in first, carrying the code forward.

## Security

Defense-in-depth is real and cited: per-request CSP with a crypto nonce replacing `unsafe-inline` script (**✅ Built** — `proxy.ts` `buildCspWithNonce`, `frame-ancestors 'none'`, `object-src 'none'`); CSRF tokens on state-changing auth routes (**✅ Built** — `apps/web/lib/csrf.ts`); Upstash-Redis distributed rate limiting that **fails closed** on security-sensitive endpoints and throws at cold-start if Redis env is missing in production (**✅ Built** — `apps/web/lib/rate-limit.ts`); and a `security_audit_logs` sink for `auth_failed`, `csrf_validation_failed`, `rate_limit_exceeded`, `suspicious_activity`, etc. (**✅ Built** — `apps/web/lib/security-audit.ts`). Role checks (`requireAdmin`/`requireRole`) read Clerk `publicMetadata.role` (**✅ Built** — `apps/web/lib/auth-guards.ts`).

## CAPTCHA

Bot challenge is Clerk Smart CAPTCHA over Cloudflare Turnstile. The CSP is already wired for it: `challenges.cloudflare.com` is allow-listed in both `script-src` and `frame-src` (**✅ Built** — `proxy.ts`). **🟡 Partial:** the challenge itself must be turned on in the Clerk dashboard and is not repo-provable; do not claim an active CAPTCHA on sign-up without verifying the instance. No third-party CAPTCHA is self-hosted.

## Fraud Detection

Building blocks exist — endpoint rate limits (`auth-login`, `device-link`, `device-poll`), the security-audit trail, and `account_status` suspend/ban enforcement (**🟡 Partial** — `apps/web/lib/{rate-limit,security-audit,api-auth}.ts`). Dedicated fraud scoring — device fingerprinting, velocity/anomaly detection, disposable-email blocking, chargeback-linked account holds — is **🔭 Planned** and not yet built. Billing-abuse controls tighten with public-alpha usage but must not regate account access.

## Repository map

- `apps/web/proxy.ts` — Clerk middleware (`proxy` export), CSP nonce, protected-route gate, signed-out redirect.
- `apps/web/app/{login,signup,sign-in}/page.tsx`, `apps/web/components/marketing/AuthShell.tsx`, `apps/web/app/auth/clerkAppearance.ts` — entry UI.
- `apps/web/app/auth/{callback,update-password,device}`, `apps/web/app/device-auth/`, `apps/web/app/verify/` — retired callback, reset redirect, device approval.
- `apps/web/lib/{api-auth,auth-guards,rate-limit,security-audit,csrf,safe-redirect}.ts` — server auth, roles, guards.
- `apps/web/app/api/auth/{set-token,desktop-token}/route.ts`, `apps/web/app/api/device/approve` — cross-surface token handoff.
- `apps/web/db/neon` — `profiles` (`account_status`, role), `security_audit_logs`.

## Competitor notes

Claude, ChatGPT, and Codex all run first-party account systems with email + OAuth + passwordless and cloud sessions. AGI Web deliberately **outsources the identity primitive to Clerk** to avoid re-implementing auth, and diverges on trust: Web is intentionally the _only_ AGI surface with no Local and no BYOK path, so unlike competitors that blur account state across modes, AGI keeps Cloud identity a hard boundary. Cross-surface reach comes from one Clerk account plus Bearer-JWT verification (Desktop/CLI/Mobile), and device-approval verification is a first-class in-repo flow — closer to Codex/Claude device pairing than to a pure web login.

## Acceptance / Definition of Done

Build

- [ ] `/login`, `/signup`, `/sign-in` alias, and `/verify` render and route with sanitized redirects; typecheck, test, and build green (`pnpm --filter @agiworkforce/web {typecheck,test,build}`).
- [ ] No dead auth forms; retired callback and `/auth/update-password` redirect cleanly.

Trust

- [ ] No Local/BYOK affordance appears anywhere in auth UI or copy.
- [ ] Managed Cloud presents as open (no waitlist) for account creation; tier gates features only.

Security

- [ ] CSP nonce, CSRF, fail-closed rate limits, and `security_audit_logs` active on all auth/token routes; suspended/banned accounts rejected.
- [ ] OAuth/magic-link/CAPTCHA states verified against the live Clerk instance before any ✅ claim.

## Anti-patterns

- Adding a Local or BYOK sign-in path, or any account-free chat, on Web.
- Reintroducing a custom OAuth callback or hand-rolled token exchange instead of Clerk.
- Any `middleware.ts` file — Web uses `proxy.ts` with the exported `proxy` function.
- Referencing Supabase, or restoring the retired `/auth/update-password` form.
- Claiming OAuth providers, magic link, or CAPTCHA are live from component presence alone (they are dashboard-config — mark 🟡 until verified).
- Open redirects: trusting `redirectTo`/`next` without `getSafeRedirectUrl`.
- Waitlist-gating account creation, or citing removed tiers (Plus/pro_plus/Hobby) or credit top-ups.
- Hardcoding model IDs in auth code — model IDs come only from `packages/types/src/models.json`.
