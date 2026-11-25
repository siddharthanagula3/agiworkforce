---
id: "F086-03"
type: "feature"
title: "Two-step sign-in and recovery codes"
aliases: ["Two-factor authentication", "2FA", "Authenticator app", "Two-factor sign-in", "Backup codes", "Recovery codes", "S86.04", "S86.05"]
area: "86 Security and connected-access settings"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S86.04", "S86.05"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "file:apps/web/lib/authenticator-enrollment.ts", "file:apps/web/lib/mfa-policy-gate.ts", "api:GET /api/settings/2fa", "api:DELETE /api/settings/2fa", "api:POST /api/settings/2fa/setup", "api:POST /api/settings/2fa/verify", "api:POST /api/settings/2fa/backup-codes", "api:GET /api/settings/2fa/requirement", "table:user_two_factor", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-03 Two-step sign-in and recovery codes

Two-step sign-in adds a code from an authenticator app at every sign-in. Backup codes are one-time spares. The switch AGI_AUTHENTICATOR_ENROLLMENT must be 1 for setup and backup codes; turning off or regenerating needs a recent re-check. Available on web, desktop and phone.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.04](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8604), [S86.05](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8605).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the account holder start authenticator setup, confirm it with a 6-digit code, receive one-time backup codes, replace those codes, and turn two-factor off. A workspace may require two-factor from its members.

**Why it exists.** A password alone is weak. The brief requires a second factor that can be turned on and off, and recovery codes that can be viewed, downloaded and regenerated (doc: knowledge-base/data/area-briefs/086-security-and-connected-access-settings.md, S86.04 and S86.05).

**Who uses it.** Account holders; workspace admins who require two-factor for members.

**Problems it solves**

- Stolen passwords.
- Losing the authenticator app (backup codes).
- Workspace compliance with a two-factor rule.

**Use cases**

- Turn on two-factor and save the codes.
- Regenerate codes after using several.
- Turn two-factor off before moving to a new authenticator.
- A member of a workspace that requires two-factor is told to enroll.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Security, two-factor panel (apps/web/features/settings/sections/SecuritySection.tsx:250; TwoFactorEnrollment.tsx).
- Mobile (Cloud mode): Account security, group 'Two-factor sign-in' with rows 'Authenticator app', 'Set up authenticator app', 'Backup codes', 'Generate new backup codes', 'Turn off two-factor' (TwoFactorSection.tsx:236-280).

**Before you start**

- Signed-in account.
- Server switch AGI_AUTHENTICATOR_ENROLLMENT equal to 1 for setup and backup-code regeneration (apps/web/lib/authenticator-enrollment.ts:5-18).
- A re-check no older than 300 seconds for enable, disable and regenerate (actions.ts:23-34).

**Screens and controls**

- Web: dialogs 'Enable two-factor authentication?', 'Turn off two-factor authentication?', 'Replace your backup codes?' with buttons 'Enable two-factor', 'Turn off two-factor', 'Replace backup codes' (TwoFactorEnrollment.tsx:366-381).
- Web: QR section 'Scan this in your authenticator app', code entry for the current 6-digit code, 'Save your backup codes' with download, copy and print (TwoFactorEnrollment.tsx:292, 530, 607, 416-452).
- Mobile: QR code, 'Open authenticator app', 'Copy setup key', 'Turn on', then codes with 'Copy codes', 'Save or share', 'I saved these codes' (TwoFactorSection.tsx:343-468).
- Mobile hides the whole group unless the server reports enrollment available or two-factor is already on (TwoFactorSection.tsx:129-131).

**Journey**

1. Open Security, press enable, confirm the dialog and pass the re-check.
2. The server returns a setup key and an otpauth link; scan or type it in the authenticator app.
3. Enter the 6-digit code.
4. The server verifies and returns backup codes once; save them.
5. Later: regenerate codes (confirm, re-check, new codes) or turn off (confirm, re-check).

**What the person sees and gets**

- Status line: 'On. Sign-in, turning it off and new backup codes need an authenticator code.' or 'Authenticator apps are temporarily unavailable. Password, passkeys and email codes still protect you.' (TwoFactorEnrollment.tsx:489-494).
- Success: 'Two-factor authentication is now enabled on your account.' or 'Your previous backup codes have been invalidated.' (TwoFactorEnrollment.tsx:525-526).
- Account holder receives a notice for enabled, disabled and regenerated (two-factor-security-events via announceTwoFactorChange).

**Settings**

- Workspace policy 'require two-factor' decides refusals (apps/web/lib/mfa-policy-gate.ts:97-104).
- Session timeout belongs to F086-05.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/settings/2fa returns enabled, backup_codes_ready and enrollment_available (apps/web/app/api/settings/2fa/route.ts:19-31).
- Setup: step-up two_factor.enable, refuses when already enrolled, creates a secret sealed with an envelope, stores a pending row in user_two_factor and returns secret and otpauth_url (setup/route.ts:28-86).
- Verify: pending row must be younger than 30 minutes; wrong code is logged and returns unauthorized; on success the secret and new backup codes are registered with the identity provider, the pending row is deleted and backup codes are returned once (verify/route.ts:63-99).
- If the identity provider refuses, the server says nothing changed (verify/route.ts:31-39).
- Regenerate backup codes: requires enrollment, step-up, replaces codes at the provider, audits and notifies (backup-codes/route.ts:33-74).
- Disable: step-up two_factor.disable, removes the factor at the provider and deletes the local row (2fa/route.ts:33-74).
- GET /api/settings/2fa/requirement tells the phone whether the workspace requires two-factor (requirement/route.ts:10-22).

**Incomplete**

- Backup codes are shown once at creation or regeneration; the phone row 'Backup codes' only says 'Ready' or 'Not set' (TwoFactorSection.tsx:259-265). The brief asks to 'view' codes; no screen shows existing codes again [inferred from the one-time return in verify/route.ts:99].
- Verify route has no step-up of its own; the re-check is taken at setup (setup/route.ts:45-51).

**Present but disconnected or switched off**

- When AGI_AUTHENTICATOR_ENROLLMENT is not 1, setup, verify and regenerate answer 'Authenticator apps and backup codes are temporarily unavailable.' (authenticator-enrollment.ts:7-17). Whether production sets it is unknown.

**Not available**

- SMS two-factor: the Security page states 'SMS MFA is not available' (SecuritySection.tsx:305).
- CLI, VS Code and Chrome have no two-factor settings in the code opened; brief marks them not applicable.

## 4. Required behaviour

**Established requirements**

- The user can turn on a second factor required at sign-in, and turn it off. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.04)
- The user can view, download and regenerate recovery codes. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.05)
- Setup is only possible when AGI_AUTHENTICATOR_ENROLLMENT is 1. (source: apps/web/lib/authenticator-enrollment.ts:5-18)
- The setup key stays usable for 30 minutes. (source: apps/web/app/api/settings/2fa/verify/route.ts:63-68)
- Regenerating makes old codes stop working at once and the person is told. (source: apps/web/app/api/settings/2fa/backup-codes/route.ts:47-72; apps/web/lib/server/step-up/actions.ts:31-34)
- A workspace that requires two-factor can refuse members who have not enrolled. (source: apps/web/lib/mfa-policy-gate.ts:97-104)

**Acceptance criteria**

1. With the switch off, setup returns the 'temporarily unavailable' message and the web panel shows the unavailable text.
2. With the switch on, setup after a fresh re-check returns a secret and link; a 6-digit correct code enables two-factor and returns backup codes once.
3. A wrong code returns 401 'Invalid TOTP code' and writes an invalid_totp_code audit entry.
4. Verifying after 30 minutes returns 'Start the authenticator setup again to get a fresh setup key.'
5. Regenerating after a fresh re-check returns new codes and the old codes no longer work.
6. Turning off without a fresh re-check triggers the step-up prompt; with it, two-factor is off and a notice is sent.
7. On the phone, the group is hidden when enrollment is unavailable and two-factor is off.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Disable on an account that is not enrolled answers success without changes (2fa/route.ts:46-48).
- [inferred] A member of a workspace requiring two-factor gets a 403 MfaRequiredError and the phone shows a banner (WorkspaceMfaBanner.tsx).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer a way to re-show how many backup codes remain.
- [proposed] Add a step-up to verify so the window between setup and verify cannot be used by a hijacked tab.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | TwoFactorEnrollmentPanel | `apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx` | Web setup, verification, backup codes and disable UI. |
| component | TwoFactorPanel | `apps/web/features/settings/components/Settings/TwoFactor.tsx` | Hosts the password editor and session timeout form. |
| hook | useMfaStatus | `apps/web/features/settings/hooks/use-mfa-readers.ts` | Reads status for the availability note. |
| endpoint | GET and DELETE /api/settings/2fa | `apps/web/app/api/settings/2fa/route.ts` | Status and disable. |
| endpoint | POST /api/settings/2fa/setup | `apps/web/app/api/settings/2fa/setup/route.ts` | Starts enrollment. |
| endpoint | POST /api/settings/2fa/verify | `apps/web/app/api/settings/2fa/verify/route.ts` | Confirms the code and returns backup codes. |
| endpoint | POST /api/settings/2fa/backup-codes | `apps/web/app/api/settings/2fa/backup-codes/route.ts` | Regenerates backup codes. |
| endpoint | GET /api/settings/2fa/requirement | `apps/web/app/api/settings/2fa/requirement/route.ts` | Tells whether the workspace requires two-factor for this person. |
| config | AGI_AUTHENTICATOR_ENROLLMENT | `apps/web/lib/authenticator-enrollment.ts` | Environment switch for enrollment availability. |
| service | mfa-policy-gate | `apps/web/lib/mfa-policy-gate.ts` | Blocks or allows by workspace policy and caches enrollment. |
| service | second-factor status | `apps/web/lib/server/step-up/second-factor.ts` | Reads factor state from the identity provider and migrates an earlier enrollment. |
| table | user_two_factor | `apps/web/app/api/settings/2fa/setup/route.ts` | Holds the sealed pending TOTP secret until verification. |
| service | totp-envelope | `apps/web/lib/crypto/totp-envelope.ts` | Seals and opens the TOTP secret. |
| service | announceTwoFactorChange | `apps/web/lib/server/two-factor-security-events.ts` | Audit and notice for enabled, disabled, regenerated, password_changed. |
| component | TwoFactorSection (mobile) | `apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx` | Phone setup, codes, regenerate, turn off. |
| component | WorkspaceMfaBanner | `apps/mobile/src/features/settings/account-security/WorkspaceMfaBanner.tsx` | Phone notice when the workspace requires two-factor. |
| service | Mobile service 2FA calls | `apps/mobile/src/features/settings/account-security/service.ts` | startAuthenticatorSetup, verifyAuthenticatorCode, regenerateBackupCodes, turnOffTwoFactor. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The client asks for status; the server reads factor state from the identity provider. | our servers | 2fa/route.ts:19-31; second-factor.ts:62-77 |
| Setup: re-check, then the server generates a secret, seals it and saves a pending row, returning the key and otpauth link. | our servers | setup/route.ts:45-86 |
| The person types the key or scans the QR in an authenticator app and reads a 6-digit code. | device | TwoFactorEnrollment.tsx:607; TwoFactorSection.tsx:343-364 |
| Verify: the server opens the pending secret, checks the code, generates backup codes, registers the factor with the identity provider, deletes the pending row and returns the codes. | our servers | verify/route.ts:63-99 |
| The identity provider enforces the second factor at later sign-ins. | outside service | verify/route.ts:28 registerSecondFactor [inferred that enforcement is at the provider] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pending TOTP secret (sealed) | table user_two_factor, column totp_secret_enc | Server only | Valid 30 minutes; deleted after verify or disable (verify/route.ts:85; 2fa/route.ts:59). |
| Registered TOTP secret and backup codes | The identity provider | Not applicable | Replaced on regenerate, removed on disable. |
| Backup codes plaintext | Only in the response and on the device the person saves them to | No | Cannot be recovered if lost (TwoFactorEnrollment.tsx:63). |
| Enrollment cache | key-value store, 300 seconds | Server only | Expires (mfa-policy-gate.ts:12). |

**Models and providers.** No AI model or inference provider is involved. The identity provider holds the second factor.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required. Phone needs Cloud mode. |
| Permissions | Account owner only; workspace policy can require enrollment. |
| Subscription | none found in the code. |
| Limits and metering | Rate limits 2fa-setup and 2fa-verify (user scoped). Pending key 30 minutes. Step-up 300 seconds. |
| Feature flags | Environment switch AGI_AUTHENTICATOR_ENROLLMENT (value 1 enables). |
| Model compatibility | Not applicable. |
| Provider restrictions | Needs an identity provider that supports registering a TOTP secret and backup codes (registerSecondFactor). |
| Local mode | Phone in Local mode shows 'Cloud mode required' for two-factor status. No local equivalent. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Enrollment unavailable | Server answers capability unavailable; web shows the temporarily unavailable text; phone hides the group unless already enabled. | authenticator-enrollment.ts:14-17; TwoFactorEnrollment.tsx:494; TwoFactorSection.tsx:131 |
| Already enrolled | Setup returns conflict 'Two-factor authentication is already on. Turn it off before setting up a new authenticator.' | setup/route.ts:38-43 |
| Wrong code | 401 'Invalid TOTP code' and an audit failure. | verify/route.ts:77-81 |
| Setup key expired | 400 asking to start again. | verify/route.ts:63-74 |
| Provider refuses | 503 'Two-factor sign-in cannot be switched on right now. Nothing changed...' | verify/route.ts:31-39 |
| Seal key unavailable | 503 'Authenticator setup is temporarily unavailable...' | setup/route.ts:57-69 |
| Uncertain outcome | Web shows 'We could not confirm the complete two-factor change outcome...' | TwoFactorEnrollment.tsx:63 |
| No authenticator app on phone | Alert 'No authenticator app found' and copy setup key. | TwoFactorSection.tsx:356-358 |
| Print unavailable | Message 'The codes could not be sent to the printer. Download or copy the codes instead.' | TwoFactorEnrollment.tsx:47 |
| Offline | not handled in the code beyond generic error text. | not found in files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/2fa/route.test.ts`: Status and disable.
- `apps/web/app/api/settings/2fa/setup/route.test.ts`: Setup route.
- `apps/web/app/api/settings/2fa/verify/route.test.ts`: Verify route.
- `apps/web/app/api/settings/2fa/backup-codes/route.test.ts`: Backup code regeneration.
- `apps/web/app/api/settings/2fa/requirement/__tests__/route.test.ts`: Requirement route.
- `apps/web/features/settings/components/Settings/TwoFactorEnrollment.test.tsx`: Web enrollment panel.
- `apps/web/features/settings/sections/SecuritySection.2fa.test.tsx`: Security section two-factor behaviour.
- `apps/web/lib/__tests__/mfa-policy-gate.test.ts`: Workspace two-factor policy gate.
- `apps/mobile/__tests__/AuthenticatorQrCode.test.ts`: Phone QR code.
- `apps/mobile/__tests__/AccountSecurityScreen.test.tsx`: Phone screen.

**Test scenarios**

- **Switch off**
  1. Run the server with AGI_AUTHENTICATOR_ENROLLMENT unset.
  2. Call POST /api/settings/2fa/setup.
  - Expected: Capability unavailable message; web panel shows the temporarily unavailable status.
- **Full enrollment**
  1. Set the switch to 1.
  2. Enable, re-check, add the key to an authenticator.
  3. Enter the code.
  - Expected: Success, backup codes shown once, notice sent, GET status enabled true.
- **Expired key**
  1. Start setup.
  2. Wait over 30 minutes.
  3. Submit a code.
  - Expected: Start-again message.
- **Regenerate**
  1. Regenerate codes after a fresh re-check.
  2. Try an old code at sign-in.
  - Expected: New codes shown; old code refused; backup_codes_regenerated notice.
- **Workspace requirement**
  1. Join a workspace requiring two-factor without enrolling.
  2. Open the phone Account security.
  - Expected: Requirement endpoint returns required true and the banner shows.

**Where to look when it fails**

- Log '2FA setup initiated (not yet verified)', '2FA enabled as a sign-in factor', '2FA backup codes regenerated', '2FA disabled successfully'.
- Audit events invalid_totp_code, two_factor_backup_codes_regenerated.
- Log '[mfa-policy] request refused by workspace mfa policy'.
- Table user_two_factor.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/086-security-and-connected-access-settings.md](../../70-qa/test-plans/web/086-security-and-connected-access-settings.md)
- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)
- Mobile: [70-qa/test-plans/mobile/086-security-and-connected-access-settings.md](../../70-qa/test-plans/mobile/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **Brief wants codes viewable; codes are shown once only.** Affects: Web, Desktop, Mobile. Evidence: verify/route.ts:99; TwoFactorSection.tsx:259-265. Work needed: Decide whether once-only display is the intended rule and amend the brief, or add a safe re-display.
- **Availability depends on a server switch that is not shown to be set in production.** Affects: All users. Evidence: authenticator-enrollment.ts:5-12. Work needed: Confirm the production value and record it.
- **No two-factor settings on CLI, VS Code and Chrome.** Affects: Those apps. Evidence: none found. Work needed: Point to web Security or mark not applicable.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- file:apps/web/lib/authenticator-enrollment.ts
- file:apps/web/lib/mfa-policy-gate.ts
- api:GET /api/settings/2fa
- api:DELETE /api/settings/2fa
- api:POST /api/settings/2fa/setup
- api:POST /api/settings/2fa/verify
- api:POST /api/settings/2fa/backup-codes
- api:GET /api/settings/2fa/requirement
- table:user_two_factor
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces

## Unknown

- Whether AGI_AUTHENTICATOR_ENROLLMENT is set to 1 in production.
- Exact enforcement of the second factor at sign-in (done by the identity provider; not traced).
- Whether the Desktop Electron window shows any difference.
- How the phone's enrollment interacts with the provider's own sign-in screens.
- Where assertMfaPolicy is applied beyond lib/api-auth.ts, the mobile intent route and the organization policy route.
