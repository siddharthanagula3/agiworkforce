---
id: "F086-04"
type: "feature"
title: "Advanced Account Security"
aliases: ["Advanced Account Security", "AAS", "Hardened account-security mode", "Recovery keys", "S86.26"]
area: "86 Security and connected-access settings"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S86.26"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "F086-02", "F086-05", "F086-06", "file:apps/web/lib/server/account-security/service.ts", "file:packages/contracts/cloud-contracts/src/account-security.ts", "api:POST /api/account-security/enrollment", "api:DELETE /api/account-security/enrollment", "table:account_security_enrollments", "table:account_security_credentials", "SYS-authentication-and-identity", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-04 Advanced Account Security

An optional stricter mode. After at least two passkeys or security keys, saved recovery keys, an emailed code and a passkey confirmation, every sign-in needs a passkey or security key and email recovery stops. Turning on signs out other devices. It is managed on web and desktop; the phone only opens the web page.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.26](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8626).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Enrolls the account into a mode where sessions and device credentials must prove themselves with a passkey or security key, issues ten one-time recovery keys with a 48-hour recovery wait, emails an undo link valid 48 hours, and turns the mode off on request.

**Why it exists.** People at higher risk need protection that survives a hijacked email or password. The brief requires a hardened mode that tightens account security beyond defaults (doc: knowledge-base/data/area-briefs/086-security-and-connected-access-settings.md, S86.26).

**Who uses it.** Individual account holders at higher risk. Not available to accounts managed by an organization or on a domain an organization verified.

**Problems it solves**

- Account takeover through email or password reset.
- Stolen refresh credentials on linked devices.
- Unattended recovery by an attacker (48-hour hold).

**Use cases**

- A journalist enrolls with two security keys.
- After losing a key the person starts recovery with a recovery key and completes it 48 hours later.
- An attacker enrolled the account; the owner follows the emailed link to turn it off within 48 hours.
- A passkey-required refusal appears in an app and the person verifies with a passkey.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Security, panel 'Advanced Account Security' (apps/web/features/settings/sections/SecuritySection.tsx:248; AdvancedAccountSecurityPanel.tsx).
- Mobile: Account security, row 'Advanced Account Security', which only opens the web Security page (account-security/index.tsx:592-598).
- Verification page for sessions that must prove themselves: AccountSecurityVerify.tsx (route path from ACCOUNT_SECURITY_VERIFY_PAGE_PATH, value not read).
- Undo from email: AccountSecurityUndo.tsx.

**Before you start**

- Signed-in browser or app session; API keys are refused (account-security/service.ts:131-141).
- At least two passkeys or security keys, one that works across devices (service.ts:420-428; contract minimumSignInMethods 2).
- Not an organization-managed or verified-domain account (service.ts:104-153).
- A verified primary email address for the code and undo link (service.ts:432-462).

**Screens and controls**

- Panel intro: 'For accounts at higher risk. Sign-in needs a passkey or security key; recovery is stricter.' (AdvancedAccountSecurityPanel.tsx:450).
- Warnings: every other device is signed out and the CLI, VS Code, Chrome extension and desktop app must be linked again; losing every key and recovery key can lock the account for good, and support cannot turn it off (panel lines 69-76).
- Credential rows: 'Passkey' or 'Security key', 'Works across devices' or 'This device only', 'Last used <time>' or 'Not used yet' (panel lines 84-87).
- Dialog 'Turn off Advanced Account Security?' and 'Cancel account recovery?' (panel lines 400-417).
- Section 'Recovery keys' (panel line 694) with a sheet that shows keys once (RecoveryKeysSheet.tsx).

**Journey**

1. Add at least two keys (F086-02).
2. Generate recovery keys and confirm they are saved.
3. Request the emailed code, enter it, confirm with a passkey.
4. The server enrolls, signs out other sessions and devices, emails an undo link, and keeps this session verified.
5. To turn off, confirm with a passkey; or use the emailed link within 48 hours.
6. To recover without a key device, enter a recovery key; the account unlocks after 48 hours from the same device.

**What the person sees and gets**

- Enrollment returns enrolledAt, verifiedUntil, sessionsSignedOut and devicesSignedOut (service.ts:644-649).
- Notice 'Advanced Account Security is off.' after turning off; 'Your new recovery keys are saved. The old ones no longer work.' (panel lines 393, 423).
- Emails: undo link and security notices (service.ts:508-527, events advanced_security_enabled, disabled, recovery_started, recovery_completed, recovery_cancelled).
- A session without verification gets 403 PASSKEY_REQUIRED with a verify path (gate.ts:30-36).

**Settings**

- None besides on and off. Policy constants live in packages/contracts/cloud-contracts/src/account-security.ts:42-55.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Enrollment route with CSRF, rate limit, step-up account_security.enroll, availability check, key count check, email code, passkey assertion and recovery batch promotion (account-security/enrollment/route.ts:25-50; service.ts:528-651).
- Sign-out of every other session and device credential at enrollment, and denial of pending device codes (service.ts:595-619).
- Gate that makes sessions without a passkey verification fail with PASSKEY_REQUIRED and device credentials issued before enrollment fail with unauthorized (gate.ts:206-224; api-auth.ts:187-196, 468, 506).
- Turn off with a passkey assertion (service.ts:764-780; enrollment/route.ts:55-72).
- Recovery start with a recovery key, 48-hour hold, completion from the starting device, cancel (service.ts:782-860).
- Undo link cleanup under a 120-second lease with resumable steps; it also ends the enrolling session, sets an unusable password and contains the account (undo.ts:26-168).
- Organization-managed and verified-domain accounts are refused with a clear message (service.ts:104-153).
- Support recovery tickets respond differently for enrolled accounts (apps/web/lib/support/tickets/recovery.ts:51-60).

**Incomplete**

- Phone cannot enroll, only opens the web page (index.tsx:592-598).
- CLI, VS Code and Chrome have no screen; the brief marks them done. In code the extension and VS Code map the PASSKEY_REQUIRED error code to an account refusal (extension/src/features/cloud-bridge/cloudRefusal.ts:67; extension-vscode/src/utils/accountRefusal.ts:7). CLI handling was not found beyond a test string (cli/src/models/gateway_models.rs:497).

**Present but disconnected or switched off**

- None found.

**Not available**

- Hardware key or passkey enrollment inside CLI, VS Code and Chrome: none found.

## 4. Required behaviour

**Established requirements**

- The user can turn on a hardened mode that tightens account and agent security beyond defaults. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.26)
- Enrollment needs at least two passkeys or security keys including one that works across devices. (source: apps/web/lib/server/account-security/service.ts:420-428; packages/contracts/cloud-contracts/src/account-security.ts:43)
- Turning on signs out every other session and device credential and emails an undo link valid 48 hours. (source: apps/web/lib/server/account-security/service.ts:586-640; packages/contracts/cloud-contracts/src/account-security.ts:53)
- Recovery starts with a recovery key and unlocks after 48 hours. (source: packages/contracts/cloud-contracts/src/account-security.ts:44-45; service.ts:782-815)
- Undo cleanup runs under a 120-second lease and a partial cleanup asks the person to open the link again. (source: apps/web/lib/server/account-security/undo.ts:26-35)
- Not available to organization-managed or verified-domain accounts. (source: apps/web/lib/server/account-security/service.ts:104-153)

**Acceptance criteria**

1. With one passkey, enrollment is refused with 'Add at least 2 passkeys or security keys...'.
2. With a wrong emailed code enrollment fails with 'That code is wrong or expired...' and a verification_failed audit entry.
3. After a successful enrollment other sessions are gone, device refresh credentials are revoked and an undo email is sent.
4. A session that did not verify with a passkey gets 403 with reason PASSKEY_REQUIRED.
5. Turning off with a valid passkey assertion clears enrollment; with no assertion it fails.
6. Opening the undo link twice after success returns the 'expired or already used' message.
7. An organization-managed account gets 'not available for an account your organization manages'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] API keys are exempt from the gate (gate.ts:206-207) and cannot call the enrollment routes (service.ts:131-141).
- [inferred] The undo link resets the password to an unusable value, so the person must reset it after using the link (undo.ts:88-98).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the phone run the whole flow, since the passkey handoff endpoints exist (api/account-security/handoff).
- [proposed] Show CLI, VS Code and Chrome a clear 'verify on the web' message for PASSKEY_REQUIRED.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AdvancedAccountSecurityPanel | `apps/web/features/account-security/components/AdvancedAccountSecurityPanel.tsx` | Web panel for enrollment, keys, recovery keys, turn off. |
| component | RecoveryKeysSheet | `apps/web/features/account-security/components/RecoveryKeysSheet.tsx` | Shows recovery keys once. |
| component | AccountSecurityVerify | `apps/web/features/account-security/components/AccountSecurityVerify.tsx` | Page where a session proves itself with a passkey. |
| component | AccountSecurityUndo | `apps/web/features/account-security/components/AccountSecurityUndo.tsx` | Page for the emailed undo link. |
| component | AccountSecurityHandoff | `apps/web/features/account-security/components/AccountSecurityHandoff.tsx` | Handoff of verification to desktop or mobile. |
| endpoint | POST and DELETE /api/account-security/enrollment | `apps/web/app/api/account-security/enrollment/route.ts` | Turn on and turn off. |
| endpoint | /api/account-security/enrollment/code and /undo | `apps/web/app/api/account-security/enrollment/code/route.ts` | Email code request and undo link (undo route in the sibling folder). |
| endpoint | /api/account-security/recovery and recovery-keys | `apps/web/app/api/account-security/recovery/route.ts` | Start, complete, cancel recovery; prepare and confirm recovery keys (recovery-keys/route.ts). |
| endpoint | /api/account-security/verification and handoff | `apps/web/app/api/account-security/verification/route.ts` | Passkey verification of a session and handoff to apps. |
| service | account-security service | `apps/web/lib/server/account-security/service.ts` | Business rules for enrollment, credentials, recovery, handoff. |
| service | account-security gate | `apps/web/lib/server/account-security/gate.ts` | assertAccountSecurity applied to sessions, devices and API keys. |
| service | account-security undo | `apps/web/lib/server/account-security/undo.ts` | Emailed-link cleanup with lease. |
| service | account-security store | `apps/web/lib/server/account-security/store.ts` | SQL for enrollments, credentials, challenges, sessions. |
| service | webauthn helpers | `apps/web/lib/server/account-security/webauthn.ts` | Passkey options and verification; minimum keys rule. |
| table | account_security_enrollments, account_security_credentials, account_security_challenges, account_security_sessions | `apps/web/lib/server/account-security/store.ts` | State of the mode. |
| config | ACCOUNT_SECURITY_POLICY | `packages/contracts/cloud-contracts/src/account-security.ts` | Counts and hours shared by clients and server. |
| service | API auth gate hook | `apps/web/lib/api-auth.ts` | Calls assertAccountSecurity for sessions and bearer tokens (lines 187-196, 468, 506). |
| screen | Mobile Advanced Account Security row | `apps/mobile/src/features/settings/account-security/index.tsx` | Opens the web page. |
| service | Extension refusal mapping | `apps/extension/src/features/cloud-bridge/cloudRefusal.ts` | Treats PASSKEY_REQUIRED as an account refusal. |
| service | VS Code refusal mapping | `apps/extension-vscode/src/utils/accountRefusal.ts` | Maps PASSKEY_REQUIRED to 'account'. |
| service | Mobile passkey-required handling | `apps/mobile/services/api.ts` | Reads PASSKEY_REQUIRED and announces it. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person adds keys, generates recovery keys and requests an email code. | device and our servers | service.ts:379-400, 463-503 |
| The browser creates a passkey assertion with the browser's WebAuthn prompt. | device | AdvancedAccountSecurityPanel.tsx (enroll handler near line 349) |
| The server re-checks step-up, availability, key count and email, consumes the assertion and the code, promotes the recovery keys and arms the undo link in one transaction. | our servers | service.ts:528-585 |
| The server revokes device refresh credentials, denies approved device codes, ends other identity sessions, marks this session verified and emails the undo link. | our servers | service.ts:595-640 |
| On later requests the API gate checks enrollment and per-session verification; unverified sessions get PASSKEY_REQUIRED. | our servers | gate.ts:206-224 |
| The email message is sent by the notification service. | outside service | service.ts:508-527 (emailUndoLink); mail vendor not traced |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Enrollment, credentials, challenges, verified sessions, recovery keys (hashed) and undo token (hashed) | tables account_security_enrollments, account_security_credentials, account_security_challenges, account_security_sessions | Server only; a cache of enrollment (300 s) and session verification lives in the key-value store | Undo link 48 h; verification up to 7 days or the session lifetime; recovery hold 48 h (contract file). |

**Models and providers.** No AI model or inference provider is involved. The identity provider and the email sender take part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in browser or app session on a personal account; API keys refused. |
| Permissions | Account owner. Organization-managed and verified-domain accounts are excluded. |
| Subscription | none found in the code. |
| Limits and metering | Policy: 2 keys minimum, 10 recovery keys, 48 h hold, 48 h undo, 5 minute ceremony, 10 minute handoff, email code 6 digits, 5 attempts then 60 minute lock (account-security.ts:42-57). Rate limits account-security-read, -write, -verify. |
| Feature flags | none found in the code for this feature. |
| Model compatibility | Not applicable. |
| Provider restrictions | Needs WebAuthn support in the browser and an identity provider that can end sessions. |
| Local mode | Phone in Local mode cannot reach it (account bound). The CLI, VS Code and Chrome keep local features; cloud requests are refused with PASSKEY_REQUIRED when a session is unverified [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Panel shows a load error 'Advanced Account Security could not be loaded.' on failure. | AdvancedAccountSecurityPanel.tsx:233 |
| Unavailable account | 403 with organization_managed or claimed_domain message. | service.ts:104-153 |
| Too few keys | 409 conflict with minimum message. | service.ts:420-428, 561-566 |
| Key removed after the code was sent | 409 'That passkey or security key was removed. Request a new email code...' | service.ts:568-572 |
| Recovery keys superseded or expired | 409 asking to generate new keys; pending keys last 30 minutes. | service.ts:574-579; account-security.ts:47 |
| Undo cleanup busy | 409 asking to open the email link again in a few minutes. | undo.ts:23-24 |
| Undo partly done | 503 'Advanced Account Security was turned off, but part of the cleanup did not finish. Open the link from the email again...' | undo.ts:26-35, 154-156 |
| Lookup failure at the gate | 503 'Unable to verify account security' (fails closed). | gate.ts:97-103 |
| Device credential older than enrollment | 401 unauthorized, so the device must link again. | gate.ts:213-217 |
| Offline | not handled in the code beyond generic errors. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/account-security/enrollment/__tests__/route.test.ts`: Enrollment and disable routes.
- `apps/web/app/api/account-security/enrollment/undo/__tests__/route.test.ts`: Undo link route.
- `apps/web/app/api/account-security/recovery/__tests__/route.test.ts`: Recovery routes.
- `apps/web/app/api/account-security/recovery-keys/__tests__/route.test.ts`: Recovery keys.
- `apps/web/app/api/account-security/verification/__tests__/route.test.ts`: Session verification.
- `apps/web/app/api/account-security/handoff/__tests__/route.test.ts`: Handoff.
- `apps/web/lib/server/account-security/__tests__/gate.test.ts`: The gate.
- `apps/web/lib/server/account-security/__tests__/undo.test.ts`: Undo cleanup.
- `apps/web/lib/server/account-security/__tests__/undo-cleanup-store.test.ts`: Cleanup lease store.
- `apps/web/lib/server/account-security/__tests__/recovery-completion.test.ts`: Recovery completion.
- `apps/web/features/account-security/components/AdvancedAccountSecurityPanel.recovery-batch.test.tsx`: Panel recovery batch behaviour.
- `apps/web/features/account-security/components/AccountSecurityUndo.test.tsx`: Undo page.
- `apps/web/db/neon/account-security-undo-cleanup-migration.test.ts`: Migration for undo cleanup.

**Test scenarios**

- **Enroll**
  1. Add two keys including a cross-device one.
  2. Generate and confirm recovery keys.
  3. Request code, enter it, confirm with a passkey.
  - Expected: 201 with enrolledAt; other sessions ended; undo email sent.
- **Unverified session**
  1. After enrollment use another browser session signed in by password.
  2. Call any API.
  - Expected: 403 PASSKEY_REQUIRED with verify path.
- **Undo link**
  1. Open the emailed link within 48 h.
  - Expected: Mode off, sessions signed out, password set unusable; second open says expired.
- **Organization account**
  1. Use an organization-managed account.
  2. Try to enroll.
  - Expected: 403 with the organization message.
- **Recovery wait**
  1. Start recovery with a recovery key.
  2. Try completing before 48 h, then after.
  - Expected: Conflict before, success after from the same device.

**Where to look when it fails**

- Log '[account-security] an emailed-link cleanup step did not finish; opening the link again retries it'.
- Log '[account-security] some sessions were not ended at enrollment; the passkey gate still refuses them'.
- Audit event account_security_verification_failed.
- Identity events advanced_security_enabled, disabled, recovery_*, key_removed.
- Tables account_security_*.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/086-security-and-connected-access-settings.md](../../70-qa/test-plans/web/086-security-and-connected-access-settings.md)
- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)
- Mobile: [70-qa/test-plans/mobile/086-security-and-connected-access-settings.md](../../70-qa/test-plans/mobile/086-security-and-connected-access-settings.md)
- VS Code: [70-qa/test-plans/vscode/086-security-and-connected-access-settings.md](../../70-qa/test-plans/vscode/086-security-and-connected-access-settings.md)
- Chrome: [70-qa/test-plans/chrome/086-security-and-connected-access-settings.md](../../70-qa/test-plans/chrome/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **Phone cannot enroll or manage the mode.** Affects: Mobile. Evidence: index.tsx:592-598. Work needed: Use the existing handoff endpoints or accept web-only and fix the brief status.
- **Brief says CLI, VS Code and Chrome are done but no management screen exists; only error mapping was found, and none for CLI.** Affects: CLI, VS Code, Chrome. Evidence: cloudRefusal.ts:67; accountRefusal.ts:7; gateway_models.rs:497. Work needed: Verify each app shows a useful message and update the brief.
- **Earlier draft said the organization check was not found; it exists in service.ts and applies to enrollment.** Affects: Documentation. Evidence: service.ts:104-153. Work needed: None; keep this page as the source.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- F086-02
- F086-05
- F086-06
- file:apps/web/lib/server/account-security/service.ts
- file:packages/contracts/cloud-contracts/src/account-security.ts
- api:POST /api/account-security/enrollment
- api:DELETE /api/account-security/enrollment
- table:account_security_enrollments
- table:account_security_credentials
- SYS-authentication-and-identity
- SYS-security-and-privacy

## Unknown

- The value of ACCOUNT_SECURITY_VERIFY_PAGE_PATH and the exact verify page route.
- Which email sender delivers the code and the undo link.
- How the CLI reacts to PASSKEY_REQUIRED or an unauthorized device credential.
- Whether the Desktop Electron window can complete a passkey prompt or uses the handoff.
- Retention of recovery key hashes after the mode is turned off beyond what the panel states ('recovery keys are removed').
