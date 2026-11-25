---
id: "F086-02"
type: "feature"
title: "Passkeys"
aliases: ["Passkeys", "Passkeys panel", "Passkeys and security keys", "Add a passkey", "S86.03"]
area: "86 Security and connected-access settings"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S86.03"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "file:apps/web/features/settings/components/Settings/PasskeysPanel.tsx", "file:apps/web/lib/identity/client.ts", "api:GET /api/account-security", "api:POST /api/account-security/credentials", "api:DELETE /api/account-security/credentials/[credentialId]", "table:account_security_credentials", "F086-04", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-02 Passkeys

Passkeys let the person sign in with the device unlock instead of a password. On web and desktop the Security page can add, rename and remove passkeys through the identity provider. The phone lists passkeys and security keys and can remove keys of Advanced Account Security, but adding happens on the web.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.03](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8603).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists the account's passkeys with added and last-used dates, adds a new passkey, renames one (1 to 50 characters) and removes one after a confirmation.

**Why it exists.** Passkeys resist phishing better than passwords. The brief requires that the user can add, see, rename and remove passkeys (doc: knowledge-base/data/area-briefs/086-security-and-connected-access-settings.md, S86.03).

**Who uses it.** Any account holder with a browser that supports passkeys; phone users who want to review or remove keys.

**Problems it solves**

- Passwords that can be phished or reused.
- Not knowing which devices hold a passkey.
- A lost device whose passkey must be removed.

**Use cases**

- Add a passkey on a laptop, then sign in with fingerprint.
- Rename 'Passkey' to 'Work laptop'.
- Remove the passkey of a lost phone.
- On the phone, review the passkey and security key list.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Security, panel 'Passkeys' (apps/web/features/settings/sections/SecuritySection.tsx:246).
- Mobile (Cloud mode only): Account security, row 'Passkeys and security keys' opening a page of the same title (account-security/PasskeysSection.tsx:25, index.tsx:637-650).

**Before you start**

- A signed-in account.
- Web: a browser that supports passkeys; otherwise the panel says 'This browser cannot create passkeys. Use a browser with passkey support to add one.' (PasskeysPanel.tsx:365-366).
- Mobile: Cloud mode and the passkey state not 'unavailable' (index.tsx passkeysPageOpen).

**Screens and controls**

- Web: button 'Add a passkey'; per row a rename control and 'Remove' (PasskeysPanel.tsx:350-495).
- Remove dialog: 'Remove <name>?' with 'You will no longer be able to sign in with this passkey on any device that synced it. You can add it again later.' and button 'Remove passkey' (PasskeysPanel.tsx:307-310).
- Mobile: list of keys (kind label 'Passkey' or 'Security key'), 'Remove' per Advanced Account Security key, row 'Add a passkey or security key' (value 'Web') (PasskeysSection.tsx:195-250).

**Journey**

1. Open Settings, Security, Passkeys.
2. Press 'Add a passkey'; the browser shows its own passkey prompt; confirm with fingerprint, face or PIN.
3. The list reloads with 'Added <date> · Not used yet'.
4. To rename, use the rename control, type a name, save.
5. To remove, press 'Remove', confirm.

**What the person sees and gets**

- Each row: 'Added <date>' and 'Last used <date>' or 'Not used yet' (PasskeysPanel.tsx:30-32).
- Errors: 'This passkey could not be changed.' and the uncertain-outcome text 'The passkey change outcome could not be confirmed...' (PasskeysPanel.tsx:49, 262).
- Mobile empty state: 'No passkeys or security keys yet.' (PasskeysSection.tsx:216-228).

**Settings**

- Advanced Account Security (F086-04) builds on at least two passkeys or security keys.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web add, rename and remove run in the browser through the identity provider's user object: createPasskey, passkey.update({name}), passkey.delete() (apps/web/lib/identity/client.ts:262-266).
- Rename accepts 1 to 50 characters (client.ts:150, 255-257).
- Browser support check hides the Add button when unsupported (PasskeysPanel.tsx:362-366; client.ts:286).
- Mobile lists Advanced Account Security credentials from GET /api/account-security and provider passkeys from the signed-in user, and removes the former with step-up action account_security.change (PasskeysSection.tsx:143-154; service.ts:319-341).

**Incomplete**

- Mobile cannot add or rename a passkey; the list of provider passkeys on the phone is read-only and points to the web (PasskeysSection.tsx:240-247, 258-265).
- The brief marks Mobile 'missing' but the code has a Passkeys page, so the brief is out of date (index.tsx:637-650).

**Present but disconnected or switched off**

- None found.

**Not available**

- CLI, VS Code and Chrome have no passkey management screen in the code opened (brief marks them not applicable).

## 4. Required behaviour

**Established requirements**

- The user can add, see, rename and remove passkeys for their account. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.03)
- Registering or removing a key of Advanced Account Security needs step-up account_security.change with 300 seconds freshness. (source: apps/web/lib/server/step-up/actions.ts:57-60; apps/web/app/api/account-security/credentials/route.ts:36-41)
- An irreversible removal asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. With a supporting browser, 'Add a passkey' creates a passkey and the list shows it with 'Not used yet'.
2. Renaming to an empty or 51-character name is refused with the 1 to 50 message.
3. Removing asks for confirmation naming the consequence, then the row disappears.
4. In an unsupported browser the Add button is hidden and the explanation shows.
5. On the phone, Cloud mode shows the passkey page; Local mode does not show it.
6. On the phone, removing an Advanced Account Security key prompts a re-check.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Whether the web Passkeys panel asks for a re-check is decided by the identity provider, not by AGI code: no requireStepUp call exists on that path (client.ts:190-280).
- [inferred] A passkey added in the Passkeys panel is a different record from an Advanced Account Security credential (separate store: account_security_credentials).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the two kinds of passkey visible as one list, or explain the difference on the page.
- [proposed] Allow rename on the phone.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PasskeysPanel | `apps/web/features/settings/components/Settings/PasskeysPanel.tsx` | Web list, add, rename, remove UI with ownership and uncertainty guards. |
| hook | usePasskeys | `apps/web/lib/identity/client.ts` | Wraps the identity provider's passkey calls (create, update, delete) with account-switch guards. |
| service | browserSupportsPasskeys | `apps/web/lib/identity/passkey-support.ts` | Feature check used to hide Add. |
| screen | SecuritySection | `apps/web/features/settings/sections/SecuritySection.tsx` | Mounts the panel. |
| component | PasskeysSection (mobile) | `apps/mobile/src/features/settings/account-security/PasskeysSection.tsx` | Phone list and removal page. |
| service | fetchSignInKeys and removeSignInKey | `apps/mobile/src/features/settings/account-security/service.ts` | Read keys state and delete a credential. |
| endpoint | GET /api/account-security | `apps/web/app/api/account-security/route.ts` | Returns account security status and credentials. |
| endpoint | POST /api/account-security/credentials | `apps/web/app/api/account-security/credentials/route.ts` | Finishes registration of a passkey or security key under step-up. |
| endpoint | DELETE /api/account-security/credentials/[credentialId] | `apps/web/app/api/account-security/credentials/[credentialId]/route.ts` | Removes a credential. |
| service | removeCredential | `apps/web/lib/server/account-security/service.ts` | Locks enrollment, applies step-up and the minimum-keys rule when enrolled, deletes, audits. |
| table | account_security_credentials | `apps/web/lib/server/account-security/store.ts` | Stored credentials of Advanced Account Security. |
| config | step-up action account_security.change | `apps/web/lib/server/step-up/actions.ts` | Freshness and consequence text. |
| service | Mobile step-up | `apps/mobile/src/features/auth/services/stepUp.ts` | Phone re-check prompt used before removal. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Press Add; the browser calls the identity provider's createPasskey, which opens the browser's passkey prompt and registers the key. | outside service | apps/web/lib/identity/client.ts:262-263 |
| After each change the page reloads the user record to show the new list. | device | client.ts:267-272 |
| On the phone, the status call lists Advanced Account Security credentials from the product database. | our servers | service.ts:319 (fetchSignInKeys) and apps/web/app/api/account-security/route.ts:20-31 |
| Phone removal: step-up prompt, then DELETE of the credential id; server removes it and audits. | device and our servers | PasskeysSection.tsx:143-146; account-security/service.ts removeCredential |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Provider passkeys (public key records, name, dates) | The identity provider | Read by clients through the provider SDK | Deleted by passkey.delete(). |
| Advanced Account Security credentials | table account_security_credentials | Server only; phone reads via API | Deleted by removeCredential. |

**Models and providers.** No AI model or inference provider is involved. The identity provider stores web passkeys.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required. Phone needs Cloud mode. |
| Permissions | Account owner only. |
| Subscription | none found in the code. |
| Limits and metering | Passkey name 1 to 50 characters (client.ts:150). Advanced Account Security name limit 64 in policy contract (packages/contracts/cloud-contracts/src/account-security.ts:59). Rate limits account-security-read and account-security-write. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Depends on the identity provider and browser passkey support. |
| Local mode | Phone in Local mode does not render the Passkeys section (index.tsx: PasskeysSection only when appMode is cloud). No local equivalent. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | A spinner shows while the user record loads; text 'Your account must finish loading before you can manage passkeys.' when no owner. | PasskeysPanel.tsx:117, 385-388 |
| Unsupported browser | Add hidden; explanation shown. | PasskeysPanel.tsx:362-366 |
| Empty list | Web empty text not read (list branch seen only for non-empty). Mobile shows 'No passkeys or security keys yet.' | PasskeysSection.tsx:216-228 |
| Uncertain outcome | Panel blocks further changes after a dispatched change fails and shows the 'could not be confirmed' text. | PasskeysPanel.tsx:253-262 |
| Account switched mid-action | Operation retires and shows 'The account changed. Open passkey settings again.' | client.ts:196-203 |
| Removing below the minimum while Advanced Account Security is on | 409 'Keep at least 2 passkeys or security keys, including one that works across devices...' | account-security/service.ts:341-346 |
| Phone key list unavailable | Row shows 'Unavailable · Retry'. | PasskeysSection.tsx:174-177 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/components/Settings/PasskeysPanel.test.tsx`: Web panel rendering and actions.
- `apps/web/app/api/account-security/credentials/__tests__/route.test.ts`: Registration route.
- `apps/web/app/api/account-security/credentials/[credentialId]/__tests__/route.test.ts`: Removal route.
- `apps/web/lib/server/account-security/__tests__/credential-admission-service.test.ts`: Credential admission and step-up.
- `apps/mobile/__tests__/AccountSecurityScreen.test.tsx`: Phone screen including the passkey page.

**Test scenarios**

- **Add and rename**
  1. Open Security in a passkey browser.
  2. Add a passkey.
  3. Rename it to 'Test'.
  - Expected: Row shows 'Test' and 'Not used yet'.
- **Invalid rename**
  1. Start rename.
  2. Enter 51 characters and save.
  - Expected: Error asking for 1 to 50 characters; name unchanged.
- **Remove**
  1. Press Remove on a passkey.
  2. Confirm.
  - Expected: Dialog names the consequence; row disappears.
- **Phone removal re-check**
  1. Enroll Advanced Account Security with two keys and a third.
  2. On the phone remove the third key.
  - Expected: Step-up prompt, then removal; with only two keys the removal is refused with 409.
- **Local mode phone**
  1. Switch the phone to Local mode.
  2. Open Account security.
  - Expected: No Passkeys page; banner for Cloud mode.

**Where to look when it fails**

- Audit event account_security_credential_removed or identity event advanced_security_key_removed.
- Error text 'The passkey change outcome could not be confirmed...' means the provider call was dispatched but not confirmed.
- Table account_security_credentials.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/086-security-and-connected-access-settings.md](../../70-qa/test-plans/web/086-security-and-connected-access-settings.md)
- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)
- Mobile: [70-qa/test-plans/mobile/086-security-and-connected-access-settings.md](../../70-qa/test-plans/mobile/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **The brief says Mobile is missing while the code has a Passkeys page, so the brief is stale.** Affects: Documentation, testers. Evidence: apps/mobile/src/features/settings/account-security/index.tsx:637-650. Work needed: Correct the brief status to partial.
- **Mobile cannot add or rename a passkey.** Affects: Mobile. Evidence: PasskeysSection.tsx:258-265. Work needed: Decide whether to build in-app registration.
- **Web passkey changes have no AGI-side re-check; the earlier draft claim that account_security.change guards every change is not true for the web panel.** Affects: Web and Desktop. Evidence: client.ts:190-280 (no requireStepUp); step-up only in account-security routes. Work needed: Confirm whether the identity provider enforces a recent sign-in; if not, add a step-up.
- **Two separate passkey stores (provider and Advanced Account Security) can confuse people.** Affects: All. Evidence: PasskeysSection.tsx merges two lists. Work needed: Explain or unify in the UI.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- file:apps/web/features/settings/components/Settings/PasskeysPanel.tsx
- file:apps/web/lib/identity/client.ts
- api:GET /api/account-security
- api:POST /api/account-security/credentials
- api:DELETE /api/account-security/credentials/[credentialId]
- table:account_security_credentials
- F086-04
- SYS-authentication-and-identity

## Unknown

- Whether the identity provider requires a recent sign-in before adding or deleting a passkey on web.
- What the web panel shows when the passkey list is empty (branch not read).
- Whether the Desktop Electron window supports passkey prompts (not traced).
- Whether the phone's provider passkey list needs the provider SDK to be signed in on the device.
