---
id: "F003-07"
type: "feature"
title: "Two-step sign-in and recovery codes"
aliases: ["Two-factor authentication", "2FA", "Authenticator app", "Two-factor sign-in", "Backup codes", "Recovery codes", "Account recovery", "Recover your account", "MFA (brief S3.13 to S3.16)", "/recover page"]
area: "3 Authentication and onboarding screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S3.13", "S3.14", "S3.15", "S3.16"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "table:user_two_factor", "api:POST /api/settings/2fa/setup", "api:POST /api/settings/2fa/verify", "api:POST /api/support/recovery", "F003-01", "F003-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-07 Two-step sign-in and recovery codes

A person can turn on an authenticator app as a second sign-in step, is asked for that code (or a backup code) at sign-in, gets one-time backup codes shown once, and can ask a human to restore access after losing a password, email or second factor. Built on web and desktop; mobile challenge partial.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.13](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s313), [S3.14](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s314), [S3.15](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s315), [S3.16](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s316).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a signed-in person enrol an authenticator app (QR code or typed setup key, confirmed with a six-digit code), receive one-time backup codes, regenerate them, and turn the factor off. At sign-in the identity provider asks for a second factor and the web sign-in screen offers the factors the account has. People who lost a password, an email address or their second factor can file an account-recovery request that a support person completes. [inferred from the files cited below]

**Why it exists.** A password or email code alone can be stolen. A second factor protects the account, and organizations can require it (workspace MFA policy). Recovery exists so a person who loses the factor is not locked out forever, without letting an attacker talk their way in: a human checks the account is theirs (apps/web/app/recover/page.tsx:25-33).

**Who uses it.** Any signed-in account holder (Settings > Security); workspace members whose organization requires MFA; support staff who complete recovery tickets.

**Problems it solves**

- Stolen or guessed passwords alone cannot open the account.
- Losing a phone does not permanently lock the account (backup codes, then human recovery).
- Organizations can require MFA and refuse requests from members who have not enrolled (apps/web/lib/mfa-policy-gate.ts:91-99).
- Enrolment never half-applies: if the identity provider refuses, nothing changes (apps/web/app/api/settings/2fa/verify/route.ts:21-37).

**Use cases**

- A user opens Settings > Security, presses Set up authenticator app, scans the QR code, types the six-digit code, then copies or downloads the backup codes.
- A user with 2FA signs in with email and password, is asked 'Confirm it is you', and enters the authenticator code; if the phone is gone they pick 'Use a backup code'.
- A user lost both device and backup codes, opens /recover?lost=factor, fills the form, and a support person later removes the second factor.
- A member of a workspace that requires MFA is refused until they enrol.

## 2. User experience

**Where to find it**

- Web: Settings > Security page (heading 'Security', 'Sign-in methods, two-factor, passkeys, password and sessions.') with an 'Authenticator app' card (apps/web/features/settings/sections/SecuritySection.tsx:231-250; TwoFactorEnrollment.tsx:485).
- Desktop: the same Security page, because the public Desktop window shows the hosted web app (doc: AGENTS.md section 5).
- Mobile: Settings account security, section titled 'Two-factor sign-in' (apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx:245).
- Recovery: web page /recover titled 'Recover your account' (apps/web/app/recover/page.tsx:25); mobile reset-password screen buttons 'Open Web Account' and 'Lost Your Email or Two-Factor Device?' (apps/mobile/app/(auth)/reset-password.tsx).
- CLI, VS Code, Chrome: no screen of their own; the second factor is entered on the web sign-in page [inferred from device sign-in opening the web approval page, see F003-08].

**Before you start**

- Signed in with a Cloud account.
- Server switch AGI_AUTHENTICATOR_ENROLLMENT must be '1' or enrolment endpoints answer 'Authenticator apps and backup codes are temporarily unavailable.' (apps/web/lib/authenticator-enrollment.ts:5-16).
- A fresh step-up confirmation (requireStepUp) for enabling, regenerating codes and disabling (setup/route.ts:45, backup-codes/route.ts:39, route.ts:50).
- To offer an emailed code as a second factor, the deployment sets AGI_AUTH_MFA_EMAIL_FALLBACK to '1' (apps/web/features/auth/authProviderConfig.ts:8,19).

**Screens and controls**

- Security > Authenticator app card: button 'Set up authenticator app'; QR image (alt 'QR code containing your two-factor setup key'); 'Copy key'; input with placeholder 123456; buttons 'Verify and enable' and cancel (TwoFactorEnrollment.tsx:611-738).
- Backup codes screen: heading 'Save your backup codes', list labelled 'Backup codes', buttons 'Copy codes', 'Download codes' (file agiworkforce-backup-codes.txt), 'Print codes', and a checkbox 'I have saved these backup codes somewhere safe' before it can be dismissed (TwoFactorEnrollment.tsx:530-595, 448).
- When on: buttons 'Generate new backup codes' / 'Replace backup codes' and 'Turn off two-factor', each behind a confirm dialog that names the consequence (TwoFactorEnrollment.tsx:366-381,720-728).
- Sign-in step: heading 'Confirm it is you', code field, 'Continue', alternative buttons 'Use your authenticator app', 'Text me a code instead', 'Email me a code instead', 'Use a backup code', link 'Lost your device and backup codes?' or 'Lost the device with your codes?' to /recover?lost=factor, and 'Use a different email' (apps/web/features/auth/AuthSecondFactorStep.tsx).
- Recovery form: three choices 'My password, and the reset email did not help', 'Access to the email address on the account', 'My two-factor device and backup codes', plus account email, reply email and details fields (AccountRecoveryForm.tsx:18-24).

**Journey**

1. Enrol: open Settings > Security and press 'Set up authenticator app'; the app may ask you to confirm it is you (step-up).
2. Scan the QR code or copy the setup key into the authenticator app.
3. Type the six-digit code and press 'Verify and enable'.
4. Read and save the backup codes (copy, download or print), tick the acknowledgement box and dismiss. The codes are not shown again.
5. Sign in later: enter email and password (or email code); the 'Confirm it is you' step asks for the authenticator code; pick a backup code if the phone is gone.
6. Lost everything: open /recover (also linked from the second-factor step), choose what you lost, fill the form and submit; wait for a person to reply to the address you gave.

**What the person sees and gets**

- After verify: success state with the one-time backup codes (reason 'enabled'); after regenerate: 'Your previous backup codes have been invalidated.' (TwoFactorEnrollment.tsx:520-527).
- Refusal text if the provider will not take the factor: 'Two-factor sign-in cannot be switched on right now. Nothing changed. Try again later or contact support.' (verify/route.ts:33-35).
- Wrong code: 401 'Invalid TOTP code'; stale setup (older than 30 minutes): 'Start the authenticator setup again to get a fresh setup key.' (verify/route.ts:65-80).
- Print failure: 'The codes could not be sent to the printer. Download or copy the codes instead.' (TwoFactorEnrollment.tsx:47).
- Recovery submit: always the same quiet confirmation 'If that address belongs to an account, your request is recorded and a receipt is on its way...' (AccountRecoveryForm.tsx:44-51); a receipt email and a security notice to the account owner follow when a ticket is opened.

**Settings**

- Settings > Security > Authenticator app on/off and backup codes.
- Workspace policy 'require MFA' (organization policy; read by GET /api/settings/2fa/requirement).
- Server environment: AGI_AUTHENTICATOR_ENROLLMENT, AGI_AUTH_MFA_EMAIL_FALLBACK, AGI_AUTH_PROVIDERS (names only; values not read).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web enrolment: POST /api/settings/2fa/setup creates a secret, seals it, stores a pending row (enabled=false) and returns the secret and otpauth URL (apps/web/app/api/settings/2fa/setup/route.ts:57-86).
- Web verification: POST /api/settings/2fa/verify checks the code against the pending row (not older than 30 minutes), creates backup codes, registers the factor and codes with the identity provider, deletes the local pending row, records the enrolment, audits and notifies (verify/route.ts:55-100).
- Backup-code regeneration replaces the old set at the identity provider, needs step-up, audits and notifies the owner (backup-codes/route.ts:39-75).
- Turning off the factor needs step-up and removes it at the identity provider (apps/web/app/api/settings/2fa/route.ts:50-58).
- Sign-in challenge on web: the adapter maps provider factors (totp, phone_code, email_code, backup_code) to authenticator, text message, email, backup code and orders them in that priority; the email factor is hidden unless the deployment allows it (IdentityAuthAdapter.tsx:48-65,170-189).
- Recovery: POST /api/support/recovery (CSRF, rate limit, bot check) always answers 202; a background job looks up the account by email, opens a support ticket, records an identity security event and emails a receipt (apps/web/app/api/support/recovery/route.ts:19-45; apps/web/lib/support/tickets/recovery.ts:32-100).
- Staff completion: completeAccountRecovery removes the second factor or sets a new primary email, ends every other session and writes a critical audit event (recovery.ts:108-175).
- Mobile: can enrol, regenerate codes and turn the factor off through the same web endpoints (apps/mobile/src/features/settings/account-security/service.ts:355-392); sign-in handles an emailed second-factor code natively (MobileSignIn.tsx:223-233).

**Incomplete**

- Mobile sign-in: only the emailed second-factor code is handled by the app's own screens; any other second factor (authenticator, backup code) hands over to the identity provider's built-in sign-in view through onNativeFallback (apps/mobile/src/features/auth/components/MobileSignIn.tsx:223-230; apps/mobile/app/(auth)/login.tsx:364-385). The brief records that this path is not live-tested and the Clerk Dashboard needs Authenticator and Backup codes enabled (brief S3.14).
- The recovery flow is human-completed, so 'restores access' depends on staff action (SupportTicketQueuePanel) and is not instant.
- Accounts with Advanced Account Security get no support ticket; the request is only logged as a security event and they must use a recovery key (recovery.ts:51-58,122-127).

**Present but disconnected or switched off**

- All enrolment endpoints refuse unless the server switch AGI_AUTHENTICATOR_ENROLLMENT equals '1' (lib/authenticator-enrollment.ts:11-17); the Settings card then says 'Authenticator apps are temporarily unavailable. Password, passkeys and email codes still protect you.' (TwoFactorEnrollment.tsx:494). Whether it is set in production is unknown.
- The emailed second factor is off unless AGI_AUTH_MFA_EMAIL_FALLBACK is '1' (authProviderConfig.ts:19-21).

**Not available**

- CLI, VS Code and Chrome have no second-factor screen of their own (no code found in apps/cli/src, apps/extension-vscode/src or apps/extension/src for entering a TOTP code).
- Passkey as a second factor: not part of this feature (passkeys are F003-06).

## 4. Required behaviour

**Established requirements**

- A user can enrol an authenticator (QR plus setup key, confirm code, backup codes) and from then on sign-in asks for that second factor. (source: Brief S3.13)
- At sign-in an account with MFA is challenged for its second factor, with alternatives such as backup codes, before a session is issued. (source: Brief S3.14)
- On enabling or regenerating, the user is shown one-time recovery codes once and can copy, print or download them. (source: Brief S3.15)
- A user who lost password, email or second factor can start and complete an account-recovery flow that restores access. (source: Brief S3.16)
- Enrolment is rejected with a clear message if the identity provider refuses it, and nothing changes. (source: apps/web/app/api/settings/2fa/verify/route.ts:21-37)
- Email is the weakest second factor and is offered beside a stronger one only when the deployment allows it. (source: apps/web/features/auth/IdentityAuthAdapter.tsx:62-65)

**Acceptance criteria**

1. With the server switch on, a signed-in web user can complete setup: QR and setup key shown, a valid six-digit code enables the factor and shows backup codes once.
2. A wrong code returns 'Invalid TOTP code' and leaves 2FA off; a setup older than 30 minutes asks to start again.
3. If the identity provider rejects the factor, the person sees 'Nothing changed' and 2FA stays off.
4. Regenerating codes shows a new list and the previous codes no longer work; the owner is notified.
5. A 2FA account signing in on web must pass the second-factor step before reaching chat; the factor list is ordered authenticator, text message, email (only if allowed), backup code.
6. Submitting /recover for an unknown address gives the same confirmation as for a known one (no account enumeration) and creates no ticket.
7. Support completing a recovery ticket ends all other sessions of that account.
8. With the server switch off, the Settings card says authenticator apps are temporarily unavailable and setup is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile sign-in must eventually complete authenticator and backup-code challenges inside the app or via the provider view without dead ends [inferred from brief S3.14 'partial'].
- The count and format of backup codes should be stated to the user before they are shown [inferred; the exact count was not read from generateBackupCodes].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a live end-to-end test that signs in a 2FA account on mobile with authenticator and with a backup code.
- [proposed] Show recovery ticket status to the requester so they know progress.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | SecuritySection | `apps/web/features/settings/sections/SecuritySection.tsx` | Settings > Security page hosting the authenticator card (web and desktop). |
| component | TwoFactorEnrollmentPanel | `apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx` | Enrol, verify, show/copy/download/print backup codes, regenerate, turn off. |
| endpoint | POST /api/settings/2fa/setup | `apps/web/app/api/settings/2fa/setup/route.ts` | Creates and seals a pending TOTP secret; returns secret and otpauth URL. |
| endpoint | POST /api/settings/2fa/verify | `apps/web/app/api/settings/2fa/verify/route.ts` | Checks the first code, registers factor and backup codes with the identity provider, returns codes once. |
| endpoint | POST /api/settings/2fa/backup-codes | `apps/web/app/api/settings/2fa/backup-codes/route.ts` | Regenerates backup codes (step-up required). |
| endpoint | GET and DELETE /api/settings/2fa | `apps/web/app/api/settings/2fa/route.ts` | Status (enabled, backup_codes_ready, enrollment_available) and turning the factor off. |
| endpoint | GET /api/settings/2fa/requirement | `apps/web/app/api/settings/2fa/requirement/route.ts` | Tells a client whether workspace policy requires MFA from this account. |
| config | AGI_AUTHENTICATOR_ENROLLMENT switch | `apps/web/lib/authenticator-enrollment.ts` | Server switch that turns authenticator enrolment on. |
| service | MFA policy gate | `apps/web/lib/mfa-policy-gate.ts` | Refuses requests from members of workspaces that require MFA and are not enrolled; caches enrolment 300 seconds. |
| hook | useIdentityAuthClient (IdentityAuthAdapter) | `apps/web/features/auth/IdentityAuthAdapter.tsx` | Maps provider second factors to screens, orders them, gates the emailed factor. |
| screen | AuthSecondFactorStep | `apps/web/features/auth/AuthSecondFactorStep.tsx` | Sign-in 'Confirm it is you' screen with alternatives and recovery link. |
| config | authProviderConfig | `apps/web/features/auth/authProviderConfig.ts` | Reads AGI_AUTH_PROVIDERS and AGI_AUTH_MFA_EMAIL_FALLBACK. |
| screen | Recover page | `apps/web/app/recover/page.tsx` | Public /recover page; preselects what was lost from ?lost=. |
| component | AccountRecoveryForm | `apps/web/features/auth/AccountRecoveryForm.tsx` | Form that posts the recovery request. |
| endpoint | POST /api/support/recovery | `apps/web/app/api/support/recovery/route.ts` | Accepts a recovery request (202), files it in the background. |
| service | submitAccountRecoveryRequest / completeAccountRecovery | `apps/web/lib/support/tickets/recovery.ts` | Opens the ticket, emails receipt; staff completion removes factor or changes email and ends sessions. |
| endpoint | Staff recovery completion route | `apps/web/app/api/support/staff/tickets/[ticketId]/recovery/route.ts` | Staff action that completes a recovery ticket. |
| table | user_two_factor | `apps/web/db/neon/0025_two_factor.sql` | Holds the pending sealed secret during enrolment (deleted once the provider takes the factor). |
| screen | Mobile TwoFactorSection | `apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx` | Mobile enrol and manage UI titled 'Two-factor sign-in'. |
| service | Mobile account-security service | `apps/mobile/src/features/settings/account-security/service.ts` | Calls the 2fa endpoints from the phone. |
| screen | MobileSignIn | `apps/mobile/src/features/auth/components/MobileSignIn.tsx` | Handles emailed second-factor code; falls back for other factors. |
| screen | Mobile reset-password screen | `apps/mobile/app/(auth)/reset-password.tsx` | Buttons that open web sign-in and /recover. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses 'Set up authenticator app'; the page calls POST /api/settings/2fa/setup after a step-up check. | device and our servers | apps/web/app/api/settings/2fa/setup/route.ts:45-86 |
| Server makes a TOTP secret, seals it, stores a pending row with enabled=false and returns the secret and otpauth URL; the page draws the QR code. | our servers | setup/route.ts:57-86; TwoFactorEnrollment.tsx:611 |
| Person types the first code; POST /api/settings/2fa/verify opens the pending row (30-minute window) and checks the code. | our servers | verify/route.ts:62-80 |
| Server generates backup codes and registers the secret and codes with the identity provider; if refused, answers 503 and changes nothing. | outside service | verify/route.ts:21-37,83-84 |
| Server deletes the pending row, caches enrolment for 300 seconds, writes an audit event, notifies the owner, returns codes once. | our servers | verify/route.ts:85-100; mfa-policy-gate.ts:11,43-56 |
| At sign-in the identity provider reports it needs a second factor; the page orders the offered factors and asks for a code. | outside service | IdentityAuthAdapter.tsx:376-392 |
| Recovery request: form posts to /api/support/recovery; server answers 202 at once and a background task files a ticket. | our servers | apps/web/app/api/support/recovery/route.ts:37-45 |
| Support staff completes the ticket; server removes the second factor or sets the new email at the identity provider and ends other sessions. | our servers | recovery.ts:129-157 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pending TOTP secret (sealed) and empty backup-code list during enrolment | table:user_two_factor (apps/web/db/neon/0025_two_factor.sql:6-16) | Server only | Deleted when the provider accepts the factor (verify/route.ts:85); replaced if setup is started again (setup/route.ts:72-82). |
| Active authenticator secret and backup codes | The identity provider (registerSecondFactor call); exact storage there is not visible in this repo | Held by the provider | Removed on 'Turn off two-factor' or staff recovery (removeSecondFactor). |
| Enrolment cache flag mfa-enrolled:<userId> | Key-value store (lib/mfa-policy-gate.ts:11-12) | Server only | Expires after 300 seconds. |
| Recovery request ticket (account email, reply email, details) | Support ticket store via openTicket (apps/web/lib/support/tickets/store.ts; table name not read) | Server only | Kept as a ticket; retention not read (unknown). |
| Security events and audit rows (2FA enabled/disabled, backup codes regenerated, recovery requested/completed) | Audit and identity-event stores (recordAuditEvent, emitIdentitySecurityEvent) | Server only | Retention not read (unknown). |
| Backup codes shown to the person | Page memory only until copied, downloaded or printed by the person | Not stored by the page | Cannot be recovered if lost (TwoFactorEnrollment.tsx:63). |

**Models and providers.** No AI model or inference provider takes part. The identity provider (Clerk) holds the factor and runs the sign-in challenge; no model traffic goes through this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in Cloud account is required to enrol, regenerate or turn off. Recovery is public (no sign-in) so people who are locked out can use it. |
| Permissions | Enrol and manage are limited to the signed-in user's own account (getSessionAccountDb with TWO_FACTOR_SCOPE). Completing a recovery ticket needs support-staff rights (readTicketForStaff). Workspace owners can require MFA through organization policy. |
| Subscription | none found in the code. The 2fa routes read no plan or entitlement. |
| Limits and metering | Rate limits: '2fa-setup' on setup, '2fa-verify' (per user) on verify, regenerate and disable, 'me' on status, 'support-handoff-create' on recovery. Limit values live in configuration not read. Setup expires after 30 minutes. No usage metering. |
| Feature flags | AGI_AUTHENTICATOR_ENROLLMENT must be '1'; AGI_AUTH_MFA_EMAIL_FALLBACK '1' allows the emailed second factor; AGI_AUTH_PROVIDERS selects sign-in providers. Values in production unknown. |
| Model compatibility | Not applicable: no model is involved. |
| Provider restrictions | Depends on the identity provider accepting the factor (Clerk Dashboard must have Authenticator and Backup codes enabled for the mobile native view, per brief S3.14). |
| Local mode | Local mode on mobile and desktop needs no account, so no second factor applies there. The second factor only guards sign-in to Cloud (mode:cloud). Local inference stays free of any subscription. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading status | Card text says 'Your current authenticator status has not been confirmed.' while status is unknown, with a status error alert. | TwoFactorEnrollment.tsx:489-505 |
| Feature switched off | Card says authenticator apps are temporarily unavailable; endpoints throw capabilityUnavailable. | TwoFactorEnrollment.tsx:494; lib/authenticator-enrollment.ts:11-17 |
| Already enrolled when setting up | 409 'Two-factor authentication is already on. Turn it off before setting up a new authenticator.' | setup/route.ts:36-42 |
| Stale or missing setup | 400 'Start the authenticator setup again to get a fresh setup key.' | verify/route.ts:72-77 |
| Provider refuses | 503 with 'Nothing changed' text; logged. | verify/route.ts:21-37 |
| Outcome of a change unclear | Page says it could not confirm the complete two-factor change outcome and asks the person to check sign-in settings before another change. | TwoFactorEnrollment.tsx:63 |
| Print or download blocked | Messages tell the person to copy or download instead. | TwoFactorEnrollment.tsx:47,452 |
| QR image fails | Text says add the account manually with the setup key. | TwoFactorEnrollment.tsx:618 |
| Recovery for unknown, deleted or protected account | Same 202 and same message; no ticket for unknown or deleted accounts; protected (Advanced Account Security) accounts only get a security event. | recovery.ts:42-58; AccountRecoveryForm.tsx:44-51 |
| Recovery rate limited | Form says 'Too many requests from this network. Wait a while and try again.' | AccountRecoveryForm.tsx:73-77 |
| Offline or timeout on enrolment | not handled in the code beyond the generic request error messages shown by the panel; no offline queue found. | searched TwoFactorEnrollment.tsx |
| Mobile second factor other than email | Hands over to the provider's native sign-in view. | MobileSignIn.tsx:223-230 |
| Accessibility | Second-factor field uses one-time-code autocomplete, error uses role alert; backup code list has aria-label 'Backup codes'. | AuthSecondFactorStep.tsx:83-100; TwoFactorEnrollment.tsx:537 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/2fa/route.test.ts`: Status and disable route.
- `apps/web/app/api/settings/2fa/setup/route.test.ts`: Setup route.
- `apps/web/app/api/settings/2fa/verify/route.test.ts`: Verify route, including identity provider refusal.
- `apps/web/app/api/settings/2fa/backup-codes/route.test.ts`: Backup-code regeneration.
- `apps/web/app/api/settings/2fa/requirement/__tests__/route.test.ts`: Workspace MFA requirement route.
- `apps/web/features/settings/components/Settings/TwoFactorEnrollment.test.tsx`: Enrolment panel behaviour.
- `apps/web/features/auth/__tests__/AuthSecondFactorStep.test.tsx`: Second-factor screen.
- `apps/web/features/auth/__tests__/IdentityAuthAdapter.test.tsx`: Factor mapping and ordering, including the email-fallback option.
- `apps/web/lib/__tests__/mfa-policy-gate.test.ts`: Workspace MFA policy gate.
- `apps/web/lib/server/__tests__/two-factor-security-events.test.ts`: Owner notices on 2FA changes.
- `apps/web/app/api/support/staff/tickets/[ticketId]/recovery/__tests__/route.test.ts`: Staff recovery completion route.
- `apps/web/e2e/public-account-pages.spec.ts`: Browser test that /recover preselects the lost item from the link.
- `apps/mobile/__tests__/account-security-service.test.ts`: Mobile account-security service calls.
- `apps/mobile/__tests__/AuthenticatorQrCode.test.ts`: Mobile QR encoding for the setup key.
- `apps/mobile/__tests__/MobileSignInRememberedAccount.test.tsx`: Mobile sign-in screen including the native fallback callback.

**Test scenarios**

- **Enrol and save codes (web)**
  1. Set AGI_AUTHENTICATOR_ENROLLMENT to 1 on a test server.
  2. Sign in, open Settings > Security, press 'Set up authenticator app'.
  3. Scan the QR, enter the code, press 'Verify and enable'.
  4. Copy, download and print the codes; tick the box and dismiss.
  - Expected: 2FA shows On; codes shown once and not recoverable after dismissing; owner receives a notice.
- **Challenge at sign-in**
  1. Sign out.
  2. Sign in with password.
  3. Enter the authenticator code; repeat using 'Use a backup code'.
  - Expected: Session is issued only after the second factor; a used backup code does not work twice.
- **Regenerate replaces**
  1. Press 'Generate new backup codes', confirm.
  2. Try an old code at sign-in.
  - Expected: Old code is refused; new code works.
- **Provider refusal**
  1. Make the identity provider reject registerSecondFactor in a test environment.
  2. Run verify with a correct code.
  - Expected: 503 message with 'Nothing changed'; Settings still shows Off.
- **Recovery request**
  1. Open /recover?lost=factor.
  2. Submit with a known and then an unknown account email.
  - Expected: Identical confirmation both times; only the known, unprotected account has a ticket and a receipt email.
- **Mobile second factor (live)**
  1. Enable Authenticator and Backup codes in the identity provider dashboard.
  2. Sign in on a phone with a 2FA account using the authenticator code, then a backup code.
  - Expected: Sign-in completes via the native view; no file records a result yet.

**Where to look when it fails**

- Log '2FA verify: the identity provider refused the authenticator' and 'invalid TOTP code' (verify/route.ts).
- Error code MFA_REQUIRED with reason mfa_required from the policy gate (lib/mfa-policy-gate.ts:21-26).
- Log '[support-recovery] a recovery request could not be filed' and '[support-recovery] requester was not emailed a receipt'.
- Table user_two_factor for stuck pending enrolments; audit events two_factor_backup_codes_regenerated and account_recovery_completed.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/web/003-authentication-and-onboarding-screens.md)
- Desktop: [70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **Mobile authenticator/backup-code sign-in is not handled by the app's own screens and has not been live-tested.** Affects: Mobile users with 2FA.. Evidence: apps/mobile/src/features/auth/components/MobileSignIn.tsx:223-230; brief S3.14 Unfinished.. Work needed: Enable the factors in the identity provider dashboard, then run a live second-factor sign-in on a device; decide whether to build native screens.
- **Enrolment depends on a server switch whose production value is unknown; if off, nobody can enrol.** Affects: Web, desktop, mobile.. Evidence: apps/web/lib/authenticator-enrollment.ts:5-16.. Work needed: Confirm the switch value per environment and record it in the owning runbook.
- **CLI, VS Code and Chrome rely on the web page for the second factor; no in-app test shows this working.** Affects: CLI, VS Code, Chrome.. Evidence: No second-factor code in apps/cli/src, apps/extension-vscode/src, apps/extension/src.. Work needed: Add a device-sign-in test with a 2FA account on each.
- **Recovery is manual and the requester cannot see status.** Affects: Locked-out users on every app.. Evidence: apps/web/lib/support/tickets/recovery.ts:129-157.. Work needed: Define a service level and add status feedback (proposal).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- table:user_two_factor
- api:POST /api/settings/2fa/setup
- api:POST /api/settings/2fa/verify
- api:POST /api/support/recovery
- F003-01
- F003-08

## Unknown

- Whether AGI_AUTHENTICATOR_ENROLLMENT and AGI_AUTH_MFA_EMAIL_FALLBACK are set in production.
- How many backup codes generateBackupCodes creates (function not opened).
- Name and retention of the support ticket and audit tables.
- Whether the identity provider Dashboard currently has Authenticator and Backup codes enabled.
- How CLI, VS Code and Chrome behave in practice for a 2FA account (no test or code found).
