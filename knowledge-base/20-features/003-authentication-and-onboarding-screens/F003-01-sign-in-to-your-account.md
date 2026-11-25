---
id: "F003-01"
type: "feature"
title: "Sign in to your account"
aliases: ["Log in or sign up", "Sign in", "Log in", "Continue in your browser", "Continue in browser", "Device sign-in", "agi login", "Code: Sign In to AGI Cloud", "Sign in to Cloud", "S3.01", "S3.18", "Conflicting-account resolution"]
area: "3 Authentication and onboarding screens"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S3.01", "S3.18"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-security-and-privacy", "SYS-execution-boundaries", "F003-02", "F003-04", "F003-05", "F003-06", "table:desktop_sign_in_grants", "table:device_authorization_codes", "table:profiles", "api:POST /api/auth/desktop/grant", "api:POST /api/auth/desktop/redeem", "api:POST /api/auth/device/code", "api:POST /api/auth/device/token", "file:apps/web/features/auth/IdentityAuthAdapter.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-01 Sign in to your account

Lets a person sign in to their AGI account on Web, Desktop, Mobile, CLI, VS Code and Chrome. Web uses one email-first screen; Desktop, CLI, VS Code and Chrome hand off to the web through a browser; Mobile has its own native screen. A session starts only after the account is allowed and Terms are current.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.01](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s301), [S3.18](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s318).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Authenticates a person to their AGI account and returns a session to the app they started from. On Web the email-first screen at /login and /signup decides sign-in or sign-up from the email typed (apps/web/features/auth/IdentityAuthAdapter.tsx:471-495). Other apps hand the work to the web or, on Mobile, run a native flow (apps/mobile/src/features/auth/components/MobileSignIn.tsx:253-276).

**Why it exists.** Cloud features, sync, limits and account settings need to know who the person is. Local use on Mobile does not need an account (doc: docs/product/requirements.md:481; apps/mobile/app/(auth)/login.tsx:277), so sign-in is for Cloud and account features only [inferred].

**Who uses it.** Anyone with an AGI account or about to create one, on any of the six apps. Reviewers and testers also use it to reach signed-in states.

**Problems it solves**

- One account works on all six apps through one identity service (SYS-authentication-and-identity).
- A terminal, editor or browser extension has no password field of its own, so a browser approval hands the session back (apps/cli/src/oauth.rs:71-103).
- A suspended, locked or deleted account is told why instead of meeting a product that answers 403 on every call (apps/web/app/login/complete/page.tsx:67-79).
- A stale browser session no longer loops between /login and /login/complete (apps/web/app/login/complete/page.tsx:55-65; apps/web/app/login/complete/StaleSessionRecovery.tsx:11-14).

**Use cases**

- A returning user opens agiworkforce.com/login, types an email, enters the password and lands in a new chat.
- A developer runs agi login in a terminal, approves the code in the browser, and the CLI stores the session.
- A Desktop user presses Continue in browser, finishes sign-in in the system browser and the Desktop window signs in by itself.
- A Mobile user taps Log in or sign up, types an email, enters an emailed code and returns to the app.

## 2. User experience

**Where to find it**

- Web: /login and /signup render the same screen headed Log in or sign up (apps/web/app/login/page.tsx:1-11; apps/web/app/signup/page.tsx:1-11; apps/web/features/auth/AuthEmailStep.tsx:94). Old paths /sign-in, /sign-up and /register redirect there (apps/web/next.config.ts:153-155).
- Desktop: the signed-out window shows a shell-drawn screen titled with the Desktop product name, line Sign in to <brand>, button Continue in browser (apps/desktop/electron/signInScreen.ts:55-63). The web pages Desktop navigates to for sign-in are replaced by that screen (apps/desktop/electron/windowPolicy.ts:102-103).
- Mobile: Cloud sign-in screen headed AGI Cloud, inner heading Log in or sign up, reached from the Cloud entry; a close button returns to Local Mode (apps/mobile/app/(auth)/login.tsx:326; apps/mobile/src/features/auth/components/MobileSignIn.tsx:452-453).
- CLI: command agi login (apps/cli/src/lib.rs:988-992, 7269-7272).
- VS Code: command palette entry Code: Sign In to AGI Cloud (apps/extension-vscode/package.json:157-158; apps/extension-vscode/src/core/commandSetup.ts:1221).
- Chrome: the side panel opens a new tab on the web sign-in page with a return to /auth/chrome-extension (apps/extension/src/features/cloud-bridge/clerkAuth.ts:215-223); that page offers Sign in to Cloud (apps/web/app/auth/chrome-extension/page.tsx:50-55).

**Before you start**

- Web, Desktop, CLI, VS Code, Chrome: network access to the AGI web service.
- Desktop: a default system browser that can be opened (apps/desktop/electron/browserSignIn.ts:46-50).
- Chrome: the build must carry the identity publishable key and sync host settings, otherwise the extension throws that sign-in is not configured (apps/extension/src/features/cloud-bridge/clerkAuth.ts:61-70).
- Mobile: the auth feature flag is on (apps/mobile/lib/v1FeatureFlags.ts:8; apps/mobile/app/(auth)/login.tsx:161); a live identity key is required in preview and production builds (apps/mobile/src/integrations/clerk.ts:7-14).
- An account whose status is not locked, recovery pending, suspended, banned or deleted (apps/web/lib/auth/account-status.ts:72-106).

**Screens and controls**

- Web email step: provider buttons Continue with Google and Continue with GitHub by default, optional passkey button Sign in with a passkey or security key, field Email address, button Continue, small text Last used on the last method, Try again after a retryable failure (apps/web/features/auth/AuthEmailStep.tsx:98-185; apps/web/features/auth/authProviderConfig.ts:7-17).
- Web next steps: Enter your password with Forgot password? and Can't reach this email? (apps/web/features/auth/AuthPasswordStep.tsx:53-111); Check your inbox code step with Resend code (apps/web/features/auth/AuthCodeStep.tsx:32-35, 195-197); second-factor step; notice step for rate-limit and similar states (apps/web/features/auth/AuthFlow.tsx:250-258).
- Web completion: Finish signing in page with Terms review and Continue, or Continue if current Terms are already accepted (apps/web/app/login/complete/page.tsx:107-146).
- Desktop screen buttons: Continue in browser; while waiting Open browser again and Cancel; after expiry or a failed open Try again (apps/desktop/electron/signInScreen.ts:58-84). The web component used inside Desktop also has Continue in your browser and Cancel sign-in (apps/web/features/desktop-host/components/DesktopBrowserSignIn.tsx:29-33, 100).
- Browser page for Desktop: Return to Desktop with an Open <Desktop name> button (apps/web/app/auth/desktop/DesktopSignInHandoff.tsx:19-22).
- Mobile: provider buttons (Apple on iOS only when the build includes it), Email field, Continue, Use an email code instead, Use a different email, Create an account instead, More sign-in options or Forgot password or try another way, Appeal this suspension (apps/mobile/src/features/auth/components/MobileSignIn.tsx:67-71, 700-780).
- CLI: prints a link and a code, and Waiting for authorization (apps/cli/src/oauth.rs:491-517).
- VS Code: a notification Signing in to AGI Cloud with Approve code <code> and a Cancel control (apps/extension-vscode/src/features/account-auth/deviceAuth.ts:218-228).
- Browser device page: Connect a device with the code, signed-in account, Approve device (packages/ui/i18n/locales/en/auth.json:61-77).

**Journey**

1. Web: open /login. Type the email and press Continue. The page tries to sign in with that email (apps/web/features/auth/IdentityAuthAdapter.tsx:466-469).
2. If the account has a password the Enter your password step appears; if it has only an emailed code a code step appears saying the account does not use a password; if an enterprise connection covers the address the page goes to the organization sign-in (IdentityAuthAdapter.tsx:393-402; apps/web/features/auth/AuthCodeStep.tsx:54-60).
3. If a second factor is needed the second-factor step appears (IdentityAuthAdapter.tsx:376-391).
4. The session is finished and the browser goes to /login/complete (IdentityAuthAdapter.tsx:308-315).
5. That page checks the account status, email confirmation, age confirmation and Terms in order, then continues to the destination or the new chat (apps/web/app/login/complete/page.tsx:69-146).
6. Desktop: choose Continue in browser. The shell opens /auth/desktop in the system browser with a challenge. The person signs in there. The page asks the server for a one-time code and opens the Desktop deep link. Desktop loads the completion page, trades the code for a ticket and signs in (apps/desktop/electron/browserSignIn.ts:36-54; apps/web/app/auth/desktop/DesktopSignInHandoff.tsx:61-84; apps/web/app/auth/desktop/complete/DesktopSignInComplete.tsx:54-81).
7. CLI and VS Code: the app asks the server for a device code, shows the code and opens the approval page, polls every few seconds until the person approves, then stores the access and refresh tokens (apps/cli/src/oauth.rs:491-540; apps/extension-vscode/src/features/account-auth/deviceAuth.ts:235-247).
8. Chrome: click sign-in in the side panel, finish web sign-in in the new tab, see Signed in to AGI Cloud, return to the side panel (apps/web/app/auth/chrome-extension/page.tsx:27-45).
9. Mobile: type email, Continue; the app creates a sign-in attempt, then shows password entry, an emailed code step, an organization sign-in or provider sign-in; on success the app checks Terms and age before opening Cloud (MobileSignIn.tsx:192-215, 253-276; apps/mobile/app/(auth)/login.tsx:161-300).

**What the person sees and gets**

- Busy states with status text from phases such as checking_account, sending_code, verifying, redirecting, browser (apps/web/features/auth/authContract.ts:19-29).
- Field errors under the email, password or code field, and an alert line for other errors (apps/web/features/auth/AuthEmailStep.tsx:155-159; apps/web/features/auth/AuthFlow.tsx:115-120).
- Notice step with a Try again in <n>s countdown for rate limits and similar (apps/web/features/auth/AuthNoticeStep.tsx:57).
- Account denial pages: locked, recovery pending, suspended with an appeal action, deleted (apps/web/lib/auth/account-status.ts:36-41).
- Mobile error strings come from the shared error kinds and a suspension message with an Appeal this suspension button (apps/mobile/src/features/auth/components/authErrorMessage.ts:10-52).
- CLI messages: Authenticated with AGI, or a retry line ending Run agi login to try again (apps/cli/src/oauth.rs:530-534, 583-585).
- VS Code toasts: Signed in to AGI Cloud, was denied, expired, timed out (apps/extension-vscode/src/features/account-auth/deviceAuth.ts:243-262).

**Settings**

- Web env AGI_AUTH_PROVIDERS chooses provider buttons and enables the passkey button when it contains the word passkey; default is Google and GitHub (apps/web/features/auth/authProviderConfig.ts:7-17; packages/client/client-runtime/src/authProviders.ts:17, 40-46).
- Web env AGI_AUTH_MFA_EMAIL_FALLBACK=1 allows an emailed code as a second factor (apps/web/features/auth/authProviderConfig.ts:8-20).
- Mobile env EXPO_PUBLIC_AGI_AUTH_PROVIDERS and EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY (MobileSignIn.tsx:68; apps/mobile/src/integrations/clerk.ts:5-6).
- Chrome build settings CLERK_PUBLISHABLE_KEY and CLERK_SYNC_HOST (apps/extension/src/features/cloud-bridge/clerkAuth.ts:9-10).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: one email-first screen for sign-in and sign-up, password, emailed code, passkey button, social providers, enterprise connection routing and second factor (apps/web/features/auth/AuthFlow.tsx:260-359; IdentityAuthAdapter.tsx:366-415).
- Web: an existing browser session sends the person to the completion page instead of failing, both on page load and on the provider error session_exists (apps/web/app/login/AuthEntryScreen.tsx:38-40; IdentityAuthAdapter.tsx:194-197).
- Web: classified errors, notices with retry wait, retry button for transient kinds (packages/client/client-runtime/src/authErrorTaxonomy.ts:178-229; AuthFlow.tsx:248; AuthEmailStep.tsx:173-184).
- Web: completion page checks account status, email confirmation, age eligibility and Terms before handing over (apps/web/app/login/complete/page.tsx:69-146).
- Desktop: browser handoff with a one-time proof key. The shell makes a random verifier and sends only its hash; the server issues a 60-second one-time code bound to that hash; redeeming needs the verifier and returns a short-lived sign-in ticket (apps/desktop/electron/browserSignIn.ts:36-54; apps/web/lib/server/desktop-sign-in.ts:7, 33-69; apps/web/app/api/auth/desktop/grant/route.ts:19-51; apps/web/app/api/auth/desktop/redeem/route.ts:23-54).
- Desktop: the pending attempt expires after 10 minutes and a stale or foreign link is shown as expired (browserSignIn.ts:13, 71-85; apps/desktop/electron/main.ts:698-712).
- CLI: device-code flow with polling, slow-down handling, terms-required prompt, account-unavailable refusal, denied and expired outcomes (apps/cli/src/oauth.rs:71-103, 491-585; apps/web/app/api/auth/device/token/route.ts:80-210).
- VS Code: shared sign-in through the CLI when available, otherwise its own device-code flow with SecretStorage (apps/extension-vscode/src/features/surfaces/accountAccess.ts:27-45; deviceAuth.ts:176-264).
- Chrome: opens the web sign-in page; session is shared through the identity sync host (apps/extension/src/features/cloud-bridge/clerkAuth.ts:61-70, 215-223).
- Mobile: native email, password, emailed code, organization sign-in, provider sign-in and Apple native sign-in; a no-account result is turned into a sign-up offer (MobileSignIn.tsx:192-362, 253-276, 760-770).

**Incomplete**

- Mobile: second-factor sign-in is not finished; the brief lists an owner step to enable Authenticator and Backup codes in the identity dashboard and a live check (doc: knowledge-base/data/area-briefs/003-authentication-and-onboarding-screens.md S3.14). The mobile code hands any non-email second factor to the vendor screen (MobileSignIn.tsx:217-231).
- Web: the person is not told that no account exists; the page silently switches to sign-up (IdentityAuthAdapter.tsx:471-495; apps/web/e2e/auth-flow-states.spec.ts:271 title). The error copy No account uses this email with action Create an account exists (apps/web/lib/auth/error-taxonomy.copy.ts:59-63) but this path does not reach it for a normal typed email.
- Chrome: Terms acceptance is marked partial in the brief (doc: knowledge-base/data/area-briefs/003-authentication-and-onboarding-screens.md S3.19).

**Present but disconnected or switched off**

- Providers other than Google and GitHub appear on Web only when AGI_AUTH_PROVIDERS names them (packages/client/client-runtime/src/authProviders.ts:17-34).
- The passkey button appears only when AGI_AUTH_PROVIDERS contains passkey and the browser supports passkeys (apps/web/features/auth/authProviderConfig.ts:15-17; AuthEmailStep.tsx:82).
- Mobile on iOS shows no provider buttons unless the build includes the Apple sign-in plugin (apps/mobile/src/features/auth/services/loginProviders.ts:16-22).
- The web sign-in screen is not shown inside the Electron window; the shell screen replaces it (apps/desktop/electron/windowPolicy.ts:102-103; apps/desktop/electron/signInScreen.ts:6-16).

**Not available**

- Magic-link sign-in on every app (see F003-03).
- Passkey sign-in on Mobile: no passkey sign-in code in the mobile sign-in component (apps/mobile/src/features/auth/components/MobileSignIn.tsx); passkey code exists only in settings (apps/mobile/src/features/settings/account-security/PasskeysSection.tsx).
- Sign-up directly in the CLI, VS Code or Chrome apps; the browser page does it (apps/cli/src/oauth.rs:106-111; apps/web/app/auth/chrome-extension/page.tsx:51-58).

## 4. Required behaviour

**Established requirements**

- The surface offers a sign-in entry that authenticates the user to their AGI account, in app or by a browser or device handoff that returns a session. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S3.01)
- When sign-up or provider sign-in hits an existing account, or sign-in hits none, the user is told and offered the right path (sign in instead, or create). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S3.18)
- The user is not forced to sign in for Local mode; Cloud sign-in entry is visible from the Cloud toggle or model picker; failed sign-in gives a helpful error. (source: doc: docs/product/requirements.md:481, 865, 870-880)
- Free managed Cloud is available after sign-in. (source: doc: docs/product/definition.md:46)

**Acceptance criteria**

1. On /login typing an email with a password account and the right password ends on the new chat after the completion page.
2. On /login a suspended, locked or deleted account sees the matching notice and no product page.
3. An already-signed-in browser opening /login is sent to /login/complete.
4. A wrong password shows an error against the password field; a rate-limit shows a Try again in <n>s notice.
5. Desktop Continue in browser opens the system browser; approving there signs Desktop in without typing anything in Desktop; Cancel stops the wait.
6. agi login prints a link and a code; approving in the browser stores a session; a denied or expired code exits with a message ending Run agi login to try again.
7. On Mobile an unknown email offers Create an account instead (or goes to the sign-up screen); an existing email in sign-up offers Log in instead.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web should say clearly when a new account is being created from a typed address, to meet S3.18; today it proceeds without a message [inferred from IdentityAuthAdapter.tsx:479-486 and the Should line].
- Sign-in must never be required for Local mode on Mobile or Desktop [inferred from docs/product/requirements.md:481 and the product rule that local inference is free of subscription].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a short line on the web password or code step saying whether the address is new, and log the choice for support.
- [proposed] Make the account-status lookup failure at the completion page fail closed with a retry rather than allow (apps/web/lib/auth/account-lifecycle.ts:40-48).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | AuthEntryScreen | `apps/web/app/login/AuthEntryScreen.tsx` | Shared entry for /login and /signup; redirects a verified session to completion; wires providers and redirects. |
| component | AuthFlow | `apps/web/features/auth/AuthFlow.tsx` | Step state machine: email, password, code, second factor, new password, notice. |
| hook | useIdentityAuthClient | `apps/web/features/auth/IdentityAuthAdapter.tsx` | Calls the identity service; decides sign-in or sign-up, factors, errors, enterprise routing. |
| component | AuthEmailStep | `apps/web/features/auth/AuthEmailStep.tsx` | Email field, provider and passkey buttons, retry. |
| config | authRoutes | `apps/web/features/auth/authRoutes.ts` | Path constants and builders for login, sign-up, completion and callback URLs. |
| screen | LoginCompletePage | `apps/web/app/login/complete/page.tsx` | Server page: stale session recovery, account access, email, age, Terms. |
| service | account-lifecycle and account-status | `apps/web/lib/auth/account-lifecycle.ts` | Reads profile status and erasure tombstone; decides allowed or denied with message and recovery path. |
| service | error taxonomy | `packages/client/client-runtime/src/authErrorTaxonomy.ts` | Maps identity-service error codes to 16 kinds, fields and retry waits; shared by Web and Mobile. |
| config | authProviders | `packages/client/client-runtime/src/authProviders.ts` | Provider ids, labels, defaults and passkey switch parsed from a config string. |
| service | browserSignIn (Electron) | `apps/desktop/electron/browserSignIn.ts` | Makes verifier and challenge, opens the browser, reads the returning link. |
| component | signInScreen (Electron) | `apps/desktop/electron/signInScreen.ts` | Shell-drawn sign-in screen and its state machine. |
| config | windowPolicy | `apps/desktop/electron/windowPolicy.ts` | Routes sign-in pages to the shell screen and keeps identity hosts inside the window. |
| screen | DesktopSignInHandoff | `apps/web/app/auth/desktop/DesktopSignInHandoff.tsx` | Browser page that requests the grant and opens the Desktop deep link. |
| screen | DesktopSignInComplete | `apps/web/app/auth/desktop/complete/DesktopSignInComplete.tsx` | Desktop-window page that redeems the grant and signs in with a ticket. |
| endpoint | POST /api/auth/desktop/grant | `apps/web/app/api/auth/desktop/grant/route.ts` | Issues the one-time code to a signed-in browser; CSRF, rate limit, audit event. |
| endpoint | POST /api/auth/desktop/redeem | `apps/web/app/api/auth/desktop/redeem/route.ts` | Trades code plus verifier for a sign-in ticket. |
| table | desktop_sign_in_grants | `apps/web/db/neon/0334_desktop_sign_in_grants.sql` | Stores hashed one-time codes with challenge, expiry and use time. |
| endpoint | device authorization routes | `apps/web/app/api/auth/device/token/route.ts` | CLI and editor polling; checks status, account, Terms and age before issuing tokens (code, approve and refresh siblings in the same folder). |
| screen | Device approval page | `apps/web/app/auth/device/page.tsx` | Shows code, account and Approve device. |
| service | CLI device login | `apps/cli/src/oauth.rs` | Starts the device code, polls, handles slow-down, Terms and denial. |
| command | agi login | `apps/cli/src/lib.rs` | Command definition and dispatch to the login flow (lines 988-992, 7269-7272); logic in apps/cli/src/auth.rs:1267. |
| service | VS Code device auth | `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` | Device-code sign-in with progress notification; token stored in SecretStorage. |
| service | VS Code shared sign-in | `apps/extension-vscode/src/features/surfaces/accountAccess.ts` | Prefers signing in through the CLI, falls back to its own flow. |
| service | Chrome clerkAuth | `apps/extension/src/features/cloud-bridge/clerkAuth.ts` | Opens the web sign-in tab and reads the shared session in the background. |
| component | MobileSignIn | `apps/mobile/src/features/auth/components/MobileSignIn.tsx` | Native sign-in screen logic. |
| screen | Mobile LoginScreen | `apps/mobile/app/(auth)/login.tsx` | Hosts sign-in and sign-up, Terms and age gates, Continue in Local Mode. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the browser calls the identity service (hosted by the identity vendor) to create a sign-in attempt for the typed email. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:466-469 |
| Web: the page reads the allowed first factors and picks enterprise connection, password or emailed code. | device | apps/web/features/auth/IdentityAuthAdapter.tsx:393-402 |
| Web: the session is finalized and the browser navigates to /login/complete. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:308-315 |
| Our server reads the account status from the profiles table and the erasure tombstone, then email state, age state and Terms. | our servers | apps/web/lib/auth/account-lifecycle.ts:15-38; apps/web/app/login/complete/page.tsx:69-119 |
| Desktop: the shell makes a random verifier, keeps it in memory, sends only its hash in the browser link. | device | apps/desktop/electron/browserSignIn.ts:36-54 |
| Desktop: the browser page, once signed in, posts the challenge; the server stores a hashed one-time code for 60 seconds. | our servers | apps/web/app/api/auth/desktop/grant/route.ts:19-51; apps/web/lib/server/desktop-sign-in.ts:33-48 |
| Desktop: the shell receives the deep link, checks it matches the pending challenge, loads the completion URL with code and verifier in the fragment. | device | apps/desktop/electron/browserSignIn.ts:71-85; apps/desktop/electron/main.ts:731-746 |
| Desktop: the page posts code and verifier; the server marks the grant used if the hash matches and asks the identity service to mint a short sign-in ticket; the page signs in with the ticket. | our servers | apps/web/app/api/auth/desktop/redeem/route.ts:38-54; apps/web/lib/server/desktop-sign-in.ts:50-69; apps/web/features/auth/IdentityAuthAdapter.tsx:735-749 |
| CLI and VS Code: the app asks for a device code, the person approves it on the web page, the app polls the token endpoint, which re-checks account, Terms and age and returns an access and refresh token. | our servers | apps/cli/src/oauth.rs:71-103, 128-150; apps/web/app/api/auth/device/token/route.ts:80-210 |
| Mobile: the app talks to the identity service from the device with native calls and, for providers, an in-app browser session. | outside service | apps/mobile/src/features/auth/components/MobileSignIn.tsx:181-190, 325-335 |
| Mobile: after sign-in the app checks Terms and adult eligibility with our servers before Cloud opens. | device and our servers | apps/mobile/app/(auth)/login.tsx:64-79, 161-300 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Browser session (identity vendor cookie or token) | Browser or app, managed by the vendor SDK | No sync; the provider allows one session per browser (apps/web/features/auth/IdentityAuthAdapter.tsx:77-79) | Ends on sign-out or expiry; the session lifetime is set in the identity service and is not stated in the files opened: unknown. |
| Desktop one-time grant (hashed code, challenge, expiry) | table:desktop_sign_in_grants | No | Used or expired rows for that user are deleted on the next grant (apps/web/lib/server/desktop-sign-in.ts:36-41). |
| Desktop pending verifier | Electron main process memory | No | Cleared on use, cancel or after 10 minutes (apps/desktop/electron/browserSignIn.ts:13-34). |
| Device authorization row and refresh token family (CLI, VS Code) | tables device_authorization_codes and device_refresh_tokens | No | Code lifetime 900 seconds (apps/web/app/api/auth/device/grant-policy.ts:6); retention of refresh rows unknown. |
| CLI tokens | OS keychain or an owner-only file | No | Removed by agi logout (apps/cli/src/lib.rs:7280-7300; apps/cli/src/auth.rs:110-130). |
| VS Code token | VS Code SecretStorage | VS Code settings sync not examined: unknown | Cleared on sign-out (apps/extension-vscode/src/features/account-auth/deviceAuth.ts:266-288). |
| Last-used method hint | Browser storage (read by apps/web/features/auth/lastUsedMethod.ts) | No | Not examined: unknown. |
| Mobile remembered account (email and method) | Device secure storage, this device only | No | Forgotten by the Not you control (apps/mobile/src/features/auth/services/rememberedAccount.ts:6, 40-52; MobileSignIn.tsx:372-376). |

**Models and providers.** No AI model or inference provider takes part. The identity vendor service handles credentials; our server decides account access. Nothing in sign-in depends on a model or provider choice. The Terms and age gates run before any Cloud model route is allowed [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | This feature creates the account session. Local use on Mobile needs no account (apps/mobile/app/(auth)/login.tsx:277, 301; doc: docs/product/requirements.md:481). |
| Permissions | No role is needed. The account must not be locked, recovery pending, suspended, banned, deleted or erased (apps/web/lib/auth/account-status.ts:72-106). The Desktop grant refuses developer-class tokens (apps/web/app/api/auth/desktop/grant/route.ts:27-29). |
| Subscription | none found in the code. Sign-in does not read a plan; Free managed Cloud is available after sign-in (doc: docs/product/definition.md:46). |
| Limits and metering | Rate limits on the grant, redeem and device poll routes (apps/web/app/api/auth/desktop/grant/route.ts:23; apps/web/app/api/auth/desktop/redeem/route.ts:24; apps/web/app/api/auth/device/token/route.ts:70). The client shows a retry wait for rate limits (apps/web/features/auth/AuthNoticeStep.tsx:57). Exact numbers are configuration: unknown. |
| Feature flags | AGI_AUTH_PROVIDERS, AGI_AUTH_MFA_EMAIL_FALLBACK (web); EXPO_PUBLIC_AGI_AUTH_PROVIDERS and FEATURES.auth (mobile); CLERK_PUBLISHABLE_KEY and CLERK_SYNC_HOST (Chrome). |
| Model compatibility | none found in the code. Sign-in does not depend on any model. |
| Provider restrictions | Only the identity vendor and the listed social providers. No inference provider is involved. |
| Local mode | Local mode needs no sign-in on Mobile (apps/mobile/app/(auth)/login.tsx:277, 301). Whether Desktop Local use works while signed out is unknown; the Desktop shell shows the sign-in screen for a signed-out window (apps/desktop/electron/main.ts:760-773). CLI provider-key use is separate from account sign-in (apps/cli/src/lib.rs:988-992; apps/cli/src/auth.rs:1267-1288). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading before the identity service is ready | Continue and provider buttons are disabled until the client reports ready. | apps/web/features/auth/AuthEmailStep.tsx:101, 164; apps/web/features/auth/IdentityAuthAdapter.tsx:150-158 |
| Session already exists | Sent to the completion page without an error. | apps/web/features/auth/IdentityAuthAdapter.tsx:194-197; apps/web/app/login/AuthEntryScreen.tsx:38-40 |
| Stale session rejected by the server | One sign-out and retry, then a stop message with a Back to sign-in link; 20-second timeout. | apps/web/app/login/complete/StaleSessionRecovery.tsx:11-66 |
| Rate limited, provider cancelled, provider outage, account locked or suspended | Shown as a notice step; email errors show against the field. | apps/web/features/auth/IdentityAuthAdapter.tsx:199-208; packages/client/client-runtime/src/authErrorTaxonomy.ts:22-30 |
| Offline or network error | Classified as network_unreachable with a Try again button. | packages/client/client-runtime/src/authErrorTaxonomy.ts:179, 219-225 |
| Account lookup fails at completion | Treated as allowed at this page; the route gate is the fail-closed layer (per the code comment). | apps/web/lib/auth/account-lifecycle.ts:40-48 |
| Desktop browser did not open | Pending state is cleared and the screen shows Your browser didn't open with Try again. | apps/desktop/electron/browserSignIn.ts:46-50; apps/desktop/electron/signInScreen.ts:79-84 |
| Desktop link expired, reused or from an earlier run | Shown as expired; the pending attempt is not consumed by a foreign link. | apps/desktop/electron/browserSignIn.ts:65-85; apps/desktop/electron/main.ts:698-712 |
| Desktop page opened outside the Desktop window | Redeem refused; the page shows a failure and Continue in your browser. | apps/web/app/auth/desktop/complete/DesktopSignInComplete.tsx:71-73 |
| Desktop older than browser sign-in support | Message Update Desktop to use browser sign-in with cancellation. | apps/web/features/desktop-host/lib/browser-sign-in.ts:19-20 |
| CLI code expired or denied or timed out | Exits with a message ending Run agi login to try again. | apps/cli/src/oauth.rs:538-585 |
| Terms re-acceptance needed during CLI approval | Poll returns terms_acceptance_required with a link; CLI prints it and keeps polling. | apps/web/app/api/auth/device/token/route.ts:176-186; apps/cli/src/oauth.rs:525-537 |
| VS Code remote window cannot confirm the browser opened | Warning with Copy sign-in link; the wait continues. | apps/extension-vscode/src/features/account-auth/deviceAuth.ts:204-217 |
| Mobile identity service never loads | Tokens are held up to 8 seconds, then released as signed out. | apps/mobile/src/integrations/clerk.ts:25-52 |
| Mobile Terms or age check fails to load | Screen shows the error with Retry and Log out. | apps/mobile/app/(auth)/login.tsx:171-290 |
| Accessibility | Alert role on error lines, a live status region and one-time-code autocomplete exist; accessibility e2e specs exist but were not opened. | apps/web/features/auth/AuthEmailStep.tsx:156; apps/web/e2e/auth-accessibility.spec.ts |
| Magic-link style outcomes (link expired, link already used) | Error kinds and copy exist but no link flow uses them. | packages/client/client-runtime/src/authErrorTaxonomy.ts:4-5; apps/web/lib/auth/error-taxonomy.copy.ts:33 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/auth/__tests__/IdentityAuthAdapter.test.tsx`: Adapter decisions (file named for the adapter; contents not opened).
- `apps/web/features/auth/__tests__/AuthFlow.password.test.tsx`: Password step flow (by name; not opened).
- `apps/web/features/auth/__tests__/AuthFlow.states.test.tsx`: Flow states (by name; not opened).
- `apps/web/e2e/auth-flow-states.spec.ts`: Browser tests with titles: login and signup render the same screen; an unknown address goes on to sign-up with no error; a known address goes to password; a wrong password is refused on the password field (apps/web/e2e/auth-flow-states.spec.ts:262-350).
- `apps/web/app/login/complete/page.test.tsx`: Completion page checks (by name; 568 lines; not opened).
- `apps/web/app/login/complete/StaleSessionRecovery.test.tsx`: Stale session recovery (by name).
- `apps/web/app/login/page.test.tsx`: Login page (by name).
- `apps/web/lib/auth/__tests__/error-taxonomy.test.ts`: Mapping of vendor error codes to kinds (partial view: lines 49-52).
- `apps/web/lib/auth/account-status.test.ts`: Account access decisions (by name).
- `apps/desktop/electron/__tests__/browserSignIn.test.ts`: Desktop verifier handoff (by name).
- `apps/desktop/electron/__tests__/signInScreen.test.ts`: Desktop sign-in screen states (by name).
- `apps/web/app/api/auth/desktop/redeem/__tests__/route.test.ts`: Redeem route (by name).
- `apps/web/app/api/auth/device/token/route.test.ts`: Device token poll route (by name).
- `apps/cli/src/oauth.rs`: Inline Rust tests: device link carries the code, untrusted verification URLs refused, final invalid grant, terms refusal sentence, no terminal escapes (apps/cli/src/oauth.rs:277-445).
- `apps/extension-vscode/src/__tests__/deviceAuth.test.ts`: Device auth (by name).
- `apps/mobile/__tests__/MobileSignInIdentifier.test.tsx`: Mobile sign-in identifier step (by name).
- `apps/mobile/__tests__/LoginScreen.test.tsx`: Mobile login screen (by name).

**Test scenarios**

- **Web password sign-in**
  1. Open /login signed out.
  2. Type an email with a password account, press Continue.
  3. Enter the password, press Continue.
  - Expected: A completion page appears and then the new chat; no error text.
- **Denied account**
  1. Sign in with an account whose profile status is suspended.
  2. Reach /login/complete.
  - Expected: A suspended notice with an Appeal this suspension action; no product page.
- **Desktop browser handoff**
  1. Open Desktop signed out.
  2. Press Continue in browser.
  3. Sign in in the browser and allow opening Desktop.
  - Expected: The Desktop window signs in without a password field; Cancel before finishing returns to the first screen; waiting 10 minutes shows Sign-in link expired.
- **CLI device login**
  1. Run agi login.
  2. Open the printed link, check the code, press Approve device.
  - Expected: Terminal prints Authenticated with AGI; a second run with the code left unapproved ends with the expired message.
- **Mobile unknown email**
  1. Open Cloud sign-in on Mobile.
  2. Type an email with no account and press Continue.
  - Expected: The app moves to the sign-up screen for that email; Log in instead is available from sign-up.
- **Stale session**
  1. Hold a rejected browser session cookie.
  2. Open /login/complete.
  - Expected: One automatic sign-out and return to sign-in; a second failure shows the stop message.

**Where to look when it fails**

- Log line account lifecycle lookup failed at sign-in completion (apps/web/lib/auth/account-lifecycle.ts:46).
- Log lines Device code issued (apps/web/app/api/auth/device/code/route.ts:97) and Device token issued (apps/web/app/api/auth/device/token/route.ts).
- Audit events login and device_authorization_approved with resourceType desktop_sign_in (apps/web/app/api/auth/desktop/grant/route.ts:44-49; apps/web/app/api/auth/desktop/redeem/route.ts:47-52).
- Tables desktop_sign_in_grants, device_authorization_codes, device_refresh_tokens, profiles (account_status).
- Error kinds in packages/client/client-runtime/src/authErrorTaxonomy.ts:1-18; CLI refusals in apps/cli/src/oauth.rs:171-215.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/web/003-authentication-and-onboarding-screens.md)
- Desktop: [70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)
- CLI: [70-qa/test-plans/cli/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/cli/003-authentication-and-onboarding-screens.md)
- VS Code: [70-qa/test-plans/vscode/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/vscode/003-authentication-and-onboarding-screens.md)
- Chrome: [70-qa/test-plans/chrome/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/chrome/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **Web does not tell a person that no account exists for the typed email; it creates a sign-up instead. The required behaviour says the user is told and offered a choice.** Affects: Web, and Desktop, CLI, VS Code, Chrome which use the web page. Evidence: apps/web/features/auth/IdentityAuthAdapter.tsx:471-495; apps/web/e2e/auth-flow-states.spec.ts:271; copy at apps/web/lib/auth/error-taxonomy.copy.ts:59-63. Work needed: Decide whether the unified flow satisfies S3.18; if not, add a notice or confirmation before sign-up starts.
- **Mobile second-factor sign-in is not finished and is unverified live.** Affects: Mobile users with an authenticator or backup codes. Evidence: Area brief S3.14 Unfinished; apps/mobile/src/features/auth/components/MobileSignIn.tsx:217-231. Work needed: Enable the factors in the identity dashboard and run a live second-factor sign-in check.
- **Mobile has no passkey sign-in.** Affects: Mobile. Evidence: No passkey code in apps/mobile/src/features/auth/components/MobileSignIn.tsx; passkey code only in settings account-security. Work needed: Decide scope; add native passkey sign-in if required.
- **Chrome Terms acceptance is partial.** Affects: Chrome. Evidence: Area brief S3.19 status. Work needed: Not examined in code: unknown.
- **The account-status lookup is allowed on failure at the completion page.** Affects: Web and Desktop. Evidence: apps/web/lib/auth/account-lifecycle.ts:40-48. Work needed: Confirm the route gate catches every denied account; consider showing a retry instead.
- **Brief code references for CLI (lib.rs:3936) and VS Code (commandSetup.ts:1035) point at unrelated code now.** Affects: Documentation. Evidence: apps/cli/src/lib.rs:3900-3990 holds artifact commands. Work needed: Replace with apps/cli/src/oauth.rs:491 and apps/extension-vscode/src/core/commandSetup.ts:1221.
- **Desktop passkey and signed-out Local use not confirmed.** Affects: Desktop. Evidence: No passkey code under apps/desktop/electron; apps/desktop/electron/main.ts:760-773 shows the sign-in screen when signed out. Work needed: Run on a real Desktop build and record the result.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-security-and-privacy
- SYS-execution-boundaries
- F003-02
- F003-04
- F003-05
- F003-06
- table:desktop_sign_in_grants
- table:device_authorization_codes
- table:profiles
- api:POST /api/auth/desktop/grant
- api:POST /api/auth/desktop/redeem
- api:POST /api/auth/device/code
- api:POST /api/auth/device/token
- file:apps/web/features/auth/IdentityAuthAdapter.tsx

## Unknown

- How long refresh-token rows and expired device codes are kept.
- Whether Desktop Local use is possible while the account is signed out.
- Contents of the test files marked by name only; none were run.
- The session lifetime set in the identity service.
- Whether Chrome side-panel sign-in has tests (no clerkAuth test file found by name).
- How the Chrome extension turns the shared web session into a side-panel session beyond the sync host settings.
