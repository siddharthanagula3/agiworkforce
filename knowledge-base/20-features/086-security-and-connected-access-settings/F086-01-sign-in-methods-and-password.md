---
id: "F086-01"
type: "feature"
title: "Sign-in methods and password"
aliases: ["Sign-in methods panel", "Authentication methods", "Password management", "Change password", "Set a password", "Add or remove a sign-in method", "S86.01", "S86.02"]
area: "86 Security and connected-access settings"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S86.01", "S86.02"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "file:apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx", "file:apps/web/app/api/settings/identities/route.ts", "file:apps/web/app/api/settings/password/route.ts", "api:GET /api/settings/identities", "api:DELETE /api/settings/identities", "api:POST /api/settings/password", "table:identities", "SYS-authentication-and-identity", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-01 Sign-in methods and password

Settings, Security on web (and desktop, which shows the web page) lists every way the account can sign in, lets the person remove one, and changes the password. Removal and some password changes need a fresh re-check. The phone lists methods and changes the password but sends add and remove to the web.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.01](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8601), [S86.02](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8602).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the email address, the password state, passkeys, connected social accounts and other linked sign-in identities of the account. Lets the person connect or disconnect a social account, remove a linked identity, and set or change the password. A password change signs out every other session and device credential.

**Why it exists.** A person must be able to see and control every door into the account, and to cut off a method they no longer trust. The brief states the requirement: see every way to sign in and add or remove methods; change the password with the current password or a recent re-check (doc: knowledge-base/data/area-briefs/086-security-and-connected-access-settings.md, S86.01 and S86.02).

**Who uses it.** Any signed-in account holder using the Web app, the Desktop app (which shows the hosted web screens) or the Mobile app in Cloud mode.

**Problems it solves**

- Not knowing which sign-in methods can reach the account.
- Removing a method that was lost or is no longer trusted.
- Locking oneself out by removing the last method (blocked by the server).
- A stolen password staying useful on other devices after it is changed (other sessions and device credentials are ended).

**Use cases**

- After losing access to a social account, the person removes that linked identity.
- The person sets a password on an account that only had social sign-in.
- The person suspects the password leaked, changes it, and every other device is signed out.
- On the phone the person reviews which methods exist and opens the web page to add one.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Security, panel 'Sign-in methods' (apps/web/features/settings/sections/SecuritySection.tsx:241-244). The Password editor is inside the two-factor panel below it (SecuritySection.tsx:264-275).
- Mobile (Cloud mode): Settings, Account security. Rows 'Sign-in methods', 'Add or remove a sign-in method' (value 'Web') and 'Change password' or 'Set a password' (apps/mobile/src/features/settings/account-security/index.tsx:629-650 region).
- CLI, VS Code, Chrome: no settings screen for this was found in the code opened.

**Before you start**

- A signed-in account. Mobile needs Cloud mode; otherwise rows read 'Cloud mode required' (account-security/index.tsx, signInMethods rows).
- Removing a method or changing a password in some cases needs a fresh re-check, answered in a step-up prompt (apps/web/lib/server/step-up/actions.ts:35-38, 43-47).

**Screens and controls**

- Web 'Sign-in methods' panel: rows 'Email address', 'Password' (button 'Change' or 'Add'), 'Passkeys', one row per configured social provider with 'Connect' or 'Disconnect', and linked-identity rows with 'Remove' (SignInMethodsPanel.tsx:540-612 region).
- Linked-identity rows appear only when the account has more than one linked identity and show 'Added <date> · Last used <date>' or 'Not used yet' (SignInMethodsPanel.tsx:599-612).
- Confirm dialog before removal, then a step-up prompt; buttons 'Refresh sign-in methods' and 'I have reviewed my sign-in methods' appear after an uncertain outcome (SignInMethodsPanel.tsx:630-660 region).
- Web PasswordEditor: current password (when one is set), new password of at least 8 characters, submit (PasswordEditor.tsx; server limit apps/web/app/api/settings/password/route.ts:24-29).
- Mobile: ChangePasswordModal with a minimum length check (ChangePasswordModal.tsx:41-48).

**Journey**

1. Open Settings, Security.
2. Read the list. Each linked identity shows when it was added and last used.
3. To remove one, press 'Remove', confirm in the dialog, and complete the re-check if asked.
4. To change the password, press 'Change' on the Password row (it focuses the password form), enter the current password and a new one, submit.
5. If a re-check is required the step-up prompt opens first; then the change runs.
6. Other devices are signed out; the person sees a toast 'Password changed. Your other devices were signed out.' (PasswordEditor.tsx:180).

**What the person sees and gets**

- Removal: the row disappears; the server answers {removed: id} (identities/route.ts:116).
- Refusals in words: 'This is the only way left to sign in. Add another sign-in method before removing this one.' and 'This is the sign-in method the account is registered under, so it cannot be removed...' (identities/route.ts:26-31).
- Password success toast; partial failure shows the 503 message 'Your password was changed, but signing out your other devices did not finish. End your other sessions in Settings to finish.' (password/route.ts:107-114).
- A security notice is sent to the account holder when a method is removed or the password changes (identities/route.ts:103-114; password/route.ts:98-105).

**Settings**

- Session timeout (Web 'Security' form; mobile 'Session timeout' row cycling 15, 30, 60, 120, 480 minutes) belongs to F086-05.
- Help link 'How account security works' (SecuritySection.tsx:237).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web list of identities from table identities with creation source, created time and last authenticated time (apps/web/lib/server/identity-links.ts:29-36, 85-93).
- Web unlink with server rules: unknown id gives 404, primary identity and last remaining identity are refused (identity-links.ts:101-130; identities/route.ts:75-97).
- Unlink needs step-up action identity.unlink, 300 seconds (actions.ts:35-38; identities/route.ts:66-73).
- Connect and disconnect of social accounts through the identity provider client (SignInMethodsPanel.tsx:440-475).
- Password change route with current-password check, conditional step-up, other-session and device-credential revocation, and audit/notice (password/route.ts:31-122).
- Mobile lists identities with 'Last used <date>' or 'Linked' (account-security/index.tsx sign-in rows) and changes the password through the same route with step-up password.change (index.tsx:~320-345; service.ts:189-205).

**Incomplete**

- Mobile cannot add or remove a sign-in method; the row opens the web Security page (account-security/index.tsx:629-635).
- 'Last used' is only shown for linked-identity rows when there is more than one identity; the Email and Password rows show no last-used time (SignInMethodsPanel.tsx:599-612).
- The brief says reset a forgotten password is part of S86.02; no reset flow was found in the files opened (unknown).

**Present but disconnected or switched off**

- None found for this feature.

**Not available**

- CLI, VS Code and Chrome have no sign-in methods or password screen in the code opened (brief: vscode and chrome missing).
- Trusted devices that skip checks: none exist; the Security page states 'no device skips the sign-in checks' (SecuritySection.tsx:305).

## 4. Required behaviour

**Established requirements**

- The user can see every way they can sign in (password, passkeys, social/SSO identities) and add or remove methods. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.01)
- The user can change their password with the current password or a recent re-authentication, and reset a forgotten one. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.02)
- The last sign-in method and the primary sign-in method cannot be removed. (source: apps/web/app/api/settings/identities/route.ts:26-31)
- Removing a method needs a re-check no older than 300 seconds. (source: apps/web/lib/server/step-up/actions.ts:35-38)
- With a password set and no second factor the current password is enough; otherwise a recent re-check is also needed. (source: apps/web/app/api/settings/password/route.ts:50-61)
- After a password change every other session and device credential is ended; if that partly fails the person gets a 503 message. (source: apps/web/app/api/settings/password/route.ts:81-114)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Every identity of the account appears on Security with an added date and a last-used date or 'Not used yet'.
2. Removing the only remaining identity returns the 'only way left to sign in' message and nothing is deleted.
3. Removing the primary identity returns the 'registered under' message.
4. Removing a removable identity asks for confirmation, then a re-check older than 300 seconds triggers the step-up prompt, then the row disappears and an identity_unlinked notice is sent.
5. A new password shorter than 8 characters is refused; a wrong current password gives 'Your current password is not correct.'.
6. After a successful password change the other sessions in the session list are gone and device credentials are revoked.
7. On the phone the 'Add or remove a sign-in method' row opens the web Security page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A removed linked identity should also stop working for sign-in at once; the server deletes the mapping row and clears the identity cache (identities/route.ts:99).
- [inferred] The Desktop app has no separate code for this; it shows the web screens (doc: AGENTS.md section 5).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show last-used time on the Email and Password rows too.
- [proposed] Let the phone remove a linked identity in the app with the same step-up used for sessions.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | SecuritySection | `apps/web/features/settings/sections/SecuritySection.tsx` | Page that hosts the panels, the password editor and the sessions panel. |
| component | SignInMethodsPanel | `apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx` | Lists methods, connect, disconnect, remove with confirm and step-up. |
| component | PasswordEditor | `apps/web/features/settings/components/Settings/PasswordEditor.tsx` | Form that changes or sets the password. |
| hook | useSignInIdentities | `apps/web/features/settings/components/Settings/useSignInIdentities.test.tsx` | Hook under test that loads identities (test file shown as the only located reference). |
| endpoint | GET and DELETE /api/settings/identities | `apps/web/app/api/settings/identities/route.ts` | List identities and unlink one under step-up, CSRF and rate limits. |
| service | identity-links | `apps/web/lib/server/identity-links.ts` | SQL for list and locked unlink; primary and last-method rules. |
| table | identities | `apps/web/lib/server/identity-links.ts` | Rows with provider, subject, creation_source, created_at, last_authenticated_at per user. |
| endpoint | POST /api/settings/password | `apps/web/app/api/settings/password/route.ts` | Changes the password and revokes other sessions and device credentials. |
| config | STEP_UP_ACTIONS identity.unlink and password.change | `apps/web/lib/server/step-up/actions.ts` | Freshness windows (300 s) and consequence text. |
| service | requireStepUp | `apps/web/lib/server/step-up-auth.ts` | Reads the x-step-up-token header and refuses with StepUpRequiredError when missing or stale. |
| service | readSecondFactorStatus | `apps/web/lib/server/step-up/second-factor.ts` | Decides whether a second factor exists, to choose the re-check level. |
| service | revokeEveryOtherSession and revokeEveryDeviceRefreshCredential | `apps/web/lib/server/session-revocation.ts` | Ends other identity sessions; device credentials are revoked in refresh-token-family.ts. |
| service | handleIdentitySecurityEvent | apps/web/lib/services/identity-events.ts (not found) (not found) | Audit and notice for identity_unlinked and related events (called at identities/route.ts:103). |
| hook | useStepUp | apps/web/features/settings/hooks/useStepUp.ts (not found) (not found) | Client hook that runs a request with a step-up prompt. |
| screen | Mobile Account security | `apps/mobile/src/features/settings/account-security/index.tsx` | Lists methods, password row, opens web for add or remove. |
| component | ChangePasswordModal | `apps/mobile/src/features/settings/account-security/ChangePasswordModal.tsx` | Phone password form. |
| service | Mobile account-security service | `apps/mobile/src/features/settings/account-security/service.ts` | fetchSignInMethods and changeAccountPassword calls to the web API. |
| service | Mobile step-up | `apps/mobile/src/features/auth/services/stepUp.ts` | Phone step-up prompt for password.change and session.revoke_all. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The web page loads the identity list and provider list from the server. | our servers | apps/web/app/api/settings/identities/route.ts:33-45 |
| The person presses Remove and confirms; the browser sends DELETE with a CSRF token and an optional step-up token. | device | apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:369-396 |
| The server checks CSRF, rate limit, input shape, then step-up, then runs the locked delete that refuses the last or primary identity. | our servers | identities/route.ts:47-97; identity-links.ts:101-130 |
| The server clears the identity cache and emits the identity_unlinked event, which audits and notifies the holder. | our servers | identities/route.ts:99-114 |
| Connect and Disconnect of a social account run through the identity provider's own client library in the browser. | outside service | SignInMethodsPanel.tsx:440-475 (uses the provider client; exact provider calls not traced) |
| A password change: the server loads the user from the identity provider, verifies the current password with it, sets the new password there, then sweeps other sessions and device credentials. | device and our servers | password/route.ts:43-87 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Identity mapping rows (provider, subject, creation source, timestamps) | table identities in the product database | Server only; clients read through /api/settings/identities | The row is deleted on unlink (identity-links.ts UNLINK). |
| The password itself | The identity provider; the product stores no password in the routes read | Not applicable | Replaced on change (password/route.ts:75). |
| Audit events and security notices | audit and notification stores written by recordAuditEvent and the identity event service | Server only | Retention not established in the files read (unknown). |

**Models and providers.** No AI model or inference provider takes part. The identity provider (account and password service) takes part. Local inference is unaffected.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account is required on every app. Mobile also needs Cloud mode. |
| Permissions | The caller must be the account owner (user-scoped database). Workspace roles are not consulted in the routes read. |
| Subscription | none found in the code (no plan check in identities or password routes). |
| Limits and metering | Rate limits named settings-identities-list, settings-identity-unlink and auth-password-reset (identities/route.ts:34,53; password/route.ts:63). Password length 8 to 256 (password/route.ts:26-27). Step-up freshness 300 seconds. |
| Feature flags | none found in the code for this feature. |
| Model compatibility | Not applicable. |
| Provider restrictions | Depends on the identity provider configuration: the list of connectable social providers comes from configuredAuthProviders() (identities/route.ts:42). |
| Local mode | Mobile in Local mode shows 'Cloud mode required' and offers no change. The feature is account-bound and has no Local equivalent. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | A spinner labelled 'Loading sign-in methods' shows until identities, passkeys and provider data load. | SignInMethodsPanel.tsx:540 |
| Load error | An alert shows the load error text. | SignInMethodsPanel.tsx:660-670 region |
| Only one identity | The linked rows are not rendered (linked.length > 1 needed) and the server also refuses removal. | SignInMethodsPanel.tsx:598; identity-links.ts:129 |
| Uncertain outcome | If the result of a removal cannot be confirmed the panel blocks changes and offers 'Refresh sign-in methods' and 'I have reviewed my sign-in methods'. | SignInMethodsPanel.tsx:155, 630-660 region |
| Concurrent unlink | The delete locks all identity rows so a second unlink counts what is left. | identity-links.ts:38-46 |
| Step-up cancelled | A cancelled prompt shows no error on the Log-out-all path; same helper isStepUpCancelled is used for removal. | SecuritySection.tsx:78 |
| Password change partly fails | 503 message tells the person to end other sessions in Settings. | password/route.ts:107-114 |
| Account not yet loaded | Password editor says 'Your account must finish loading before you can manage your password.' | PasswordEditor.tsx:319 |
| Offline or timeout | not handled in the code beyond the generic error text. | not found in the files read |
| Empty state | The Email row always shows; 'No email address on this account' when none. | SignInMethodsPanel.tsx:545-548 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/identities/route.test.ts`: List and unlink route behaviour.
- `apps/web/app/api/settings/password/__tests__/route.test.ts`: Password change route.
- `apps/web/features/settings/components/Settings/SignInMethodsPanel.test.tsx`: Sign-in methods panel rendering and actions.
- `apps/web/features/settings/components/Settings/SignInMethodsPanel.ownership.test.tsx`: Account-switch ownership guards of the panel.
- `apps/web/features/settings/components/Settings/PasswordEditor.ownership.test.tsx`: Password editor ownership and outcome handling.
- `apps/web/features/settings/components/Settings/useSignInIdentities.test.tsx`: Identities loading hook.
- `apps/mobile/__tests__/AccountSecurityScreen.test.tsx`: Phone Account security screen.
- `apps/mobile/__tests__/account-security-service.test.ts`: Phone service calls.
- `apps/web/e2e/step-up.spec.ts`: Step-up flow end to end (contents not opened).

**Test scenarios**

- **Remove the last method**
  1. Use an account with one identity.
  2. Call DELETE /api/settings/identities with that id after a fresh re-check.
  - Expected: 400 with 'This is the only way left to sign in...'; row still present; a denied audit event is written.
- **Remove a linked identity**
  1. Use an account with two identities where the target is not primary.
  2. Press Remove, confirm, pass the re-check.
  - Expected: Row disappears; account holder receives a notice; list reload no longer shows it.
- **Change password with a second factor on**
  1. Enable two-factor.
  2. Change password with the current password.
  - Expected: A step-up prompt appears first; after success other sessions are ended.
- **Short password**
  1. Submit a 7-character new password.
  - Expected: Validation refusal; password unchanged.
- **Phone add or remove**
  1. Open Account security in Cloud mode.
  2. Press 'Add or remove a sign-in method'.
  - Expected: The web Security page opens in the browser.

**Where to look when it fails**

- Log line 'Password changed; other session and device revocation attempted' with endedCount and failedCount (password/route.ts:88-96).
- Audit event identity_unlinked with outcome denied and reason last_sign_in_method or primary_sign_in_method.
- Error 'invalid_current_password' via logAuthFailure.
- Table identities for the user's rows.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/086-security-and-connected-access-settings.md](../../70-qa/test-plans/web/086-security-and-connected-access-settings.md)
- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)
- Mobile: [70-qa/test-plans/mobile/086-security-and-connected-access-settings.md](../../70-qa/test-plans/mobile/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **Phone cannot add or remove a sign-in method.** Affects: Mobile users. Evidence: apps/mobile/src/features/settings/account-security/index.tsx:629-635. Work needed: Decide whether in-app management is required; the identities API and step-up already exist.
- **No forgotten-password reset found in the settings area although the brief requires it.** Affects: All apps. Evidence: Brief S86.02; no reset route in files opened. Work needed: Confirm where reset lives (sign-in screens) and record it, or add it.
- **CLI, VS Code and Chrome have no equivalent screen or pointer to the web page.** Affects: CLI, VS Code, Chrome. Evidence: Brief status vscode and chrome missing; none found in code opened. Work needed: Add a link to Security settings or mark not applicable.
- **Last-used time is hidden for the Email and Password rows and for a single identity.** Affects: Web and Desktop. Evidence: SignInMethodsPanel.tsx:598-612. Work needed: Show last-used for every row if the data exists.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- file:apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx
- file:apps/web/app/api/settings/identities/route.ts
- file:apps/web/app/api/settings/password/route.ts
- api:GET /api/settings/identities
- api:DELETE /api/settings/identities
- api:POST /api/settings/password
- table:identities
- SYS-authentication-and-identity
- SYS-security-and-privacy

## Unknown

- Where a forgotten password is reset (sign-in screens were not opened).
- What the Desktop Electron build does differently, if anything, for these panels.
- Retention period of audit events and notices.
- Exact lines of the sign-in methods section in the phone screen beyond the ranges cited.
- Whether the identity provider imposes its own password rules beyond the 8-character minimum.
