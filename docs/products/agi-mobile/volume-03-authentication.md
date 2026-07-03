# AGI Mobile — Volume 03 — Authentication

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md` (repo root), `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and the real implementation: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(auth)/{login,reset-password,_layout}.tsx`, `apps/mobile/app/(public)/{onboarding,age-gate}.tsx`, `apps/mobile/src/features/auth/{store.ts,hooks/useBiometricGate.ts}`, `apps/mobile/src/integrations/clerk.ts`, `apps/mobile/services/{authSession.ts,remoteChatGate.ts}`, `apps/mobile/lib/{biometricFlagStore.ts,deviceId.ts,v1FeatureFlags.ts}`, `apps/mobile/src/features/settings/cloud-account/index.tsx`, `apps/mobile/app.config.js`.

## Overview & stance

AGI Mobile exposes exactly two trust modes — **Local** (a small on-device LLM, free, account-less) and **Managed Cloud** (public alpha, open by default). **There is no BYOK on mobile and no affordance to enter provider API keys.** Authentication therefore governs _only_ the Cloud boundary. Local Mode is fully usable with no account: a user installs the app, accepts the first-run disclosure and age gate, downloads a model, and chats — never seeing a sign-in wall.

The governing rule (`apps/mobile/app/_layout.tsx`, lines ~386–408): a user who is **not** signed in but has completed onboarding lands in the app in **Local mode** — Cloud sign-in is reached on demand via the Cloud toggle, never forced. Cloud keeps a **real** Clerk auth gate (no demo bypass); the signed-in entitlement _is_ the Managed-Cloud gate in public alpha. Auth is Clerk + Neon + Stripe; Supabase is not used anywhere. `remoteChatGate.ts` fails closed when `FEATURES.cloudChat` is off.

## Splash Screen

✅ Built — `apps/mobile/app.config.js` (`splash`, `./assets/splash-icon.png`, `backgroundColor: #0f0f0f`) plus the boot gate in `apps/mobile/app/_layout.tsx` (lines ~567–580) that holds a themed `ActivityIndicator` until MMKV encryption init, auth-store initialize, and the SecureStore biometric-flag read all resolve. Requirements: the splash must not flash the navigator before `isMmkvReady && isInitialized && isBiometricReady`; it must never leak signed-in vs signed-out state; no network call gates dismissal.

## Welcome Screen

✅ Built — `apps/mobile/app/(public)/onboarding.tsx` is a three-screen local-first flow (hero → device-tier detection + model recommendation → first model download). It must stay simple: no suggestion/starter cards, no forced account creation. The hero presents Local Mode as the default; Cloud sign-in is explicitly deferred to after setup. The first-run compliance disclosure (`FirstRunDisclosureModal`) fires before tier detection.

## Sign In

✅ Built — `apps/mobile/app/(auth)/login.tsx` renders Clerk's prebuilt native `AuthView mode="signInOrUp"` (one combined screen). It is **dismissible**: `onDismiss` routes back to `/(app)` (Local), so sign-in is always escapable. When `FEATURES.auth` is false the route redirects to `/(app)`; an already-signed-in user is redirected in. The native AuthView syncs the Clerk session itself (no manual `setActive`). The legacy custom `signInWithEmail` path in `src/features/auth/store.ts` intentionally throws — it must not be re-wired.

## Sign Up

✅ Built — same `AuthView mode="signInOrUp"` component (`apps/mobile/app/(auth)/login.tsx`); Clerk's prebuilt view handles sign-up, email verification, and sign-in in one flow. The age gate (`apps/mobile/app/(public)/age-gate.tsx`) runs **before** any account creation on first run, enforcing DPDP/COPPA/Play GenAI minimums. New cloud accounts inherit the Free tier; entitlement is verified server-side via the Clerk Bearer token.

## OAuth — Apple and Google

🟡 Partial — social sign-in is delegated to Clerk's native `AuthView`, and `expo-apple-authentication` is configured (`apps/mobile/app.config.js`). The buttons that appear are driven by the **Clerk dashboard** social-connection config, not by repo code. Gaps: the app currently ships the development `pk_test_…` key (`apps/mobile/src/integrations/clerk.ts`) — a `pk_live_…` production instance with Apple + Google enabled and the Apple "Sign in with Apple" capability is required before store release; the custom `signInWithApple`/`signInWithGoogle` store methods are stubs that throw and must stay unused. Apple sign-in is mandatory for App Store approval when Google is offered.

## Password Recovery

✅ Built (as web-delegated) — `apps/mobile/app/(auth)/reset-password.tsx` is a deep-link-safe placeholder that opens `https://agiworkforce.com/auth/reset-password` via `openExternalUrl`; `_layout.tsx` routes the universal link `agiworkforce.com/auth/reset-password` here so stale recovery links never fall through to pairing/share handlers. Requirement: account recovery is owned by the Web/Clerk surface; mobile must not implement an in-app password-reset form. Local Mode data stays separate and is never affected by recovery.

## Session Management

✅ Built — Clerk's `expo-secure-store` token cache persists the session across launches; `apps/mobile/src/integrations/clerk.ts` bridges the native session's `getToken()` (and a `skipCache` force-refresh) to non-React callers, and `apps/mobile/services/authSession.ts` exposes `getAuthHeaders`/`refreshAuthSession` for the 401-retry path. `_layout.tsx`'s `ClerkTokenBridge` mirrors `isLoaded`/`isSignedIn` into the auth store so cold-start (~200ms) never mis-fires guards. Cloud lifecycle (tier refresh, realtime, push, sync) gates on the real `isClerkSignedIn` signal. The cloud-account screen surfaces "Current session: Active" and the user ID. 🔭 Planned: a remote active-sessions list with per-session revocation.

## Biometrics — Face ID and fingerprint

✅ Built — `apps/mobile/src/features/auth/hooks/useBiometricGate.ts` + `apps/mobile/lib/biometricFlagStore.ts`. The opt-in lock flag lives in SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), not MMKV, so extracting the MMKV key cannot disable it (LOW-MOB-1). The gate is **fail-closed**: indeterminate/pre-hydration and any auth error stay locked (CRIT-MOB-01, H-10); missing/unenrolled biometrics fall back to the OS passcode rather than auto-unlocking. Re-locks on background→active. `NSFaceIDUsageDescription` and the `expo-local-authentication` Face ID permission string are set in `app.config.js`. The lock must engage **before** the auth store loads any session.

## Device Registration — trusted devices

🟡 Partial — `apps/mobile/lib/deviceId.ts` mints a stable per-device UUID in SecureStore, and push-token registration creates an authenticated device record on the account only after `isClerkSignedIn && isInitialized` (`_layout.tsx`, MOB-1 fix). Gap: there is no user-facing trusted-device list, naming, or per-device revocation UI. 🔭 Planned: a Clerk-backed trusted-device manager with remote sign-out. Device records are a cloud-account feature and must never be created for Local-only users.

## Account Switching

🔭 Planned — the app holds a single Clerk session; there is no multi-account/`setActive` switcher today. When built, switching must run the full cloud-scoped teardown (below) between accounts so chats/memory/projects/settings never bleed across users.

## Logout

✅ Built — `apps/mobile/src/features/settings/cloud-account/index.tsx` ("Log Out", confirm dialog) calls `useAuthStore.signOut()` (`src/features/auth/store.ts`), which signs out of Clerk and then tears down all cloud-scoped state: stops the sync loop and clears cloud chats, memories, projects, sync cursors, and cloud personalization. **Local Mode on-device data is intentionally preserved** — it belongs to the device, not the account. Sign-out also re-locks Cloud access (`setCloudAccess(false)`), and logout must succeed locally even if the network sign-out call fails.

## Repository map

- `apps/mobile/app/_layout.tsx` — boot/splash gate, biometric gate UI, Clerk provider + token bridge, local-first auth guard.
- `apps/mobile/app/(auth)/{login,reset-password,_layout}.tsx` — sign-in/up, web-delegated recovery.
- `apps/mobile/app/(public)/{onboarding,age-gate}.tsx` — welcome + age gate.
- `apps/mobile/src/features/auth/{store.ts,hooks/useBiometricGate.ts,services/ageGate.ts}` — auth state, biometric gate, age gate.
- `apps/mobile/src/integrations/clerk.ts`, `apps/mobile/services/authSession.ts` — Clerk client + token facade.
- `apps/mobile/lib/{biometricFlagStore.ts,deviceId.ts,v1FeatureFlags.ts}`, `apps/mobile/services/remoteChatGate.ts`.
- `apps/mobile/src/features/settings/cloud-account/index.tsx` — logout, delete account, session view.
- `apps/mobile/app.config.js` — splash, scheme, associated domains, Face ID + Apple plugins.

## Competitor notes

ChatGPT and Claude mobile gate the whole app behind a cloud account on first launch. AGI deliberately diverges: **Local Mode needs no account**, and the account gate applies only to the Managed-Cloud boundary — matching our per-surface trust model. Like both competitors we use prebuilt native auth (Clerk's AuthView) with Apple + Google OAuth and biometric app-lock. Unlike them, mobile never exposes provider keys (no BYOK), runs an on-device LLM, and keeps Local data wholly separate from the cloud account at sign-out and account deletion.

## Acceptance / Definition of Done

Production-ready when an account-less user completes onboarding and reaches Local chat with zero sign-in prompts; Cloud sign-in is reachable on demand and dismissible; biometric lock is opt-in, fail-closed, and survives a SecureStore read failure; logout fully clears cloud-scoped state while preserving Local data; and the build ships a `pk_live_…` Clerk key with Apple + Google enabled.

- [ ] Build: `pnpm --filter @agiworkforce/mobile typecheck` and `test` pass; splash never flashes pre-gate UI.
- [ ] Trust: no forced sign-in wall after onboarding; no BYOK affordance anywhere; `remoteChatGate` fails closed when Cloud is disabled.
- [ ] Security: tokens only in SecureStore; biometric gate fail-closed; sign-out teardown verified across chats/memory/projects/settings; no `pk_test` key in a store build.

## Anti-patterns

- Adding any BYOK / API-key entry to mobile, or routing Local chats to Cloud without explicit consent.
- Forcing sign-in after onboarding, or making the `AuthView` non-dismissible.
- Implementing an in-app password-reset form instead of web delegation.
- Faking a "trusted devices" or "active sessions" manager that does not exist (label 🔭).
- Shipping the `pk_test_…` Clerk key, or storing tokens outside SecureStore.
- Hardcoding model IDs (read `packages/types/src/models.json`) or referencing Supabase, "Plus", `pro_plus`, or "Hobby".
