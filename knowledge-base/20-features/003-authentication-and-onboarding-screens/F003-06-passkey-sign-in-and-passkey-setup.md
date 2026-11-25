---
id: "F003-06"
type: "feature"
title: "Passkey sign-in and passkey setup"
aliases: ["Passkeys", "Passkeys and security keys", "Sign in with a passkey or security key", "Use a passkey or security key", "Add a passkey", "S3.11", "S3.12"]
area: "3 Authentication and onboarding screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S3.11", "S3.12"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "F003-01", "F003-05", "file:apps/web/features/settings/components/Settings/PasskeysPanel.tsx", "file:apps/web/lib/identity/client.ts", "file:apps/mobile/src/features/settings/account-security/PasskeysSection.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-06 Passkey sign-in and passkey setup

A passkey is a device-held login key. On Web a signed-in person can add, rename and remove passkeys in Settings, Security, and sign in with one from the first screen when the deployment turns it on. Mobile lists and removes passkeys but adds them on the web and has no passkey sign-in.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.11](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s311), [S3.12](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s312).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Registers passkeys and security keys on an account, lists them, renames and removes them, and lets a person sign in with a stored passkey instead of a password or code (apps/web/lib/identity/client.ts:149-176, 253-270; apps/web/features/auth/IdentityAuthAdapter.tsx:620-626).

**Why it exists.** Passkeys resist phishing better than passwords, and the Mobile settings footnote says so (apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:23-24).

**Who uses it.** Security-minded users and anyone who prefers one-tap sign-in.

**Problems it solves**

- No password typing or code copying.
- Phishing resistance.
- Sign-in on a device that holds the passkey without the inbox.

**Use cases**

- A user adds a passkey in Settings, Security, Passkeys.
- A user presses Sign in with a passkey or security key on the first screen.
- A user removes a lost-device passkey after confirming the warning.
- A Mobile user views passkeys and removes one after a step-up check.

## 2. User experience

**Where to find it**

- Web Settings, Security: panel headed Passkeys with Add a passkey, Rename and Remove (apps/web/features/settings/components/Settings/PasskeysPanel.tsx:361-495; apps/web/features/settings/sections/SecuritySection.tsx:246).
- Web sign-in: button Sign in with a passkey or security key on the first screen, and Use a passkey or security key in the Try another way to sign in picker (apps/web/features/auth/AuthEmailStep.tsx:124; apps/web/features/auth/AuthMethodPicker.tsx:18, 67).
- Mobile: Settings, Account security, row Passkeys and security keys; inside, Add a passkey or security key opens the web (apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:25, 258-269).
- Desktop: the Settings page is the web Security section shown in the Desktop window [inferred]; passkey enrolment there is unverified.
- CLI, VS Code, Chrome: not applicable (doc: area brief).

**Before you start**

- Web: a browser with passkey support (apps/web/lib/identity/passkey-support.ts:1-3).
- Sign-in with passkey: AGI_AUTH_PROVIDERS must include the word passkey (apps/web/features/auth/authProviderConfig.ts:15-17; packages/client/client-runtime/src/authProviders.ts:40-46).
- Adding or removing needs a signed-in session; Mobile removal needs a step-up check (apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:114-122, 146-152).

**Screens and controls**

- Web panel: Passkeys heading, Add a passkey button, each row with name, Rename (inline field New name for <name>, save and cancel) and Remove (apps/web/features/settings/components/Settings/PasskeysPanel.tsx:361-495).
- Web remove dialog: title Remove <name>?, text You will no longer be able to sign in with this passkey on any device that synced it. You can add it again later., button Remove passkey (PasskeysPanel.tsx:306-312).
- Web Sign-in methods panel row Passkeys with a count and Last added date (apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:63-69).
- Mobile list: Passkeys and security keys, rows with Remove or Web, text No passkeys or security keys yet, dialog Remove <name>? It can no longer sign in to your account. (PasskeysSection.tsx:160-166, 225-232).

**Journey**

1. Web enrol: Settings, Security, Passkeys, Add a passkey; the browser or device asks to create a passkey; the new row appears (apps/web/lib/identity/client.ts:263; PasskeysPanel.tsx:385).
2. Web sign-in: press Sign in with a passkey or security key; the device asks for the passkey; the session is finalized; the browser goes to /login/complete (IdentityAuthAdapter.tsx:620-626).
3. Web remove: press Remove, read the warning, press Remove passkey (PasskeysPanel.tsx:302-316).
4. Mobile remove: tap Remove, confirm the dialog, pass the step-up check, the list refreshes (PasskeysSection.tsx:114-170).
5. After a failure the person can use email or a code instead (error copy: This device has no passkey for an account here. Use your email instead., apps/web/lib/auth/error-taxonomy.copy.ts passkey_unrecognized entry).

**What the person sees and gets**

- passkey_dismissed and passkey_unrecognized messages with Try again or Use email instead (packages/client/client-runtime/src/authErrorTaxonomy.ts:77-82, 219-225).
- Busy states and inline errors in the panel; uncertain-outcome banner on Web (PasskeysPanel.tsx; SignInMethodsPanel.tsx:142-143).
- Mobile row value shows the count, Web, Unavailable, or Retry (PasskeysSection.tsx:172-182).

**Settings**

- Deployment switch: passkey inside AGI_AUTH_PROVIDERS (web).
- Name length limit of 50 characters (apps/web/lib/identity/client.ts:157).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: add, list, rename and remove passkeys in Settings (apps/web/lib/identity/client.ts:176-270; apps/web/features/settings/components/Settings/PasskeysPanel.tsx:208-316).
- Web: removal asks first with a destructive confirmation naming the consequence (PasskeysPanel.tsx:302-316); the draft's doubt about confirmation is resolved.
- Web: passkey sign-in offered when configured and supported; discoverable flow (apps/web/features/auth/IdentityAuthAdapter.tsx:620-626; apps/web/features/auth/AuthEmailStep.tsx:82-129).
- Web: passkey also offered as an alternative after a password or code step (apps/web/features/auth/AuthMethodPicker.tsx:15-19).
- Mobile: list and remove with confirmation and step-up; keys created on the web are shown with a Web row (apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:100-170, 225-250).
- Mobile: fetch of keys and removal API wired (apps/mobile/src/features/settings/account-security/service.ts:255-340).

**Incomplete**

- Mobile: adding a passkey opens the web, not a native flow (PasskeysSection.tsx:262-269).
- Desktop: enrolment and sign-in not confirmed; no passkey code under apps/desktop/electron and sign-in runs in the system browser.

**Present but disconnected or switched off**

- Web passkey sign-in button is hidden unless the configuration includes passkey (apps/web/features/auth/authProviderConfig.ts:15-17) and the browser supports passkeys (AuthEmailStep.tsx:82).
- Mobile Passkeys section returns nothing when the server says the state is unavailable (PasskeysSection.tsx:134-137; service.ts:296-298).

**Not available**

- Passkey sign-in on Mobile (no code in apps/mobile/src/features/auth/components/MobileSignIn.tsx).
- Passkey sign-in in CLI, VS Code and Chrome apps themselves.

## 4. Required behaviour

**Established requirements**

- A signed-in user can register a passkey and see it listed with rename and removal. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S3.11)
- A user with a registered passkey can sign in with it instead of a password or code. (source: S3.12 (same brief))
- An action a user cannot undo asks first and names the consequence. (source: AGENTS.md section 9 (repo rule))

**Acceptance criteria**

1. Add a passkey creates a passkey and it appears in the list with a name and date.
2. Rename changes the name; names over 50 characters are refused.
3. Remove asks first, names the consequence, and then removes the passkey.
4. With passkey enabled and supported, the first screen shows the passkey button and a registered passkey signs the person in.
5. Dismissing the passkey prompt shows a retryable message and leaves the screen usable.
6. On Mobile, Remove asks first and needs a step-up check; Add opens the web.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Whether removing the last passkey could lock a person out was not verified; the identities route guards only linked identities [inferred, unverified].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add native Mobile passkey creation and sign-in if Mobile is to match Web.
- [proposed] State on Desktop whether passkeys work in the Desktop window and test it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PasskeysPanel | `apps/web/features/settings/components/Settings/PasskeysPanel.tsx` | Add, rename, remove passkeys with confirmation. |
| hook | usePasskeys | `apps/web/lib/identity/client.ts` | Reads passkeys and runs create, rename, remove through the identity client. |
| service | browserSupportsPasskeys | `apps/web/lib/identity/passkey-support.ts` | Feature check for passkey support. |
| component | AuthEmailStep passkey button | `apps/web/features/auth/AuthEmailStep.tsx` | Shows Sign in with a passkey or security key. |
| component | AuthMethodPicker | `apps/web/features/auth/AuthMethodPicker.tsx` | Use a passkey or security key choice after another step. |
| hook | signInWithPasskey | `apps/web/features/auth/IdentityAuthAdapter.tsx` | Discoverable passkey sign-in then finalize. |
| config | authProviderConfig and authProviders | `apps/web/features/auth/authProviderConfig.ts` | Passkey switch inside AGI_AUTH_PROVIDERS. |
| screen | SecuritySection | `apps/web/features/settings/sections/SecuritySection.tsx` | Hosts the Passkeys panel. |
| component | SignInMethodsPanel passkey row | `apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx` | Summary row of passkeys. |
| component | Mobile PasskeysSection | `apps/mobile/src/features/settings/account-security/PasskeysSection.tsx` | List, remove with confirm, open web to add. |
| service | Mobile account-security service | `apps/mobile/src/features/settings/account-security/service.ts` | fetchSignInKeys and removeSignInKey. |
| service | step-up for security changes | `apps/web/features/auth/step-up-fetch.ts` | Recent-verification fetch used by security changes. |
| service | error taxonomy passkey kinds | `packages/client/client-runtime/src/authErrorTaxonomy.ts` | passkey_dismissed and passkey_unrecognized mapping. |
| test | PasskeysPanel test | `apps/web/features/settings/components/Settings/PasskeysPanel.test.tsx` | Panel tests (by name). |
| test | Passkeys identity test | `apps/web/lib/identity/__tests__/Passkeys.test.tsx` | Hook tests (by name). |
| test | Mobile account security tests | `apps/mobile/__tests__/AccountSecurityScreen.test.tsx` | Mobile security screen tests (by name). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web enrol: the browser asks the device to create a passkey; the identity service stores the public key on the account. | device and our servers | apps/web/lib/identity/client.ts:263 |
| The page reads the passkey list from the signed-in user object supplied by the identity service. | outside service | apps/web/lib/identity/client.ts:176-200 |
| Web sign-in: the page starts a discoverable passkey flow; the device proves possession; the session finalizes. | device | apps/web/features/auth/IdentityAuthAdapter.tsx:620-626 |
| Completion page checks account, email, age and Terms. | our servers | apps/web/app/login/complete/page.tsx:69-146 |
| Mobile remove: the app calls our account security route with step-up headers. | our servers | apps/mobile/src/features/settings/account-security/service.ts:317-324; PasskeysSection.tsx:114-122 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Passkey public credential, name, created and last used dates | Identity vendor account record | Read by Web from the user object; read by Mobile through our API | Deleted on Remove. |
| Private key | The person's device or password manager, never ours | By the platform's own passkey sync | Outside our control. |

**Models and providers.** No AI model or inference provider takes part. The platform passkey service is the device operating system or browser.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Enrolment needs a signed-in account. Sign-in needs an account that has a passkey. |
| Permissions | Mobile removal needs step-up verification (apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:114-122). The Web panel checks session ownership around each change (apps/web/features/settings/components/Settings/PasskeysPanel.tsx:121-216). |
| Subscription | none found in the code. |
| Limits and metering | Name length 50 (apps/web/lib/identity/client.ts:157). Other limits: none found in the code. |
| Feature flags | passkey token in AGI_AUTH_PROVIDERS (web). |
| Model compatibility | none found in the code. |
| Provider restrictions | Passkey support depends on browser and device (apps/web/lib/identity/passkey-support.ts:1-3). |
| Local mode | Mobile Local Mode needs no sign-in and the Passkeys row is shown only for Cloud accounts (apps/mobile/src/features/settings/account-security/index.tsx:604-645). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Browser lacks passkey support | Passkey button hidden; Settings add unavailable. | apps/web/features/auth/AuthEmailStep.tsx:70-73, 82; apps/web/lib/identity/client.ts (isSupported in IdentityPasskeysState) |
| Prompt dismissed | passkey_dismissed message; retry offered. | packages/client/client-runtime/src/authErrorTaxonomy.ts:77-79, 219-225 |
| Passkey not recognized | Message to use email instead. | packages/client/client-runtime/src/authErrorTaxonomy.ts:80-82 |
| Passkeys still loading | Panel waits for the user object to settle. | apps/web/lib/identity/client.ts:176-182 |
| Account switched during a change | Panel retires the operation and shows the uncertain-outcome text. | apps/web/features/settings/components/Settings/PasskeysPanel.tsx:121-216; apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:142-143 |
| Mobile step-up cancelled | Nothing changes, no error. | apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:146-148 |
| Mobile removal returns not found | List refreshes silently. | apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:149-152 |
| Mobile server says verification required | Row shows Web and opens the web. | apps/mobile/src/features/settings/account-security/service.ts:298; PasskeysSection.tsx:172-182 |
| Mobile list unavailable | Section hidden or row shows Unavailable, Retry. | apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:134-137, 172-182 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/components/Settings/PasskeysPanel.test.tsx`: Passkeys panel (by name).
- `apps/web/lib/identity/__tests__/Passkeys.test.tsx`: Passkey hook (by name).
- `apps/web/features/auth/__tests__/AuthEmailStep.test.tsx`: Email step including the passkey button (by name; passkey part not confirmed).
- `apps/mobile/__tests__/account-security-service.test.ts`: Mobile account security service (by name).
- `apps/mobile/__tests__/AccountSecurityScreen.test.tsx`: Mobile security screen (by name).
- `apps/web/lib/auth/__tests__/error-taxonomy.test.ts`: Error code mapping (file read at lines 49-52 only; passkey coverage unconfirmed).

**Test scenarios**

- **Add and remove on Web**
  1. Settings, Security, Passkeys, Add a passkey and finish the device prompt.
  2. Rename it.
  3. Press Remove and confirm.
  - Expected: Row appears, renames, then disappears after the warning dialog.
- **Passkey sign-in**
  1. With passkey enabled in configuration, open /login.
  2. Press Sign in with a passkey or security key and approve.
  - Expected: Session opens and the completion page runs; Last used badge shows next time.
- **Dismissed prompt**
  1. Press the passkey button and close the prompt.
  - Expected: A retryable message; email entry still works.
- **Mobile list and remove**
  1. Mobile Cloud mode, Account security, Passkeys and security keys.
  2. Remove a passkey, confirm, pass the step-up.
  - Expected: Dialog first, then the passkey is gone from the list.
- **Desktop**
  1. Desktop, Settings, Security, Add a passkey.
  - Expected: Unknown; record what happens (not verified in this repo).

**Where to look when it fails**

- Error kinds passkey_dismissed, passkey_unrecognized.
- Mobile alert Could not remove <name>.
- Browser console for WebAuthn errors on Web (not in repo).
- Check AGI_AUTH_PROVIDERS in the deployment when the button is missing.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/web/003-authentication-and-onboarding-screens.md)
- Desktop: [70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **Mobile has no native passkey creation or sign-in.** Affects: Mobile. Evidence: apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:262-269; no passkey code in MobileSignIn.tsx. Work needed: Decide scope and build native flows if required.
- **Desktop passkey enrolment and sign-in unverified.** Affects: Desktop. Evidence: No passkey code under apps/desktop/electron; area brief S3.11/S3.12. Work needed: Test on a Desktop build.
- **Passkey sign-in on Web depends on a deployment switch whose production value is unknown.** Affects: Web. Evidence: apps/web/features/auth/authProviderConfig.ts:15-17. Work needed: Check deployment configuration.
- **No check was found that removing the last passkey leaves another way to sign in.** Affects: Web, Mobile. Evidence: apps/web/features/settings/components/Settings/PasskeysPanel.tsx:302-316 shows only a warning; the identities route covers linked identities only (apps/web/app/api/settings/identities/route.ts:26-31). Work needed: Verify in the identity service or add a rule.
- **The brief names AuthMethodPicker.tsx:15 for passkey sign-in, but sign-in itself is the button in AuthEmailStep and the adapter.** Affects: Documentation. Evidence: apps/web/features/auth/AuthEmailStep.tsx:108-129; apps/web/features/auth/IdentityAuthAdapter.tsx:620-626. Work needed: Update the brief.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- F003-01
- F003-05
- file:apps/web/features/settings/components/Settings/PasskeysPanel.tsx
- file:apps/web/lib/identity/client.ts
- file:apps/mobile/src/features/settings/account-security/PasskeysSection.tsx

## Unknown

- Whether passkeys work inside the Desktop window.
- Whether the identity service refuses removing the last passkey when it is the only method.
- Whether the deployment has passkey enabled.
- The exact server route behind the Mobile passkey list.
- Contents of tests marked by name only; none were run.
