---
id: "F003-05"
type: "feature"
title: "Social and work sign-in"
aliases: ["Social sign-in", "Continue with Google", "Continue with GitHub", "Continue with Microsoft", "Continue with Apple", "Enterprise SSO", "Single sign-on", "Organization sign-in", "Sign-in methods", "Link accounts", "Connect", "Disconnect", "S3.08", "S3.09", "S3.10", "S3.17"]
area: "3 Authentication and onboarding screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S3.08", "S3.09", "S3.10", "S3.17"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-api-and-contracts", "F003-01", "F003-06", "api:GET /api/settings/identities", "api:DELETE /api/settings/identities", "file:apps/web/features/auth/AuthProviderButtons.tsx", "file:packages/client/client-runtime/src/authProviders.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-05 Social and work sign-in

People can sign in or sign up with Google, GitHub, Microsoft or Apple, and a work email that an organization has set up for single sign-on goes to that organization's login. Signed-in people can connect another provider or remove a linked method in Settings. The server refuses to remove the last way to sign in.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.08](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s308), [S3.09](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s309), [S3.10](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s310), [S3.17](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s317).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Offers provider buttons on the sign-in screen, routes enterprise-covered addresses to the organization's sign-in ahead of personal methods, and lists, connects, disconnects and unlinks sign-in methods in Settings (apps/web/features/auth/IdentityAuthAdapter.tsx:31-36, 393-395; apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:427-513).

**Why it exists.** Many people prefer a provider to a password, organizations require single sign-on, and an account needs more than one way in for safety [inferred].

**Who uses it.** Anyone signing in with a provider; employees of organizations with single sign-on; signed-in users managing sign-in methods.

**Problems it solves**

- No new password to remember.
- Organizations control authentication for their domain: the enterprise connection outranks personal factors on the same address (IdentityAuthAdapter.tsx:44-46, 393-395).
- Account takeover risk: unlinking needs a step-up check, asks first, tells the account holder and records an audit event (apps/web/app/api/settings/identities/route.ts:64-114).
- Locked-out by removal: the server refuses to remove the last or the registered sign-in method (identities/route.ts:26-31, 99-101).

**Use cases**

- A user clicks Continue with Google and lands signed in.
- An employee types a work email and is sent to the company login.
- A user connects GitHub in Settings so either provider works.
- A Desktop user presses Continue in browser and signs in with a provider in the system browser.

## 2. User experience

**Where to find it**

- Web sign-in and sign-up screen: buttons Continue with <provider> above the email field (apps/web/features/auth/AuthProviderButtons.tsx:15-64; apps/web/features/auth/AuthEmailStep.tsx:98-106).
- Web Settings, Security: section headed Sign-in methods with Connect, Disconnect and Remove (apps/web/features/settings/sections/SecuritySection.tsx:241-244; SignInMethodsPanel.tsx:513-532).
- Desktop: Continue in browser then the same web screen in the browser (apps/desktop/electron/browserSignIn.ts:44-47); Settings in the Desktop window is a web page the window policy allows [inferred from apps/desktop/electron/windowPolicy.ts:102-110].
- Mobile sign-in screen: provider buttons labelled Continue with <provider>, Apple button on iOS (apps/mobile/src/features/auth/components/MobileSignIn.tsx:67-71, 325-362); Mobile Settings: Sign-in methods group listing linked methods and Add or remove a sign-in method (Web) (apps/mobile/src/features/settings/account-security/index.tsx:600-640).
- CLI, VS Code, Chrome: the provider runs on the web page the app opens (doc: area brief).

**Before you start**

- Provider enabled in configuration (default Google and GitHub; Microsoft and Apple only when configured) (packages/client/client-runtime/src/authProviders.ts:17-34).
- Enterprise: an organization connection set up in the identity service for the email domain.
- Settings changes: a signed-in session; unlink needs a recent verification (step-up) (apps/web/app/api/settings/identities/route.ts:64-70).
- Mobile Apple button: iOS build with the Apple sign-in plugin and device support (apps/mobile/src/features/auth/services/loginProviders.ts:16-22; MobileSignIn.tsx:100-113).

**Screens and controls**

- Provider buttons with a Last used badge on the last method (apps/web/features/auth/AuthProviderButtons.tsx:57-59).
- Email Continue also acts as work-email discovery: if the address has an enterprise connection, no password is asked (IdentityAuthAdapter.tsx:393-395).
- Settings rows: Email address, Password (Set or Not set), Passkeys, one row per provider with Connect or Disconnect, and linked identities with Remove (SignInMethodsPanel.tsx:540-626).
- Confirm dialogs: Disconnect <provider>? with You will no longer be able to sign in with <provider>; Remove this <method>? with a consequence text (SignInMethodsPanel.tsx:451-513).
- Desktop web component while waiting: Continue in your browser, Open the browser again, Cancel sign-in (apps/web/features/desktop-host/components/DesktopBrowserSignIn.tsx:29-33, 100).

**Journey**

1. Web provider: click Continue with Google. The page redirects to the provider and back through /auth/sso-callback to the completion page (IdentityAuthAdapter.tsx:648-657, 762-781).
2. If the provider account has no AGI account yet, the callback turns it into a sign-up that finishes on /signup/complete (IdentityAuthAdapter.tsx:650-652).
3. Enterprise: type the work email, Continue; the page asks the identity service which first factors exist, finds enterprise sign-on and redirects to the organization login (IdentityAuthAdapter.tsx:286-306, 393-395).
4. Desktop: provider or enterprise choice opens the system browser and waits for the handoff (IdentityAuthAdapter.tsx:286-295, 640-647).
5. Settings link: open Settings, Security, press Connect beside a provider, finish the provider page, return (SignInMethodsPanel.tsx:427-448).
6. Settings unlink: press Remove, read the consequence, confirm, pass the step-up check; the row disappears (SignInMethodsPanel.tsx:480-513; apps/web/app/api/settings/identities/route.ts:64-114).
7. Mobile: tap a provider, finish in the in-app browser; Apple uses the native sheet (MobileSignIn.tsx:325-362).

**What the person sees and gets**

- A provider return that failed shows its error inline; a transferable one is finished by the callback (IdentityAuthAdapter.tsx:110-116, 662-667).
- Provider cancelled or outage notices (packages/client/client-runtime/src/authErrorTaxonomy.ts:22-30, 72-75, 231-250).
- Refusals on unlink: This is the only way left to sign in. Add another sign-in method before removing this one., and the primary method refusal (identities/route.ts:26-31).
- Uncertain outcome message if a change could not be confirmed (SignInMethodsPanel.tsx:142-143).

**Settings**

- AGI_AUTH_PROVIDERS (web) and EXPO_PUBLIC_AGI_AUTH_PROVIDERS (mobile) list enabled providers (apps/web/features/auth/authProviderConfig.ts:7; MobileSignIn.tsx:68).
- Enterprise connections are configured in the identity service, not in this repo: unknown.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: provider sign-in and sign-up through redirect and callback (apps/web/features/auth/IdentityAuthAdapter.tsx:638-660, 762-781).
- Web: enterprise routing by identifier and strategy, ahead of passwords (IdentityAuthAdapter.tsx:286-306, 393-395).
- Web: provider errors on return are read and shown (IdentityAuthAdapter.tsx:662-667; apps/web/features/auth/AuthFlow.tsx:123-132).
- Desktop: provider and enterprise sign-in go through the system browser and a one-time handoff (IdentityAuthAdapter.tsx:288-295, 640-647; apps/desktop/electron/browserSignIn.ts:36-54); identity hosts and enterprise provider hosts are allowed inside the window when a page is used in-window (apps/desktop/electron/windowPolicy.ts:46-61, 136-141).
- Web Settings: list, Connect, Disconnect and Remove with confirmation, step-up and uncertain-outcome handling (apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:427-513).
- Server: unlink refuses last and primary methods, audits denials, invalidates caches, notifies the account holder and risk engine (apps/web/app/api/settings/identities/route.ts:64-114).
- Mobile: provider buttons, Apple native sign-in, enterprise sign-in by email (MobileSignIn.tsx:181-190, 325-362).
- Mobile Settings: read-only list of linked methods and a row opening the web to add or remove (apps/mobile/src/features/settings/account-security/index.tsx:600-640).

**Incomplete**

- Mobile: no in-app Connect or Unlink; changes happen on the web (apps/mobile/src/features/settings/account-security/index.tsx:600-640).
- Mobile: Microsoft and enterprise sign-in code exists but the brief calls it unverified (doc: area brief S3.08-S3.10).
- Domain discovery by an organization's verified domains: a service apps/web/lib/services/organization-verified-domains.ts is named in the brief but the sign-in screen decides enterprise routing from the identity service's factor list (IdentityAuthAdapter.tsx:393-395); that file's role was not opened: unknown.

**Present but disconnected or switched off**

- Microsoft and Apple buttons are off on Web unless AGI_AUTH_PROVIDERS names them (packages/client/client-runtime/src/authProviders.ts:17, 25-34).
- On iOS Mobile no provider button shows unless the Apple plugin is in the build (apps/mobile/src/features/auth/services/loginProviders.ts:16-22).

**Not available**

- Account linking inside the Mobile app (doc: area brief S3.17 mobile missing; code confirms a read-only list).
- Provider sign-in inside CLI, VS Code, Chrome themselves.

## 4. Required behaviour

**Established requirements**

- Sign-in and sign-up offer social providers that complete sign-in on this surface. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S3.08)
- A user of an SSO-enabled organization can start enterprise single sign-on from the sign-in screen and land signed in. (source: S3.09 (same brief))
- Entering a work email discovers the organization's sign-in by domain and routes the user to it. (source: S3.10 (same brief))
- A signed-in user can link another sign-in method and see or unlink linked methods. (source: S3.17 (same brief))
- An action a user cannot undo asks first and names the consequence. (source: AGENTS.md section 9 (repo rule))

**Acceptance criteria**

1. Each configured provider button starts that provider and returns the person signed in.
2. A provider the person cancelled shows a notice and nothing changes.
3. A work email covered by enterprise sign-on goes to the organization login without a password step.
4. In Settings, Remove asks first with a consequence and the server refuses the last remaining method.
5. Connect adds the provider and it shows as Connected as <email>.
6. Mobile shows linked methods and a row that opens the web to change them.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Provider sign-in must still pass /login/complete for access, age and Terms checks [inferred from IdentityAuthAdapter.tsx:652-656 redirect URLs].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add in-app Mobile linking or keep the web link and state that choice as intended.
- [proposed] Show the organization name on the enterprise redirect so people know why no password was asked.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AuthProviderButtons | `apps/web/features/auth/AuthProviderButtons.tsx` | Provider button stack with last-used badge. |
| hook | startProvider, startEnterpriseSso | `apps/web/features/auth/IdentityAuthAdapter.tsx` | Redirect to provider or organization; desktop handoff branch. |
| component | IdentitySsoCallback | `apps/web/features/auth/IdentityAuthAdapter.tsx` | Receives the provider return and routes to completion pages (lines 762-781). |
| screen | sso-callback page | `apps/web/app/auth/sso-callback/page.tsx` | Route that hosts the callback component. |
| config | authProviders | `packages/client/client-runtime/src/authProviders.ts` | Provider ids and default list. |
| config | authProviderConfig | `apps/web/features/auth/authProviderConfig.ts` | Reads AGI_AUTH_PROVIDERS. |
| component | ProviderMark | `apps/web/features/auth/ProviderMark.tsx` | Provider icons. |
| component | AuthProviderCallbackNotice | `apps/web/features/auth/AuthProviderCallbackNotice.tsx` | Callback error notice. |
| service | browserSignIn (Electron) | `apps/desktop/electron/browserSignIn.ts` | System-browser handoff for provider and enterprise. |
| config | windowPolicy | `apps/desktop/electron/windowPolicy.ts` | Allowed identity and enterprise hosts, sign-in page replacement. |
| component | SignInMethodsPanel | `apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx` | Settings list, connect, disconnect, unlink. |
| hook | useSignInIdentities | `apps/web/features/settings/components/Settings/use-sign-in-identities.ts` | Loads identities from the settings API (path taken from the panel's import). |
| endpoint | GET and DELETE /api/settings/identities | `apps/web/app/api/settings/identities/route.ts` | List methods; unlink with step-up, refusals, audit and notification. |
| screen | SecuritySection | `apps/web/features/settings/sections/SecuritySection.tsx` | Hosts SignInMethodsPanel and PasskeysPanel (lines 241-246). |
| component | MobileSignIn provider code | `apps/mobile/src/features/auth/components/MobileSignIn.tsx` | Provider, Apple and enterprise sign-in. |
| service | loginProviders | `apps/mobile/src/features/auth/services/loginProviders.ts` | Chooses visible providers per platform and build. |
| service | mobileSsoCallback | `apps/mobile/src/features/auth/services/mobileSsoCallback.ts` | Return address wrapper for the mobile provider flow (file name; contents not opened). |
| screen | Mobile account security | `apps/mobile/src/features/settings/account-security/index.tsx` | Read-only linked-method list and web link. |
| test | SignInMethodsPanel tests | `apps/web/features/settings/components/Settings/SignInMethodsPanel.test.tsx` | Panel tests (by name). |
| test | identities route test | `apps/web/app/api/settings/identities/route.test.ts` | Route tests (by name). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the page asks the identity service to start a provider redirect with return addresses on our site. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:648-657 |
| The browser goes to the provider (Google, GitHub, Microsoft or Apple), the person signs in, the provider returns to the identity service and to /auth/sso-callback. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:762-781 |
| Our server runs the completion checks on /login/complete or /signup/complete. | our servers | apps/web/app/login/complete/page.tsx:69-146 |
| Enterprise: the page finds the enterprise factor for the typed address and redirects to the organization's login. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:296-303, 393-395 |
| Desktop: the shell opens the system browser; the browser runs one of the flows above; the handoff of F003-01 returns the session. | device and our servers | apps/web/features/auth/IdentityAuthAdapter.tsx:288-295; apps/desktop/electron/browserSignIn.ts:36-54 |
| Settings unlink: the page calls DELETE with CSRF token and step-up grant; our server removes the identity, audits and notifies. | our servers | apps/web/app/api/settings/identities/route.ts:64-114 |
| Settings connect and disconnect run through the identity service client in the browser. | outside service | apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:427-477 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Linked identities (provider, subject, last authenticated, creation source) | Our database through listAccountIdentities (table not opened: unknown) and the identity vendor | Server and vendor kept in step by the unlink code (invalidateIdentityAccountCache, apps/web/app/api/settings/identities/route.ts:97) | Removed on unlink; audit event identity_unlinked recorded (identities/route.ts:84-114). |
| Last-used method hint | Browser storage (apps/web/features/auth/lastUsedMethod.ts) | No | Unknown. |
| Mobile remembered account | Device secure storage | No | Forgotten on request (apps/mobile/src/features/auth/services/rememberedAccount.ts:40-52). |

**Models and providers.** The providers here are sign-in providers (Google, GitHub, Microsoft, Apple), not AI inference providers; no packages/ai/providers entry applies. No model takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in itself needs none. Settings management needs a signed-in session. |
| Permissions | Unlink requires a recent step-up verification (apps/web/app/api/settings/identities/route.ts:64-70). Organization members follow their organization's enterprise rule [inferred]. |
| Subscription | none found in the code. |
| Limits and metering | Rate limits settings-identities-list and settings-identity-unlink (apps/web/app/api/settings/identities/route.ts:35, 55-62). |
| Feature flags | AGI_AUTH_PROVIDERS, EXPO_PUBLIC_AGI_AUTH_PROVIDERS. |
| Model compatibility | none found in the code. |
| Provider restrictions | Only providers named in packages/client/client-runtime/src/authProviders.ts:1 (Google, GitHub, Microsoft, Apple). On iOS builds Apple must be offered beside other providers (apps/mobile/src/features/auth/services/loginProviders.ts:13-22). |
| Local mode | Mobile Local Mode needs no sign-in; providers appear only on the Cloud sign-in screen. Desktop provider sign-in always uses the system browser and our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Provider cancelled | provider_cancelled notice or inline message; Try again offered. | packages/client/client-runtime/src/authErrorTaxonomy.ts:72, 219-225 |
| Provider outage | provider_outage notice with Try another way copy. | packages/client/client-runtime/src/authErrorTaxonomy.ts:73-75; apps/web/lib/auth/error-taxonomy.copy.ts (provider_outage entry) |
| Provider account has no AGI account | Callback turns it into a sign-up. | apps/web/features/auth/IdentityAuthAdapter.tsx:650-652 |
| Provider email already used by another method | external_account_exists maps to identifier_exists. | packages/client/client-runtime/src/authErrorTaxonomy.ts:76 |
| Enterprise on Desktop with an old build | Message Update Desktop to use browser sign-in with cancellation. | apps/web/features/auth/IdentityAuthAdapter.tsx:289-291; apps/web/features/desktop-host/lib/browser-sign-in.ts:19-20 |
| Unlink last method | Server refuses with Add another sign-in method first. | apps/web/app/api/settings/identities/route.ts:26-28, 99-101 |
| Unlink registered (primary) method | Refused with an explanation. | apps/web/app/api/settings/identities/route.ts:29-30 |
| Outcome of a change unknown (tab changed, account switched) | Banner telling the person to review methods before retrying; buttons blocked. | apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:142-143, 241-246 |
| Loading methods | Spinner labelled Loading sign-in methods. | apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:540 |
| Mobile not in Cloud mode | Row says Cloud mode required. | apps/mobile/src/features/settings/account-security/index.tsx:604-606 |
| Mobile Apple cancel | Silent return, no error. | apps/mobile/src/features/auth/components/MobileSignIn.tsx:343-347 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/components/Settings/SignInMethodsPanel.test.tsx`: Panel behaviour (by name).
- `apps/web/features/settings/components/Settings/SignInMethodsPanel.ownership.test.tsx`: Session ownership during changes (by name).
- `apps/web/app/api/settings/identities/route.test.ts`: List and unlink route (by name).
- `apps/web/features/auth/__tests__/AuthProviderCallbackNotice.test.tsx`: Callback notice (by name).
- `packages/client/client-runtime/src/__tests__/authProviders.test.ts`: Provider list parsing (by name).
- `apps/mobile/__tests__/loginProviders.test.ts`: Mobile provider visibility (by name).
- `apps/desktop/electron/__tests__/windowPolicy.test.ts`: Navigation decisions (by name).

**Test scenarios**

- **Provider sign-in on Web**
  1. Open /login, click Continue with Google, finish at the provider.
  - Expected: Returns to the completion page and the new chat; Last used badge appears next visit.
- **Enterprise routing**
  1. Type a work email covered by an enterprise connection and Continue.
  - Expected: Browser goes to the organization login with no password step.
- **Remove last method**
  1. With one sign-in method, open Settings, Security, press Remove on it.
  - Expected: Confirmation, then a refusal that it is the only way left to sign in.
- **Link a provider**
  1. Settings, Security, press Connect beside GitHub, finish.
  - Expected: Row shows Connected as <email> and the identity appears in the list.
- **Desktop enterprise**
  1. Desktop, Continue in browser, then enterprise email.
  - Expected: System browser handles the organization login; Desktop signs in on return.
- **Mobile linked list**
  1. Mobile Settings, Account security, Sign-in methods in Cloud mode.
  - Expected: Linked methods listed read-only; Add or remove a sign-in method opens the web.

**Where to look when it fails**

- Audit event identity_unlinked with outcome denied and reason last_sign_in_method or primary_sign_in_method.
- Error kinds provider_cancelled, provider_outage, identifier_exists.
- Identity vendor dashboard for enterprise connections and provider settings (outside the repo).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/web/003-authentication-and-onboarding-screens.md)
- Desktop: [70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **Mobile cannot link or unlink sign-in methods in the app.** Affects: Mobile. Evidence: apps/mobile/src/features/settings/account-security/index.tsx:600-640; area brief S3.17. Work needed: Decide in-app linking or accept the web handoff.
- **Mobile social and enterprise sign-in not verified live.** Affects: Mobile. Evidence: Area brief S3.08-S3.10. Work needed: Run each provider on iOS and Android builds.
- **The verified-domain service named in the brief is not what the sign-in screen uses.** Affects: Web, Desktop. Evidence: apps/web/features/auth/IdentityAuthAdapter.tsx:393-395; brief S3.10 lists apps/web/lib/services/organization-verified-domains.ts. Work needed: Open that file and state whether it feeds the identity service.
- **The draft claim that the last-method rule is not in code is out of date: the server rule exists, but no client-side check blocks the button before the call.** Affects: Web. Evidence: apps/web/app/api/settings/identities/route.ts:99-101. Work needed: Confirm by test and consider disabling the button.
- **Microsoft and Apple buttons depend on configuration, so production state is unknown.** Affects: Web. Evidence: packages/client/client-runtime/src/authProviders.ts:17. Work needed: Check the deployed AGI_AUTH_PROVIDERS value.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-api-and-contracts
- F003-01
- F003-06
- api:GET /api/settings/identities
- api:DELETE /api/settings/identities
- file:apps/web/features/auth/AuthProviderButtons.tsx
- file:packages/client/client-runtime/src/authProviders.ts

## Unknown

- Which table holds linked identities (listAccountIdentities not opened).
- What apps/web/lib/services/organization-verified-domains.ts does at sign-in.
- Which providers are enabled in production.
- Whether enterprise sign-in works on Mobile (brief unverified).
- Tests marked by name only were not opened or run.
