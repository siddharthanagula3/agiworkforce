# AGI Desktop — Volume 02 — Authentication

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `apps/desktop/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); grounded in `apps/desktop/src/features/auth/{AuthPage,AuthForm}.tsx`, `apps/desktop/src/services/cloudAccountAuth.ts`, `apps/desktop/src/stores/{auth,authOrchestrator}.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src-tauri/src/sys/account/mod.rs`, `apps/desktop/src-tauri/src/sys/commands/auth.rs`, and `apps/desktop/src-tauri/src/sys/security/{auth,auth_db,storage,machine_key,rate_limit}.rs`.

## Overview & stance

Desktop is the full-trust surface: **Local + BYOK + Managed Cloud**, each selectable with a correct, visible label. Authentication only ever gates **Managed Cloud**. Local mode requires **no account** and must never be trapped behind a sign-in wall; BYOK is a free access mode that needs provider keys, not an AGI account. The trust-boundary gate is the onboarding mode picker (`apps/desktop/src/stores/appModeStore.ts` `hasSelectedMode`, consumed in `App.tsx`), not a login screen. Cloud auth itself is delegated to **Clerk on AGI web** via a device-link approval flow — the desktop app opens the web sign-in and then approves this machine as a device, rather than collecting credentials natively (`cloudAccountAuth.ts` → `openWebAccount`, `device_link_initiate`/`device_link_poll` in `src-tauri/src/sys/account/mod.rs`). Stack is Clerk (auth) + Neon (DB, RLS) + Stripe (billing); never Supabase.

## Splash Screen

🔭 Planned. There is no dedicated branded splash today; boot renders a loading skeleton with a hard 8-second recovery guard so local/account-less users never hang (`App.tsx` `setSessionValidated` timeout). Requirements: a lightweight splash that resolves to the mode picker (first run) or the last-used surface, shows offline/local readiness without waiting on any network call, and never blocks Local mode on cloud warm-up.

## Sign In

🟡 Partial. `signIn()` opens the web Clerk flow (`/sign-in?email=…&surface=desktop`) and returns HTTP 202 ("continue in AGI web, then approve this desktop device"); the desktop UI (`AuthForm.tsx`, `AuthPage.tsx`) presents the entry but does not authenticate natively. `AuthPage` currently labels desktop Cloud "coming soon." Requirements: after web sign-in, the paired desktop device receives tokens via `device_link_poll` and lands in Cloud mode with a visible provider label; Local/BYOK entry stays reachable without signing in.

## Sign Up

🟡 Partial. `signUp()` routes to `/sign-up?email=…&surface=desktop` and returns 202 (`cloudAccountAuth.ts`). Account creation, email verification, and Terms/consent are owned by Clerk on web. Requirement: sign-up must not be presented as a prerequisite to open the app — the mode picker precedes it.

## OAuth

🟡 Partial. `signInWithOAuth(provider)` supports `google | github | apple | discord` and opens `/sign-in?provider=…&surface=desktop` in the system browser (`@tauri-apps/plugin-shell` `open`). The desktop app holds no OAuth client secrets; the provider handshake completes in Clerk on web, then the device is approved. Requirement: provider list must reflect Clerk's configured connections, not a hardcoded superset.

## Magic Link

🟡 Partial. `signInWithMagicLink(email)` opens the web sign-in for Clerk to send the link; `verifyOtp()` explicitly returns "Email-code verification is handled by Clerk on AGI web" (`cloudAccountAuth.ts`). Desktop does not mint or verify magic links itself. Requirement: the magic-link/email-code path must terminate in device-link approval, never in a desktop-side credential store.

## Session Management

🟡 Partial. Two layers exist. (1) The **cloud account session** is derived from a Clerk JWT (`buildSession`, `userFromAccessToken`), with an in-memory account snapshot cache (10-minute TTL). Tokens are held **in memory** in Rust (`ACCESS_TOKEN`/`REFRESH_TOKEN` RwLocks, `account_store_access_token`/`account_clear_tokens` in `sys/account/mod.rs`), so cloud sessions do not silently persist to disk. (2) A **local session manager** (`sys/security/auth.rs`) issues access/refresh tokens with expiry and refresh, persisted HMAC-hashed and AES-GCM-encrypted in `auth_db.rs` (raw tokens never stored). Requirements: explicit sign-out clears tokens and cache (`signOut` → `account_clear_tokens`, `clearAuthCache`); expiry triggers refresh or a re-auth prompt; **switching to Local mid-session must not carry cloud tokens into local chats.** Gap: a durable, keychain-backed cloud-session store for restart-survival is 🔭.

## Device Registration — trusted devices

🟡 Partial. `device_link_initiate` posts to `/api/device/link` with a stable, machine-derived fingerprint (`generate_device_fingerprint`: SHA-256 over hostname + username + salt), returns a link code, verify URL, and optional QR; `device_link_poll` waits for web approval and returns tokens (`sys/account/mod.rs`). This is the approved path for turning a desktop into a trusted Cloud device. Gaps (🔭): a user-facing trusted-device list, per-device revocation UI, and device naming beyond hostname are not yet built.

## Password Reset

🟡 Partial. `resetPassword(email)` opens `/sign-in?email=…&redirect=reset-password`; `updatePassword()` opens `/user` (`cloudAccountAuth.ts`). Clerk owns reset and rotation on web; desktop only deep-links to it. Requirement: after a web-side password change, existing desktop tokens must be re-validated on next call, not trusted indefinitely.

## Security

🟡 Partial. JWTs are structurally validated **and** HMAC-SHA256 signature-verified against a machine secret with `exp` enforcement (`sys/commands/auth.rs` `validate_jwt`, `verify_jwt_signature_with_secret`). Secrets and BYOK provider keys are encrypted at rest with **AES-256-GCM using machine-derived keys** (PBKDF2-HMAC-SHA256, 600k iterations) rather than the OS keychain (`sys/security/storage.rs`, `machine_key.rs`); the `keyring = "3"` dependency is present but the security layer explicitly documents machine-key encryption "instead of OS keyring." **Gap vs. product stance:** the intended macOS Keychain / Windows Credential Manager / Linux Secret Service backing for keys is 🔭 — spec target, not current behavior. Outbound calls pass an egress guard (`apps/desktop/src/lib/egressGuard.ts`) so Local data cannot leak to cloud endpoints. Requirement: Local→BYOK forks keep their canonical gate (context selection, secret scan, payload preview, provider label, consent) — auth never bypasses it.

## CAPTCHA

🔭 Planned (delegated). No CAPTCHA is rendered or verified in the desktop app; challenge handling belongs to Clerk on the web sign-in surface. Requirement: if Clerk raises a challenge, the desktop flow must surface it in the opened browser and resume device-link polling on success — never fake a "verified" state locally.

## Fraud Detection

🟡 Partial. Desktop contributes signals — a stable device fingerprint (`sys/account/mod.rs`) and local rate limiting (`sys/security/rate_limit.rs`) — but bot/risk scoring, abuse, and account-fraud decisions are owned by Clerk plus server-side billing/abuse controls on Neon/Stripe. Requirement: fraud/abuse controls must keep pace with public-alpha Cloud usage without gating Local/BYOK, which carry no AGI account.

## Repository map

- `apps/desktop/src/features/auth/{AuthPage,AuthForm}.tsx` — desktop auth entry UI.
- `apps/desktop/src/services/cloudAccountAuth.ts` — Clerk-web routing, session/JWT decode, snapshot cache.
- `apps/desktop/src/stores/{auth,authOrchestrator}.ts` — auth state, session validation.
- `apps/desktop/src/stores/appModeStore.ts`; `apps/desktop/src/App.tsx` — trust-mode gate, boot guard.
- `apps/desktop/src-tauri/src/sys/account/mod.rs` — device link initiate/poll, in-memory token store.
- `apps/desktop/src-tauri/src/sys/commands/auth.rs` — JWT validation.
- `apps/desktop/src-tauri/src/sys/security/{auth,auth_db,storage,machine_key,rate_limit}.rs` — local sessions, encrypted token store, machine-key crypto, rate limiting.
- Backend (web-owned, referenced): `apps/web` Clerk routes and `/api/device/link`; `/api/me` account snapshot.

## Competitor notes

Claude, ChatGPT, and Codex desktop/CLI clients sign a user into a single first-party cloud account and route all sessions through it. AGI deliberately diverges: Cloud is **one of three** trust modes, sign-in is **optional**, and Local/BYOK never require an account. Where competitors centralize credentials in the app, AGI delegates cloud auth to Clerk-on-web with device-link approval (parity with Codex/Claude remote-connection pairing) so the desktop holds no OAuth secrets, and keeps provider keys user-controlled and locally encrypted. Remote Control (phone/web steering a locally-running desktop session) is a paired window, not a new auth mode or cloud path.

## Acceptance / Definition of Done

Production-ready when: cloud sign-in/up, OAuth, magic-link, and password reset all complete through Clerk-on-web with device-link approval; sessions refresh, expire, and sign out cleanly; and Local/BYOK remain fully usable with no account.

- [ ] Build: `pnpm --filter @agiworkforce/desktop typecheck` and `cargo check -p agiworkforce-desktop` pass; device-link initiate/poll round-trips against `/api/device/link`.
- [ ] Trust: Local mode reachable with zero auth; switching to Local drops cloud tokens; Local→BYOK fork keeps context selection + secret scan + payload preview + provider label + consent.
- [ ] Security: JWT signature + `exp` enforced; tokens never stored raw; cloud tokens cleared on sign-out; egress guard blocks Local→cloud leakage; CAPTCHA/challenges resolved via Clerk, never faked locally.

## Anti-patterns

- Trapping account-less Local/BYOK users behind a sign-in wall, or gating first launch on auth.
- Silently routing Local/BYOK chats, files, or sessions to Cloud after sign-in.
- Claiming OS-keychain storage that the code does not yet do (current backing is machine-key AES-256-GCM — label it honestly).
- Faking a CAPTCHA/verified or authenticated state locally instead of resolving through Clerk.
- Persisting or logging raw tokens; leaving expired JWTs trusted; skipping signature verification.
- Reintroducing removed tiers (`Plus`, `pro_plus`, `hobby`) into plan gating — the `hasPlan` hierarchy in `cloudAccountAuth.ts` still lists legacy tiers (🟡 reconciliation gap, tracked separately); do not treat them as live.
- Referencing Supabase, inventing routes/env vars, or hardcoding model IDs (IDs come only from `packages/types/src/models.json`).
