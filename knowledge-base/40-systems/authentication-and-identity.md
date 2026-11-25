---
id: "SYS-authentication-and-identity"
type: "system"
title: "Authentication and identity"
basis: "code inspection and project documents"
second_reader: "not challenged; corrected after the consistency check across pages"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Authentication and identity

One AGI account, held by an identity provider (Clerk today, behind a swappable port), signs in on every app. Web signs in with email, code, password, passkey or provider buttons. Desktop hands off to the browser with a one-time code. Mobile signs in natively. CLI, VS Code and Chrome link through device codes or the web session. Every sign-in meets terms and 18-and-over checks; the minimum age is 18 everywhere today. Local use needs no account.

## What it is and why it exists

**What it is.** Authentication proves who a person is. Identity ties that person to one account that all six apps share. The product keeps the identity provider behind a small interface (a "port") so the provider can change without touching routes or pages. [code] (packages/platform/identity/src/factory.ts:11) names `clerk` as the default provider; `AGI_IDENTITY_PROVIDER` selects it. Web code asks `getIdentityProvider()` and never builds a client itself [code] (apps/web/lib/server/identity.ts).

**Why it exists.** One account lets chat history, plan and devices follow the person across Web, Desktop, Mobile, CLI, VS Code and Chrome. It also gives the server one place to enforce account status, terms, the 18-and-over rule and revocation.

**What it is not.** Sign-in is not payment and not entitlement. Plans, quotas and usage are a separate subsystem (the AGI Subscription system); sign-in only supplies the account id those rules attach to. [inferred] from the sign-in routes carrying no plan check (apps/web/app/api/auth/device/approve/route.ts, token/route.ts). Local inference on mobile and desktop is not gated by payment; whether it is gated by an account differs by app (see Differences between apps).

**Credential families, in one table.**

| Family | Used by | Issuer | Lifetime found in code |
|---|---|---|---|
| Identity-provider session cookie and session token | Web (and Desktop window, which shows hosted web) | Clerk | Provider-side lifetime [unknown]; product cap 30 days from creation by default (configurable) |
| Identity-provider native session token plus a signed "surface proof" token | Mobile | Clerk (mobile token template) | Provider-side [unknown] |
| Identity-provider token bound to the extension origin | Chrome | Clerk via `syncHost` | Provider-side [unknown] |
| Developer token (JWT signed by the web app) plus rotating refresh token | CLI, VS Code (and the retained Tauri desktop build) | Web app, after browser approval | Access 7 days, refresh 30 days |
| `sk_live_` / `sk_test_` API keys | Programmatic callers | Web app | Out of scope here |

## How it works today

### 1. Sign-in service
The provider is Clerk [code] (packages/platform/identity/src/factory.ts:11; apps/web/proxy.ts:17-18 imports the port). Web middleware `proxy` wraps every session route with `identityMiddleware.withSession`, passing an **authorized-party allowlist**. If the allowlist cannot be resolved, the proxy answers 503 instead of running unverified, because a provider skips the origin check when the list is empty [code] (apps/web/proxy.ts:192-224, 340). The proxy also sends a signed-out visitor from a protected product route to `/login?redirectTo=...` when no session cookie exists, but `/chat` itself stays past that check; it serves guest Cloud chat only while the `guest.chat` feature flag is on (and bot protection is ready), otherwise guest chat is off [code] (apps/web/proxy.ts:324-330; apps/web/lib/guest-chat/guest-chat-access.ts; config.ts).

Enabled sign-in providers come from `AGI_AUTH_PROVIDERS` (`google`, `github`, `microsoft`, `apple`; default Google and GitHub; `passkey` is a flag in the same list) [code] (packages/client/client-runtime/src/authProviders.ts; apps/web/features/auth/authProviderConfig.ts).

### 2. Web sign-in steps
1. `/login` or `/signup` render the same entry screen (apps/web/app/signup/page.tsx calls `AuthEntryScreen`) [code].
2. `AuthFlow` runs a step machine: `email` -> `password` | `code` -> `second_factor` -> `new_password` | `notice` [code] (apps/web/features/auth/authContract.ts, AuthFlow.tsx). Methods are `password`, `email_code`, `passkey`; provider buttons and enterprise SSO redirect through `/auth/sso-callback` [code] (authContract.ts; IdentityAuthAdapter.tsx:296-301, 649-655). Code length is 6, resend cooldown 30 s, minimum password 8 [code] (authRoutes.ts constants in authContract.ts).
3. On sign-up the person types an age first; under 18 is refused before any provider call [code] (apps/web/features/auth/useSignupAgeGate.ts; packages/contracts/types/src/account-eligibility.ts:1).
4. Both flows end at `/login/complete` or `/signup/complete`, a server page that checks in order: a live session exists (else a stale-session recovery screen, not a redirect, to avoid a loop); account is allowed (locked, recovery, suspended, deleted are refused with a notice); primary email confirmed; adult-eligibility decision (`ineligible` shows a refusal, `unconfirmed` asks for age); Terms acceptance; then redirect to a safe destination [code] (apps/web/app/login/complete/page.tsx:41-120).
5. `postAuthDestination` sends the person to the requested path, or a new chat; sign-in loop paths and `/` map to new chat [code] (apps/web/features/auth/postAuthDestination.ts).

### 3. Desktop hand-off to the browser (public Electron app)
The desktop window never shows a password field. A signed-out window shows a data page with Start and Cancel buttons [code] (apps/desktop/electron/signInScreen.ts). Steps:
1. Shell makes a random 32-byte **verifier**, keeps it in memory only, and computes its SHA-256 **challenge** [code] (apps/desktop/electron/browserSignIn.ts:39-41).
2. Shell opens the system browser at `https://<cloud origin>/auth/desktop?challenge=...`. The pending attempt lives 10 minutes [code] (browserSignIn.ts:13, 47-53).
3. The page `/auth/desktop` needs a web session; if none, it sends the person to `/login` and back. It then POSTs the challenge to `api:POST /api/auth/desktop/grant` (CSRF required, rate limit `device-link`, refused for developer-token callers) and gets a one-time code stored hashed with a 60-second life [code] (apps/web/app/auth/desktop/DesktopSignInHandoff.tsx; apps/web/app/api/auth/desktop/grant/route.ts; apps/web/lib/server/desktop-sign-in.ts:7, 33-47). If a passkey is required for the account, the page detours to the account-security verify page first [code] (DesktopSignInHandoff.tsx).
4. The browser navigates to the deep link `agiworkforce-cloud://sign-in?code=...&challenge=...` [code] (packages/contracts/local-runtime/src/desktop-sign-in.ts; host-bridge.ts:4).
5. The shell checks the link's challenge against its pending one. Any mismatch, reuse, relaunch or cancel yields `expired`. On match it loads `/auth/desktop/complete#code=...&verifier=...` in the window [code] (browserSignIn.ts `readBrowserSignInLink`).
6. That page (only runs if the host bridge reports browser sign-in support) POSTs code and verifier to `api:POST /api/auth/desktop/redeem`. The server marks the grant consumed only if the code hash and `sha256(verifier)` match and it has not expired, then asks the identity provider for a **sign-in ticket** valid 60 s, which the page exchanges for a session in the window [code] (DesktopSignInComplete.tsx:73-84; desktop-sign-in.ts:50-67; redeem/route.ts).
7. The window's persistent partition is `persist:agi-cloud` [code] (apps/desktop/electron/config.ts:24).

The retained Tauri desktop code instead uses the CLI-style device-code flow (`apps/desktop/src/services/desktopNativeSignIn.ts` imports `requestDeviceAuthorization`, `pollDeviceAuthorization`) [code]. It is internal, not the public desktop [requirement] (AGENTS.md section 5).

### 4. Mobile native sign-in
The app wraps everything in `ClerkProvider` with Clerk's secure token cache [code] (apps/mobile/app/_layout.tsx:58-59, 994). Sign-in screen steps are `email`, `password`, `code`, with email-code, password, passkey-adjacent second factors, Apple and other providers via `useSSO` and `useSignInWithApple` [code] (apps/mobile/src/features/auth/components/MobileSignIn.tsx:5-7, 46). On iOS the app shows either both Apple and other providers or none (App Store rule 4.8) [code] (apps/mobile/src/features/auth/services/loginProviders.ts). A native token has no web origin, so each API call carries the session token as Bearer plus a second "surface proof" token from a Clerk template, sent in `SURFACE_TOKEN_HEADER` [code] (apps/mobile/services/authSession.ts; apps/mobile/src/integrations/clerk.ts:79-146). The server admits such a pair only if both tokens lack an origin claim, name the same subject and the proof binds a known surface [code] (apps/web/lib/server/native-session-token.ts).

### 5. CLI and VS Code device linking (RFC 8628 device grant)
1. Client calls `api:POST /api/auth/device/code` with `surface` of `cli`, `vscode`, `chrome` or `desktop`. Server stores a pending row and returns `device_code` (UUID), a short `user_code` (XXXX-XXXX), verification URL, interval 5 s, lifetime 900 s [code] (apps/web/app/api/auth/device/code/route.ts:24-31, 80-120; grant-policy.ts).
2. Client opens `/auth/device?user_code=...&surface=...`. The signed-in person sees the client name and scopes (`account:read`, `managed-cloud:use`) and approves or denies with `api:POST /api/auth/device/approve` [code] (apps/web/app/auth/device/page.tsx; approve/route.ts).
3. Approval is refused when: caller is itself a developer-token session; the account's device sign-in setting is off (403 `DEVICE_SIGNIN_DISABLED`, 503 if unreadable); Terms need re-acceptance; the 18-and-over decision is not confirmed [code] (approve/route.ts:45-190).
4. Client polls `api:POST /api/auth/device/token`. Answers: `authorization_pending`, `slow_down`, `access_denied`, `expired_token`, `account_unavailable`, `terms_acceptance_required`, age refusal, or tokens. On success the server consumes the code and inserts a hashed refresh token in a new family, in one transaction [code] (token/route.ts:70-250).
5. Access token is a JWT (issuer `agiworkforce-api-gateway`) valid 604800 s; refresh token is 32 random bytes, stored only as a SHA-256 hash, valid 30 days [code] (developer-token.ts:9-11; device-refresh-token.ts:5-22).
6. `api:POST /api/auth/device/refresh` rotates the pair; a replayed old refresh token marks the whole family compromised and revokes it [code] (refresh/route.ts, refresh-token-family.ts `finishFamilyAsCompromised`).
7. CLI stores the grant in the OS keyring (service `com.agiworkforce.cli.auth`), or an owner-only file when `AGIWORKFORCE_NO_KEYRING=1` [code] (apps/cli/src/auth.rs:92, 175, 778). VS Code stores it in `SecretStorage` under `agiWorkforce.accountToken` [code] (apps/extension-vscode/src/utils/api.ts:220-229).
8. Sign-out calls `api:POST /api/auth/logout` with the access token and/or refresh token; it revokes the token id and the whole session family [code] (apps/web/app/api/auth/logout/route.ts; apps/cli/src/oauth.rs:451-485).

### 6. Chrome extension link to the web session
The extension does not run its own sign-in form. `openClerkSignIn` opens `<web origin>/sign-in?redirectTo=/auth/chrome-extension` in a tab; `/sign-in` is a permanent redirect to `/login` [code] (apps/extension/src/features/cloud-bridge/clerkAuth.ts:216-223; apps/web/next.config.ts:155). The page `/auth/chrome-extension` only reports signed-in or signed-out and tells the person to return to the side panel [code] (apps/web/app/auth/chrome-extension/page.tsx). The extension's Clerk client uses `syncHost` (the web origin from `CLERK_SYNC_HOST`) so it mirrors the web session, and requires a token whose `azp` claim equals the extension's own origin [code] (clerkAuth.ts:84-92, 129-135). Cookie changes on the sync host (`__client_uat*`) trigger a re-read, so signing out on the web signs the extension out [code] (clerkAuth.ts `watchSyncHostSession`). Extension sign-out also DELETEs the synced web session by id [code] (clerkAuth.ts:247-280). A dev-only bearer in `chrome.storage.local` exists in development builds [code] (freeTrialClient.ts:371, 409).

### 7. Session length
- Product cap: any session older than `SESSION_ABSOLUTE_LIFETIME_HOURS` is refused and ended. The value is an environment setting; when unset or invalid it defaults to 720 h (30 days), measured from creation, not last use. The provider's own idle expiry also applies and renews on use [code] (apps/web/lib/auth/session-policy.ts:3, 12-19, 35-60; api-auth.ts `assertSessionWithinAbsoluteLifetime`).
- Provider-side idle length is a Clerk dashboard setting, not in the repo [unknown].
- User-selectable idle sign-out: Security settings hold a `session_timeout` value (minutes). A browser-side timer, `useSessionTimeout`, signs the person out after that much inactivity, with a warning 2 minutes before. It is a browser timer only; the server never reads it, and the mobile app does not enforce it [code] (apps/web/shared/hooks/useSessionTimeout.ts; apps/web/features/settings/sections/SecuritySection.tsx). The page 70-qa/start-here/where-things-stand.md records the fixed behaviour as off unless the person picks a limit (15 minutes is one choice; one person stayed signed in for 62 minutes). The checked-in hook I read still falls back to 60 minutes when no value is stored, so the shipped default is [unknown] until that fix lands; confirm against the build you test.
- Device grants: access 7 days, refresh 30 days (above).

### 8. 18-and-over step
`ACCOUNT_MINIMUM_AGE` is 18 [code] (packages/contracts/types/src/account-eligibility.ts:1). The minimum age is 18 everywhere today. The mobile gate has a per-region table (India, Brazil, default) and every entry is 18; the gate floors each threshold at `ACCOUNT_MINIMUM_AGE` [code] (apps/mobile/src/features/auth/services/ageGate.ts:25-26, 50, 69-70). The server stores only an outcome (`eligible` or `ineligible`), the minimum it was judged against and how it was reached; never the age [code] (apps/web/db/neon/0425_adult_eligibility.sql; adult-eligibility.ts). A decision counts only while its minimum is at least the current one. `api:GET /api/eligibility` reads state; `api:POST /api/eligibility` submits evidence (`declared_age`, `age_checked_on_device`, `platform_age_signal`) [code] (apps/web/app/api/eligibility/route.ts). An `ineligible` outcome is final until support reviews it [code] (adult-eligibility.ts comment). Confirmed state is cached 5 minutes per server instance [code] (adult-eligibility.ts:55).

### 9. Linked devices and sign-out everywhere
- Every non-web surface registers with `api:POST /api/devices/heartbeat` (rate limit `device-heartbeat`, CSRF), which upserts `table:device_registrations` keyed by user, surface and install id and links the credential family and identity session id [code] (apps/web/app/api/devices/heartbeat/route.ts). CLI calls it after login [code] (apps/cli/src/auth.rs:1044-1052; device_registry.rs:6).
- `api:GET /api/settings/devices` lists them; `api:DELETE /api/settings/devices/{deviceId}` unlinks one (options `lost` and `logoutAll`), `PATCH` renames, `POST` stops remote work [code] (apps/web/app/api/settings/devices/[deviceId]/route.ts:431-433).
- `api:GET /api/settings/sessions` lists provider sessions and ends any past lifetime; `api:DELETE /api/settings/sessions/{sessionId}` ends one; `api:DELETE /api/settings/sessions` is **sign out everywhere**: CSRF, step-up proof (`session.revoke_all`), revokes every other provider session, then the current one, and revokes every device refresh credential; sends a security notice; on partial failure answers 502 with counts so the caller can retry [code] (apps/web/app/api/settings/sessions/route.ts:189-274).

## Implementation map

| Concern | Where | Basis |
|---|---|---|
| Identity port and Clerk adapter | packages/platform/identity/src (factory.ts, adapters/clerk.ts, adapters/clerk-sessions.ts, types.ts) | [code] |
| Web provider selection | apps/web/lib/server/identity.ts | [code] |
| Routing, CSP, session gate | apps/web/proxy.ts (exports `proxy`; matcher at end) | [code] |
| Bearer and cookie verification, account gates | apps/web/lib/api-auth.ts (`verifyBearerToken` line 323, `getClerkAuthUser` line 427) | [code] |
| Native session admission | apps/web/lib/server/native-session-token.ts | [code] |
| Sign-in UI | apps/web/features/auth (AuthFlow.tsx, IdentityAuthAdapter.tsx, authContract.ts, authRoutes.ts, postAuthDestination.ts, StepUpDialog.tsx) | [code] |
| Client identity hooks | apps/web/lib/identity (client.ts, token.ts, request-authority.ts, useSessionSnapshot.ts) | [code] |
| Post-sign-in gate page | apps/web/app/login/complete/page.tsx, apps/web/app/signup/complete | [code] |
| Desktop shell sign-in | apps/desktop/electron/browserSignIn.ts, signInScreen.ts, main.ts (deep link handling around line 692-745), config.ts | [code] |
| Desktop contract | packages/contracts/local-runtime/src/desktop-sign-in.ts | [code] |
| Desktop web pages and routes | apps/web/app/auth/desktop/*, apps/web/app/api/auth/desktop/{grant,redeem}/route.ts, apps/web/lib/server/desktop-sign-in.ts | [code] |
| Device grant routes | apps/web/app/api/auth/device/{code,approve,token,refresh}/route.ts, grant-policy.ts; page apps/web/app/auth/device/page.tsx | [code] |
| Token issuing and revocation | apps/web/lib/server/developer-token.ts, device-refresh-token.ts, refresh-token-family.ts | [code] |
| Logout | apps/web/app/api/auth/logout/route.ts | [code] |
| Sessions and devices settings | apps/web/app/api/settings/sessions/*, apps/web/app/api/settings/devices/*, apps/web/lib/server/session-revocation.ts | [code] |
| Step-up | apps/web/lib/server/step-up-auth.ts, apps/web/app/api/auth/step-up/route.ts | [code] |
| Age gate | apps/web/lib/server/adult-eligibility.ts, adult-eligibility-gate.ts, require-adult-eligibility.ts, apps/web/app/api/eligibility/route.ts | [code] |
| Session policy | apps/web/lib/auth/session-policy.ts | [code] |
| Idle sign-out timer (browser) | apps/web/shared/hooks/useSessionTimeout.ts, apps/web/features/settings/sections/SecuritySection.tsx | [code] |
| Account status | apps/web/lib/auth/account-status.ts | [code] |
| Mobile | apps/mobile/src/features/auth (components/MobileSignIn.tsx, store.ts, services/*), apps/mobile/src/integrations/clerk.ts, apps/mobile/services/authSession.ts, surfaceProof.ts | [code] |
| CLI | apps/cli/src/auth.rs, oauth.rs, app_server/account.rs, device_registry.rs | [code] |
| CLI `trust/identity.rs` | Workspace identity (git remote key) for trust grants. **Not account identity.** | [code] (apps/cli/src/trust/identity.rs:1-30) |
| VS Code | apps/extension-vscode/src/features/account-auth/deviceAuth.ts, src/utils/api.ts | [code] |
| Chrome | apps/extension/src/features/cloud-bridge/clerkAuth.ts, managedCloudAuthority.ts, freeTrialClient.ts | [code] |
| Shared device client | packages/client/client-runtime/src/deviceAuthorization.ts | [code] |
| Provider list | packages/client/client-runtime/src/authProviders.ts | [code] |

## Data and state

**Database tables (Neon Postgres, append-only migrations).**

| Table | Holds | Source |
|---|---|---|
| table:desktop_sign_in_grants | SHA-256 of one-time code, challenge, expiry, consumed time; never a usable code | [code] (apps/web/db/neon/0334_desktop_sign_in_grants.sql; desktop-sign-in.ts) |
| table:device_authorization_codes | pending, approved, denied, expired, consumed, revoked device codes, user code, device type, approving user | [code] (device/code, approve, token routes) |
| table:device_refresh_tokens | token hash, family id, user, device id and name, workspace id, used, revoked, compromised times | [code] (device/token/route.ts; refresh-token-family.ts) |
| table:device_refresh_token_families | revocation fence per family | [code] (refresh-token-family.ts) |
| table:revoked_jwts | revoked developer-token ids | [code] (developer-token.ts:137) |
| table:device_registrations | one row per user, surface, install: OS, version, capabilities, credential family, identity session, remote-enabled flag | [code] (heartbeat/route.ts; migration 0207) |
| table:profiles | account status, terms version and time, adult eligibility outcome, minimum age and method | [code] (adult-eligibility.ts; 0425 migration) |

**Device stores.**

| Store | App | Holds | Source |
|---|---|---|---|
| store:os-keyring (service `com.agiworkforce.cli.auth`) or owner-only auth file | CLI | device grant, API keys | [code] (auth.rs:92-120, 778) |
| store:vscode-secret-storage | VS Code | account token (`agiWorkforce.accountToken`), refresh token, expiry flags | [code] (utils/api.ts:220-222) |
| store:clerk-secure-token-cache | Mobile | provider session | [code] (_layout.tsx:59, 994) |
| store:mmkv `age-gate:v1` | Mobile | on-device age record (confirmed, minor flag, region, threshold) | [code] (ageGate.ts:49, 70-75) |
| store:mmkv `cloud-cache-owner-id` | Mobile | which account owns cached cloud data | [code] (cloudAccountSession.ts:3) |
| store:electron-partition `persist:agi-cloud` | Desktop | web session cookies of the hosted app window | [code] (electron/config.ts:24) |
| in-memory pending sign-in (verifier, challenge) | Desktop | not persisted; lost on relaunch | [code] (browserSignIn.ts:15) |
| store:chrome-storage-local | Chrome | dev-build bearer only; production uses provider client via `syncHost` | [code] (freeTrialClient.ts:371-409) |

**Lifetimes (all [code]).** Desktop pending attempt 10 min; desktop grant and ticket 60 s; device code 900 s; poll interval 5 s; developer access token 7 days; device refresh token 30 days; product session cap 30 days by default (`SESSION_ABSOLUTE_LIFETIME_HOURS`, 720 h unless the environment sets another value); adult-eligibility cache 5 min.

**Configuration names (no values).** `AGI_IDENTITY_PROVIDER`, `AGI_AUTH_PROVIDERS`, `AGI_AUTH_MFA_EMAIL_FALLBACK`, `SESSION_ABSOLUTE_LIFETIME_HOURS`, `JWT_SECRET` (signs developer tokens), `CLERK_PUBLISHABLE_KEY` and `CLERK_SYNC_HOST` (Chrome build), `AGI_AUTH_BASE` (CLI override of the device-grant base), `AGIWORKFORCE_NO_KEYRING`, `AGIWORKFORCE_JWT` (CLI env credential), `NEXT_PUBLIC_APP_URL`. Per docs/security/security.md:689 `DEVICE_TOKEN_ENCRYPTION_KEY` seals nothing and the real device credential is the hashed pair in `device_refresh_tokens` [requirement] (docs/security/security.md:689-694).

## Rules: access, plans, modes

**Every authenticated API request** passes, in order: token verification (developer token, then identity-provider token with authorized-party check, then native token plus surface proof), absolute session lifetime, account status (`active` only; `locked`, `recovery_pending`, `suspended`, `banned`, `deletion_scheduled`, `deleted` are refused; fail-closed after one retry), account security (passkey or step-up where required), MFA policy for workspaces, and IP allow-list [code] (apps/web/lib/api-auth.ts:452-480; account-status.ts:1-10; docs/security/security.md:345 [requirement]).

**Token-class restrictions.**
- A surface token used as a Bearer is refused (`surface_token_as_bearer`) [code] (api-auth.ts:365-368).
- A developer-token session may not approve a device or grant a desktop sign-in; it needs an interactive session [code] (approve/route.ts:45; desktop/grant/route.ts).
- API keys work only on endpoints that declare an API-key scope [code] (api-auth.ts:437-447).

**Terms.** Device approval, device token and refresh each re-check Terms acceptance; a poller keeps its approved code and waits while the person accepts on the web [code] (token/route.ts:155-170).

**18-and-over enforcement points (server).** Enforced: `/login/complete`, device approve, device token and refresh, product page layouts (chat, tasks, code, workspace, quick-ask, admin, welcome), the LLM chat-completions gate, embeddings, audio transcription, speech, live voice sessions, image and video generation, and mobile intents [code] (grep of `adult-eligibility` and `requireAdultEligibility` across apps/web/app and apps/web/lib). Not enforced on every API route: settings, billing, export and deletion deliberately stay reachable [code] (require-adult-eligibility.ts comment). An unreadable decision refuses, never admits (503) [code] (adult-eligibility-gate.ts).

**Modes and plans.**

| Mode | Account needed to sign in? | Basis |
|---|---|---|
| mode:local (mobile) | No account. The device asks for age first (18 everywhere; the per-region table holds 18 for every entry) before any screen; sign-in appears only when the person chooses Cloud | [code] (apps/mobile/src/features/auth/services/rootRouting.ts:38-60; ageGate.ts:25-26, 50, 69-70) |
| mode:local (CLI, VS Code) | No account; local models and BYOK work without `agi login` | [code] (apps/cli/src/auth.rs:1013, "Run `agi login` for your AGI account, or `agi login <provider>` to use your own API key") |
| mode:own-key (CLI, VS Code) | Provider API key saved in keyring or SecretStorage; no AGI sign-in required | [code] (auth.rs API_KEY_PROVIDERS; extension-vscode utils/api.ts:228-237) |
| mode:cloud (all) | AGI account, adult-eligibility confirmed, Terms accepted; plan rules then apply elsewhere | [code] (device/approve, token routes; llm auth-gate.ts:282) |

Entitlement and quota decisions are not made by the sign-in code. Device scope `managed-cloud:use` says only "subject to plan and workspace permissions" [code] (device/code/route.ts:41-46). See SYS-chat-turn-pipeline for how a turn is gated after identity.

**Trust boundary.** Signing in must not silently move a Local chat to Cloud or BYOK [requirement] (AGENTS.md section 6). On mobile, sign-in and session refresh run through the provider SDK and reach the provider hosts in either mode; only the listed account controls pass the egress guard in Local [requirement] (docs/architecture/trust-boundaries.md:47).

## Differences between apps

| Surface | Sign-in method | Where credential lives | Sign out | Account needed for local use |
|---|---|---|---|---|
| surface:web | `/login`, `/signup`: email, code, password, passkey, provider buttons, enterprise SSO | Provider session cookie | Provider sign-out; settings page can end other sessions or all | No Local mode on web. A flag-gated guest Cloud chat exists (apps/web/lib/guest-chat/guest-chat-access.ts); everything else needs sign-in [code] (proxy.ts:324-330) |
| surface:desktop (Electron, public) | System browser, challenge and code hand-off, then ticket in the window | `persist:agi-cloud` partition | Page reports signed-out account; shell switches window to sign-in screen | The window shows the hosted app; signed-out window shows the sign-in screen [code] (main.ts followSignedInState ~766-780). Local-folder features need no AGI account [inferred; not opened] |
| surface:desktop (Tauri, retained internal) | Device-code flow (`desktopNativeSignIn.ts`) | Native store | [unknown] | [unknown] |
| surface:mobile | Native screens with Clerk hooks; Apple, Google and others; age check on account | Secure token cache; surface proof per request | `signOut` ends this session or hands over to another saved account; `signOutAllAccounts` ends every session on this device only | None for Local; age gate first [code] |
| surface:cli | Device code in terminal (`agi login`) | OS keyring or owner-only file | `agi logout`: revokes the device session on the server and forgets caches | None for local models or BYOK |
| surface:vscode | Device code via `vscode.env.openExternal`; remote windows open the browser on the local machine | `SecretStorage` | `signOutOfAgiCloud` calls logout | None for local or BYOK |
| surface:chrome | Reuses web session through Clerk `syncHost`; tab to `/login` | Provider client in the extension background; origin-bound token | Clears client and DELETEs synced web session | [unknown] whether a signed-out extension runs any model; `freeTrialClient.ts` suggests a hosted free trial needs a token |

**Notable asymmetries.** Mobile "sign out of all accounts" ends sessions on this phone, not on every device; the account-wide action is in Settings, Account security (`DELETE /api/settings/sessions`) [code] (store.ts:277-281; mobile account-security/service.ts:171-186). CLI and VS Code never hold a provider session cookie; they hold a signed developer token the server can revoke by family. Chrome and Mobile tokens are provider tokens, so revocation is by provider session id.

## Failure handling

| Situation | Behaviour | Source |
|---|---|---|
| Authorized-party allowlist unresolvable | Proxy answers 503 for session routes | [code] proxy.ts:217-224, 340 |
| Desktop link used twice, after relaunch, after cancel, or from a different attempt | Shell reports `expired`; window shows expired notice; person restarts | [code] browserSignIn.ts `readBrowserSignInLink` |
| Desktop redeem fails (code expired or used) | 404 "expired or already used"; complete page offers "Continue in your browser" and "Sign in here instead" | [code] redeem/route.ts; DesktopSignInComplete.tsx |
| Browser cannot open from desktop shell | Screen state `unopened` | [code] signInScreen.ts |
| Device code unknown, expired, already processed | 404 or 409 with a message to restart | [code] device/code route GET, approve |
| Device poll too fast | `slow_down` with new interval; CLI adds 5 s | [code] token/route.ts:51-70; oauth.rs |
| Device approval while Terms outdated | 403 with `acceptanceUrl`; poll returns `terms_acceptance_required` and keeps the code approved | [code] approve, token routes |
| Account suspended between approval and poll | `account_unavailable` with recovery URL; no token issued | [code] token/route.ts:110-130 |
| Refresh token replayed | Family marked compromised and revoked; owner notified | [code] refresh/route.ts, refresh-token-family.ts |
| Revocation lookup fails | Developer-token requests are denied with 503, not allowed | [code] api-auth.ts:330-340 |
| Sign-out everywhere partly fails | 502 with counts; current session kept; retry finishes | [code] settings/sessions/route.ts:216-236 |
| Stale client session reaches `/login/complete` | Recovery screen; one automatic retry marker `authRetry=1`; no redirect loop | [code] login/complete/page.tsx:52-62 |
| Age decision unreadable | 503 `age_eligibility_unavailable`; no admission | [code] adult-eligibility-gate.ts |
| Secure storage unavailable (mobile) | Dedicated screen | [code] apps/mobile/src/features/auth/components/SecureStorageUnavailable.tsx (file exists) |
| OS keyring locked (CLI) | Message explains unlock or `AGIWORKFORCE_NO_KEYRING=1` | [code] auth.rs:175 |
| Region blocked | 451 JSON for API, rewritten page for browsers, before identity runs | [code] proxy.ts:240-262 |

## How it should work

Everything here is [proposed] unless a requirement is cited.

- [requirement] Local, BYOK and Managed Cloud stay separate trust boundaries; sign-in never reroutes Local work (AGENTS.md section 6).
- [requirement] Local inference on mobile and desktop must not need a paid plan. Whether it needs an account is open; today mobile Local needs none (see Rules).
- [proposed] State the provider-side session idle length in code or a doc owned by `docs/security/security.md`, so engineers need not open the provider dashboard.
- [proposed] Give the Chrome extension a stated signed-out behaviour in one place.
- [proposed] Make Mobile "sign out all accounts" wording say it affects this device only, and link to account-wide sign-out.
- [proposed] Apply the 18-and-over gate through one shared function at the API layer rather than per route, so a new route cannot forget it.

## Gaps

Implementation status (is the code connected) and verification status (has anyone run it) are separate. No document in the repository records a real run for any flow on this page, so nothing here is [executed].

| Gap | Status | Basis |
|---|---|---|
| All flows above are present in code and wired (routes, pages, shell handlers) | Implemented | [code] |
| Any of them driven end to end in a live run | Not established | [unknown] |
| Age gate not on every API route; only listed routes call it | Partial by design; new routes can miss it | [code] (list above) |
| `docs`: migration 0425 header says "NOT YET APPLIED" | Header stale or production not applied | [unknown]; see outdated_documents |
| Desktop Tauri sign-out and Chrome signed-out behaviour | Not read | [unknown] |
| `terms/accept` treats a native-surface acceptance with no evidence as `confirmed` age | Possible hole: native clients can skip the evidence step | [code] (apps/web/app/api/terms/accept/route.ts:59-67); intent [unknown] |
| Provider session length lives outside the repo | Unverifiable here | [unknown] |
| Idle sign-out default: checked-in hook falls back to 60 minutes, QA page records off-by-default as the fix | Which default ships is not established | [code] (useSessionTimeout.ts:10); 70-qa/start-here/where-things-stand.md |
| Electron `safeStorage` claim in docs/architecture/desktop.md:171 | No `safeStorage` use found in apps/desktop/electron/*.ts | [unknown] |

## How to verify

Nothing was run for this page. These are the existing checks to run, [proposed] as a procedure.

**Tests that exist (names seen, not run).**
- test:apps/desktop/electron/__tests__/browserSignIn.test.ts and signInScreen.test.ts
- test:apps/web/app/auth/desktop/complete/DesktopSignInComplete.test.tsx
- test:apps/web/app/api/auth/device/__tests__/session-revocation.test.ts and refresh-carries-device-link.test.ts
- test:apps/web/app/api/auth/logout/route.test.ts
- test:apps/web/lib/server/adult-eligibility-gate.test.ts, adult-eligibility.test.ts, require-adult-eligibility.test.ts
- test:apps/web/features/auth/__tests__/ (AuthFlow, IdentityAuthAdapter, StepUpDialog, postAuthDestination, useSignupAgeGate)
- test:apps/web/lib/identity/__tests__/useSignOut.push.test.tsx and request-authority.test.ts
- test:apps/mobile/__tests__/AccountSecurityScreen.test.tsx and SecurityMutationAccountEpoch.test.ts
- AGENTS.md section 6 names per-surface `trust-boundary.test.ts` and guards `check:trust-boundaries`, `check:rls-boundary`.

**Human checks.**
1. Web: sign up as under 18, expect refusal before any provider call; sign up as adult, expect `/login/complete` checks then a new chat.
2. Desktop: start sign-in, cancel, click an old link; expect "expired". Complete once; reuse the link; expect "expired".
3. CLI: `agi login`, approve, check keyring entry and a row in `device_registrations`; run `agi logout`; check the refresh token no longer works.
4. Settings, sign out everywhere: confirm step-up prompt, all sessions and device credentials end.
5. Mobile Local: confirm no sign-in prompt appears before choosing Cloud.

See AGENTS.md section 12 for the command inventory (`docs/agent-context/commands.json`); web tests run through the package script, not the root Vitest.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| The identity provider is Clerk by default, selected through a port; `AGI_IDENTITY_PROVIDER` can name another provider but only `clerk` is implemented. | read in the code | `packages/platform/identity/src/factory.ts:9-45` |
| Web proxy returns 503 for session routes if the authorized-party allowlist cannot be resolved, instead of authenticating without the origin check. | read in the code | `apps/web/proxy.ts:192-224`; `apps/web/proxy.ts:340` |
| A signed-out visitor to a protected product route is redirected to /login with redirectTo, but /chat is exempt from the cookie check. Guest Cloud chat on /chat exists only while the guest.chat feature flag is on; web has no Local mode. | read in the code | `apps/web/proxy.ts:324-330`; `apps/web/lib/guest-chat/guest-chat-access.ts`; `apps/web/lib/guest-chat/config.ts:3` |
| Desktop sign-in uses a PKCE-like hand-off: the shell keeps a random verifier in memory, sends its SHA-256 challenge to the browser, and redeems a one-time code with the verifier. | read in the code | `apps/desktop/electron/browserSignIn.ts:39-41`; `apps/web/lib/server/desktop-sign-in.ts:33-65` |
| The desktop pending attempt lives 10 minutes; the server grant and the sign-in ticket live 60 seconds; the grant is stored only as a hash. | read in the code | `apps/desktop/electron/browserSignIn.ts:13`; `apps/web/lib/server/desktop-sign-in.ts:7` |
| The desktop deep link scheme is agiworkforce-cloud and the host is sign-in. | read in the code | `packages/contracts/local-runtime/src/host-bridge.ts:4`; `packages/contracts/local-runtime/src/desktop-sign-in.ts` |
| Redeem is accepted only in a desktop host that reports browser sign-in support, so a grant opened in an ordinary browser fails. | read in the code | `apps/web/app/auth/desktop/complete/DesktopSignInComplete.tsx:73` |
| CLI, VS Code and (in the Tauri build) desktop link through an RFC 8628 device grant: code issued with 900 s life and 5 s poll interval, approved on /auth/device, exchanged at /api/auth/device/token. | read in the code | `apps/web/app/api/auth/device/grant-policy.ts:6-7`; `apps/web/app/api/auth/device/code/route.ts:24-31`; `apps/web/app/api/auth/device/token/route.ts` |
| Device access tokens are web-signed JWTs valid 7 days; refresh tokens are 32 random bytes stored as SHA-256 hashes and valid 30 days, rotated on use. | read in the code | `apps/web/lib/server/developer-token.ts:11`; `apps/web/lib/server/device-refresh-token.ts:5-22`; `apps/web/app/api/auth/device/refresh/route.ts` |
| A replayed refresh token marks its whole family compromised and revokes it. | read in the code | `apps/web/app/api/auth/device/refresh/route.ts`; `apps/web/lib/server/refresh-token-family.ts:191` |
| Device approval is refused for developer-token callers, when the account has device sign-in switched off, when Terms need acceptance, or when no current 18-and-over decision exists. | read in the code | `apps/web/app/api/auth/device/approve/route.ts:45`; `apps/web/app/api/auth/device/approve/route.ts:134-190` |
| Mobile Cloud calls send the Clerk session token as Bearer plus a Clerk-template surface proof in a separate header; the server admits a native token only with a matching proof. | read in the code | `apps/mobile/services/authSession.ts:17-26`; `apps/web/lib/server/native-session-token.ts` |
| Mobile root routing requires a device-level age gate before any screen, then lets signed-out users stay in the app; sign-in screens open only on request or when a ended session is owed. | read in the code | `apps/mobile/src/features/auth/services/rootRouting.ts:38-60` |
| The Chrome extension reuses the web session through Clerk syncHost, requires a token whose azp equals the extension origin, and opens /sign-in which redirects to /login. | read in the code | `apps/extension/src/features/cloud-bridge/clerkAuth.ts:84-92`; `apps/extension/src/features/cloud-bridge/clerkAuth.ts:216-223`; `apps/web/next.config.ts:155` |
| The minimum account age is 18 on every surface and in every region. The mobile gate has a per-region table (India, Brazil, default) in which every entry is 18, and it floors each threshold at ACCOUNT_MINIMUM_AGE. The server stores only outcome, minimum age, method and time, never the age. | read in the code | `packages/contracts/types/src/account-eligibility.ts:1`; `apps/mobile/src/features/auth/services/ageGate.ts:25-26`; `apps/mobile/src/features/auth/services/ageGate.ts:50`; `apps/mobile/src/features/auth/services/ageGate.ts:69-70`; `apps/web/db/neon/0425_adult_eligibility.sql` |
| An age decision made under a lower minimum no longer counts and the person is asked again; an ineligible outcome stands. | read in the code | `apps/web/lib/server/adult-eligibility.ts:25-41` |
| Server-side 18-and-over enforcement covers login-complete, device grant, product page layouts, LLM chat, embeddings, transcription, speech, live voice, image and video generation and mobile intents, not every API route. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:282`; `apps/web/lib/server/require-adult-eligibility.ts`; `apps/web/app/api/media/image/generate/route.ts` |
| Sign out everywhere is DELETE /api/settings/sessions: it needs CSRF and a step-up proof, ends all other provider sessions, then the current one, and revokes every device refresh credential. | read in the code | `apps/web/app/api/settings/sessions/route.ts:189-274` |
| Product session cap is measured from session creation, on top of the provider's idle expiry. SESSION_ABSOLUTE_LIFETIME_HOURS is an environment setting that defaults to 720 hours (30 days) when unset or invalid. | read in the code | `apps/web/lib/auth/session-policy.ts:3`; `apps/web/lib/auth/session-policy.ts:12-19` |
| A user-selectable idle sign-out (session_timeout in Security settings) is a browser-side timer in useSessionTimeout that the server never reads and mobile does not enforce. The checked-in hook falls back to 60 minutes when no value is stored; 70-qa/start-here/where-things-stand.md records the fixed behaviour as off unless the person picks a limit, so the shipped default is not established. | read in the code | `apps/web/shared/hooks/useSessionTimeout.ts:10`; `apps/web/shared/hooks/useSessionTimeout.ts:93`; `apps/web/features/settings/sections/SecuritySection.tsx:192`; `70-qa/start-here/where-things-stand.md:43` (not found) |
| The provider-side session length is not in the repository. | unknown | `apps/web/lib/auth/session-policy.ts comment says the provider's expiry renews on use` |
| Linked devices are rows in device_registrations created by POST /api/devices/heartbeat and managed through /api/settings/devices. | read in the code | `apps/web/app/api/devices/heartbeat/route.ts:20-45`; `apps/web/app/api/settings/devices/[deviceId]/route.ts:431-433` |
| CLI credentials sit in the OS keyring (service com.agiworkforce.cli.auth) or an owner-only file when AGIWORKFORCE_NO_KEYRING=1; VS Code uses SecretStorage. | read in the code | `apps/cli/src/auth.rs:92`; `apps/cli/src/auth.rs:778`; `apps/extension-vscode/src/utils/api.ts:220` |
| apps/cli/src/trust/identity.rs is workspace identity for trust grants (git remote key), not account sign-in. | read in the code | `apps/cli/src/trust/identity.rs:1-30` |
| CLI logout posts to /api/auth/logout, which revokes the token id and the whole session family, or the family named by a refresh token. | read in the code | `apps/cli/src/oauth.rs:451-485`; `apps/web/app/api/auth/logout/route.ts:25-80` |
| Enabled web sign-in providers come from AGI_AUTH_PROVIDERS among google, github, microsoft, apple; default google and github. | read in the code | `packages/client/client-runtime/src/authProviders.ts:1-30`; `apps/web/features/auth/authProviderConfig.ts` |
| Sign-in, device approval and token issue do not check a plan; plan gating happens after identity. | inferred | `apps/web/app/api/auth/device/approve/route.ts`; `apps/web/app/api/auth/device/token/route.ts` |
| No document in the repository was found recording a real run of these sign-in flows. | unknown | `not established` (not found) |

## Open questions

- none listed
