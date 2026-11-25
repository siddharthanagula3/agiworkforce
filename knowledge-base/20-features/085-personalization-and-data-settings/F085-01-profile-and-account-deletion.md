---
id: "F085-01"
type: "feature"
title: "Profile and account deletion"
aliases: ["Profile details (S85.01)", "Delete account (S85.26)", "Account deletion", "Scheduled account deletion", "Save profile", "Delete Account", "Edit your profile on Web"]
area: "85 Personalization and data settings"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S85.01", "S85.26"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "table:profiles", "api:PATCH /api/me", "api:DELETE /api/user/delete-account"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-01 Profile and account deletion

Lets a signed-in person see and change their display name and photo, change email through a separate flow, and ask for the whole account to be deleted. Deletion is scheduled with a 24-hour cancellation window, not done at once, and is refused in some billing or workspace-ownership cases.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.01](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8501), [S85.26](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8526).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the account's name, photo and email. Saves name and photo to the account profile. Starts a scheduled, cancellable deletion of the account and its Cloud data after an explicit confirmation (apps/web/app/api/user/delete-account/route.ts:385-617).

**Why it exists.** A person must be able to correct how the account identifies them and to leave the product and take their data with them. The product requirements list Delete account and a subscription warning before deletion (doc: docs/product/requirements.md:1283-1285).

**Who uses it.** Any signed-in person on Web, Desktop (hosted web app), Mobile, VS Code (link only) and, for name display only, Chrome. Not available in the CLI.

**Problems it solves**

- A wrong or outdated name or photo shown in the product and in shared content.
- No way to leave: erasure of the account, chats, projects, memory and artifacts.
- Accidental or paid-plan-blind deletion: the route stops renewal or refuses when billing cannot be matched.

**Use cases**

- A person changes their full name and uploads a photo in Settings > General on the web.
- A mobile user opens Settings > Account > Email, edits the display name, then later schedules deletion and signs out.
- A person who owns a plan scheduled to end deletes their account and is told the plan ends at erasure with no refund.
- A sole owner of a workspace tries to delete and is told to hand the workspace over first.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron shows the hosted web app, ARCHITECTURE.md:51-54): Settings > General > Profile (apps/web/features/settings/sections/GeneralSection.tsx:242-276); Settings > Account has the Email row and the Delete account row (apps/web/features/settings/sections/AccountSection.tsx:443,510).
- Mobile: Settings > Account section, row labelled 'Email' (EMAIL_SCREEN_TITLE) opens the cloud account screen (apps/mobile/src/features/settings/index.tsx:623); Personalization also edits the full name (apps/mobile/src/features/settings/personalization/index.tsx:421-428).
- VS Code: account menu item 'Edit your profile on Web' (Name, photo and email) opens the web profile page (apps/extension-vscode/src/core/commandSetup.ts:2527-2530).
- Chrome: no profile editor or delete control found in apps/extension/src; the extension only reads the display name from /api/me (apps/extension/src/features/cloud-bridge/capabilityDocument.ts:14,72).
- CLI: none.

**Before you start**

- Signed in to an AGI Cloud account. On mobile an unsigned user sees a sign-in prompt instead (apps/mobile/src/features/settings/cloud-account/index.tsx:111-118).
- Deletion needs a fresh step-up check (re-verification) (apps/web/app/api/user/delete-account/route.ts:462; apps/mobile/src/features/settings/cloud-account/index.tsx:533).

**Screens and controls**

- Web General > Profile: photo with 'Upload photo' or 'Change photo' and 'Remove'; email shown read-only; 'Full name' field (80 characters); 'Save profile' button; 'Saved' text (GeneralSection.tsx:218-276).
- Web Account: 'Email' row with a 'Change email address' action; 'Delete account' row with 'Delete' button; a dialog 'Delete your account?' asking to type DELETE; after scheduling, 'Cancel deletion' appears with the deadline (AccountSection.tsx:443-564,964).
- Mobile account screen: 'Change profile photo', 'Display name' edit field, 'Export Cloud Data', 'Delete Account', and a cancel-deletion alert with 'Keep deletion scheduled' and 'Cancel deletion' (index.tsx:722,757,916,1003; 622-632).
- VS Code: quick-pick item only.

**Journey**

1. Web profile: open Settings > General, edit Full name or pick a photo, press 'Save profile'; the profile consumers refresh and 'Saved' shows (GeneralSection.tsx:152-165).
2. Web deletion: open Settings > Account, press 'Delete', read the notice, type DELETE, confirm, complete the step-up check, read the receipt with the cancellation deadline, press Continue to sign out (AccountSection.tsx:895-960).
3. Mobile deletion: open the account screen, choose 'Delete Account', read the alert, confirm, pass step-up; the app forgets the remembered account, signs out and shows 'Account deletion scheduled' (index.tsx:513-545).
4. To keep the account: sign back in before the deadline and choose 'Cancel deletion' (AccountSection.tsx:492-504; index.tsx:607-632).

**What the person sees and gets**

- Receipt message with the cancellation deadline, status and status reason (delete-account/route.ts:84-110).
- Plan notices: ending plan, renewal stopped, store-billed plan keeps charging until cancelled in the store (with a manage link), or granted plan (route.ts:134-147).
- Errors in plain words: 409 for active-subscription or sole-owner refusal, 503 when billing or workspace ownership could not be checked, 500 when scheduling failed (route.ts:417,442,454,499,520-570).

**Settings**

- No setting controls this feature.
- Related: Settings > Account > 'Cancel deletion' (pending state); Settings > Billing for plan changes (route.ts:508-512 message).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: display name saves through PATCH /api/me and photo through the settings service (apps/web/app/settings/_lib/preferences-client.ts:282-295; GeneralSection.tsx:108-148). PATCH /api/me accepts only display_name (1-120 chars) and avatar_url (apps/web/app/api/me/route.ts:129-132,409-474).
- Web email change runs through its own component calling /api/settings/email (apps/web/features/settings/components/EmailAddressChange.tsx:36,249).
- Delete route: rate limit, CSRF, auth, plan admission, sole-owner check, step-up, then writes deletion_requested_at and deletion_scheduled_for 24 hours ahead on the profile row and writes an audit event (apps/web/app/api/user/delete-account/route.ts:385-612).
- Delete route refuses with 409 when a payment is still being collected, when the plan cannot be matched to a purchase we can cancel, when a plan change is scheduled, or when the account is the only owner of a workspace (route.ts:233-278,421-460,492-513).
- Paid plans that can be handled do not block deletion: ending plans, store-billed plans (with a warning), web plans whose renewal is stopped, and granted plans (route.ts:233-278,134-147).
- GET reports pending, canCancel, requestedAt, scheduledFor and status (route.ts:319-383); cancel is a separate POST route (apps/web/app/api/user/delete-account/cancel/route.ts:11).
- Mobile edits the display name and photo and deletes the account with the same endpoint, handling the two 409 reasons (apps/mobile/src/features/settings/cloud-account/index.tsx:190-195,513-600; accountDeletionRefusal.ts:3-30).
- VS Code opens the web profile page (commandSetup.ts:2527-2530).

**Incomplete**

- Email is not editable inside Mobile or VS Code: Mobile shows an alert 'Change your email' that continues to the web account page (index.tsx:392-420); VS Code only opens a web link.
- Erasure after the deadline runs in a cron named purge-deleted-accounts whose contents were not opened (apps/web/app/api/cron/purge-deleted-accounts).

**Present but disconnected or switched off**

- Web Privacy section no longer has its own delete UI; it points to Account (apps/web/features/settings/sections/__tests__/PrivacySection.account-deletion.test.tsx:93-118).

**Not available**

- CLI: no profile edit and no delete account command found; the brief marks both missing.
- Chrome: no account deletion and no profile editor found.
- VS Code: no in-editor deletion; no photo or name edit in the editor.

## 4. Required behaviour

**Established requirements**

- The user can view and edit name, photo and email on the surface and the change is saved to the account. (source: S85.01 Should (brief))
- The user can delete the account (and its data) from the surface after an explicit confirmation. (source: S85.26 Should (brief))
- Account settings must include Delete account and a subscription cancellation warning before delete when applicable. (source: doc: docs/product/requirements.md:1283-1285)
- Deletion states match the configured grace period and billing policy, cancellation works only when allowed, and partial failures never report complete erasure. (source: doc: docs/product/experience-contract.md:794)
- If billing or workspace-ownership cannot be checked, nothing is deleted and a 503 asks the person to try again. (source: apps/web/app/api/user/delete-account/route.ts:417,442)

**Acceptance criteria**

1. Changing Full name and pressing Save profile on web shows 'Saved' and the new name appears after reload, and PATCH /api/me returns display_name.
2. Delete needs the typed word DELETE on web before the confirm button enables.
3. With a paid plan that is renewing through the web, deletion succeeds only after renewal is stopped and the receipt says the plan ends at erasure with no refund.
4. With a payment still being collected, the request returns 409 reason active_subscription and nothing is scheduled.
5. When the plan lookup is forced to fail, the response is 503 and profiles.deletion_scheduled_for stays null.
6. An account that is the only owner of a workspace gets 409 reason sole_organization_owner naming the workspace.
7. After scheduling, GET /api/user/delete-account returns pending true and canCancel true until the deadline, and Cancel deletion clears the schedule.
8. Mobile sign-out happens only after the server confirms scheduling.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Deletion is two-stage: schedule now, erase after the 24-hour deadline; the first draft's description of immediate deletion is wrong.
- [inferred] Local-mode data on the phone is not touched by deletion: the confirmation says Local Mode data stays on this device (apps/mobile/src/features/settings/cloud-account/deleteAccountConfirmation.ts:13-24).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a CLI command to show and cancel a pending deletion, and to open the web deletion page.
- [proposed] Add a profile editor or at least a link in Chrome, as VS Code has.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | PATCH /api/me | `apps/web/app/api/me/route.ts` | Updates display_name and avatar_url on profiles (lines 129-132,409-474). |
| endpoint | DELETE/GET /api/user/delete-account | `apps/web/app/api/user/delete-account/route.ts` | Schedules deletion, reports status, refuses on billing or ownership. |
| endpoint | POST /api/user/delete-account/cancel | `apps/web/app/api/user/delete-account/cancel/route.ts` | Cancels a pending deletion before the deadline. |
| endpoint | cancel-schedule route | `apps/web/app/api/user/delete-account/cancel-schedule/route.ts` | Exists beside the cancel route; its contents were not read. |
| endpoint | /api/settings/email | `apps/web/features/settings/components/EmailAddressChange.tsx` | Web email change flow (line 36). |
| component | GeneralSection | `apps/web/features/settings/sections/GeneralSection.tsx` | Profile block: photo, Full name, Save profile. |
| component | AccountSection | `apps/web/features/settings/sections/AccountSection.tsx` | Email row, Delete account row, deletion dialog, Cancel deletion. |
| hook | useDeleteAccount / useCancelAccountDeletion / useAccountDeletionStatus | `apps/web/features/settings/hooks/use-settings-queries.ts` | Delete mutation with step-up (line 470 area); sibling files use-cancel-account-deletion.ts and use-account-deletion-status.ts. |
| service | saveDisplayName | `apps/web/app/settings/_lib/preferences-client.ts` | Sends PATCH /api/me from web settings (line 282). |
| service | plan renewal stop for deletion | `apps/web/lib/server/account-deletion-plan-renewal.ts` | Stops or restores plan renewal around deletion (imported by the route; file not opened). |
| service | deletion manifest | `apps/web/lib/services/deletion-manifest.ts` | Computes the receipt status and reason (imported; not opened). |
| job | purge-deleted-accounts cron | `apps/web/app/api/cron/purge-deleted-accounts` | Runs erasure after the deadline (named only; not opened). |
| table | profiles | `apps/web/app/api/user/delete-account/route.ts` | Holds display_name, avatar_url, deletion_requested_at, deletion_scheduled_for (route.ts:524-530). |
| table | organization_members / organizations | `apps/web/app/api/user/delete-account/route.ts` | Read to find sole-owned workspaces (SOLE_OWNED_WORKSPACES_SQL, around line 190). |
| screen | Mobile cloud account screen | `apps/mobile/src/features/settings/cloud-account/index.tsx` | Name, photo, email alert, export, delete, cancel deletion. |
| store | cloudProfileStore | `apps/mobile/src/features/settings/cloud-account/cloudProfileStore.ts` | Loads and saves the mobile display name (used at index.tsx:190). |
| other | deleteAccountConfirmation | `apps/mobile/src/features/settings/cloud-account/deleteAccountConfirmation.ts` | Alert text for the mobile deletion confirmation. |
| other | accountDeletionRefusal | `apps/mobile/src/features/settings/cloud-account/accountDeletionRefusal.ts` | Reads 409 reasons active_subscription and sole_organization_owner. |
| command | edit-profile quick pick | `apps/extension-vscode/src/core/commandSetup.ts` | Opens the web profile page (lines 2386,2527). |
| test | delete-account route tests | `apps/web/app/api/user/delete-account/__tests__/route.test.ts` | Sole-owner, scheduling, step-up and race cases. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person edits name or photo and presses Save profile; the app sends PATCH /api/me with a CSRF token. | device and our servers | apps/web/app/settings/_lib/preferences-client.ts:282-295; apps/web/app/api/me/route.ts:409-430 |
| Server validates the body, upserts the profiles row and returns display_name and avatar_url. | our servers | apps/web/app/api/me/route.ts:432-472 |
| Person confirms deletion; the client calls DELETE /api/user/delete-account after a step-up check. | device and our servers | apps/web/features/settings/hooks/use-settings-queries.ts:403 area; apps/web/app/api/user/delete-account/route.ts:462 |
| Server rate-limits, checks CSRF and identity, loads the subscription and decides admission: none, plan notice, stop web renewal, or refuse. | our servers | apps/web/app/api/user/delete-account/route.ts:385-460,233-278 |
| For a web-billed plan the server stops renewal at the payment provider before scheduling and reverses it if scheduling fails. | outside service | apps/web/app/api/user/delete-account/route.ts:481-513,570 area (stopPlanRenewalForAccountDeletion, reversePlanRenewalStop); provider call itself not opened |
| Server sets deletion_requested_at and deletion_scheduled_for (now plus 24 hours) on profiles, writes an audit event and returns the receipt. | our servers | apps/web/app/api/user/delete-account/route.ts:481,524-612 |
| After the deadline a purge cron erases the data; the sign-in identity at the identity provider is deleted only then. | our servers | apps/web/features/settings/sections/AccountSection.tsx:394-398 (comment); cron body not opened |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Profile display_name and avatar_url | table profiles (Neon Postgres) | Read by every app through /api/me | Removed at erasure after the deadline [inferred from the scheduled-deletion design] |
| Deletion schedule (requested_at, scheduled_for) | table profiles | Read through GET /api/user/delete-account | Cleared when the person cancels before the deadline (cancel route) |
| Audit event account_deletion_requested with a pseudonymous subject reference | security audit log | No | Kept by the audit log policy; purge job purge-security-audit-logs exists (not opened) |
| Local-mode data on a phone | device storage | No | Stays on the device after deletion (deleteAccountConfirmation.ts:13-24) |

**Models and providers.** No model or inference provider takes part. The payment provider (and, for store-billed plans, the app store) is involved only for plan renewal.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account required on every app; refusal paths use 401 for unauthenticated calls (delete-account/route.ts:396-405). |
| Permissions | Only the account owner can change their own profile or delete it. A sole workspace owner is blocked until ownership is handed over (route.ts:446-460). Step-up verification is required (route.ts:462). |
| Subscription | Deletion does not need a plan but depends on billing state: refused while payment is being collected, plan unmatched, or a plan change is scheduled; other paid states proceed with a notice (route.ts:233-278). Profile editing has no plan check in the files read. |
| Limits and metering | Route is rate-limited under the key user-data-delete and status reads under account-deletion-status (route.ts:386,320). Display name limit 120 on the server, 80 in the web field. |
| Feature flags | none found in the code for this feature. |
| Model compatibility | Not applicable: no model is used. |
| Provider restrictions | Store-billed plans are not cancelled by deletion; the person must cancel in the store (route.ts:140). |
| Local mode | Mobile Local mode has no cloud account to edit; deletion removes only the Cloud account and leaves on-device data (deleteAccountConfirmation.ts:13-24). Whether an offline Local-only user can see these controls: the account screen shows a sign-in prompt when signed out (cloud-account/index.tsx:111-118). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Profile loading | Web shows 'Loading profile…' and disables the fields until the profile is ready. | apps/web/features/settings/sections/GeneralSection.tsx:285-289 |
| Save error | Web shows the error text in red; mobile alerts 'Name not saved to your account'. | GeneralSection.tsx:158-166; apps/mobile/src/features/settings/personalization/index.tsx:426-430 |
| Photo too large or wrong type | Web shows 'Pick an image under N MB.' or 'Pick a PNG, JPEG, GIF, WebP, or HEIC image.' | GeneralSection.tsx:108-119 |
| Billing check fails | 503 with try-again message, nothing deleted. | delete-account/route.ts:408-418 |
| Already scheduled | Returns the existing deadline as success if still in the future; 409 if the window closed. | delete-account/route.ts:536-566 |
| Step-up cancelled | Web does not show an error for a cancelled step-up. | AccountSection.tsx:972 |
| Outcome unknown on mobile | Alert 'Could not confirm deletion scheduling' and the status is refreshed. | index.tsx:575-583 |
| Account switch during an action | Mobile aborts with 'Account changed'. | index.tsx:380-390 |
| Offline | not handled in the code beyond ordinary request errors; no offline queue found. | searched apps/web/features/settings/sections/AccountSection.tsx and apps/mobile/src/features/settings/cloud-account/index.tsx for offline handling and found none |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/user/delete-account/__tests__/route.test.ts`: Sole-owner refusal, naming workspaces, ownership-lookup failure, scheduling, repeat requests, expired deadlines, step-up on repeat.
- `apps/web/app/api/user/delete-account/__tests__/route.get.test.ts`: Status read: nothing pending, timestamp precision, pair snapshot marker.
- `apps/web/features/settings/sections/AccountSection.delete.test.tsx`: Sign-out only after Continue, real scheduled date, store billing link, server errors.
- `apps/web/features/settings/hooks/useDeleteAccount.retry.test.tsx`: Delete mutation retry behaviour.
- `apps/web/features/settings/hooks/useCancelAccountDeletion.test.tsx`: Cancelling a pending deletion.
- `apps/web/__tests__/api/me.test.ts`: GET /api/me: 200, 401, plan, default free tier, flags.
- `apps/web/features/settings/sections/GeneralSection.test.tsx`: Layout and link to Personalization; profile controls stack on phones.
- `apps/mobile/__tests__/CloudAccountOwnerSwitch.test.tsx`: Matches the mobile account screen for owner switching (title only inspected; deletion coverage not confirmed).

**Test scenarios**

- **Edit name on web**
  1. Sign in on web, open Settings > General
  2. Change Full name, press Save profile
  3. Reload and read the name
  - Expected: 'Saved' appears and the new name persists; GET /api/me shows the new display_name.
- **Schedule and cancel deletion**
  1. Use a test account on the Free plan
  2. Settings > Account > Delete, type DELETE, confirm and pass step-up
  3. Sign back in and press Cancel deletion
  - Expected: Receipt shows a deadline about 24 hours ahead; after cancel GET returns pending false.
- **Paid web plan**
  1. Use a test account with a renewing web plan
  2. Request deletion
  - Expected: Renewal stops, receipt says the plan ends at erasure with no refund, and cancelling restores renewal.
- **Sole workspace owner**
  1. Use an account that is the only owner of a workspace
  2. Request deletion
  - Expected: 409 sole_organization_owner with the workspace name; nothing scheduled.
- **Mobile delete**
  1. Open Settings > Account > Email on the phone
  2. Choose Delete Account and confirm
  - Expected: Alert 'Account deletion scheduled' and the app signs out.

**Where to look when it fails**

- Server log lines: 'Account deletion halted: subscription lookup failed', 'Account deletion refused while a paid subscription is active', 'Account deletion scheduled' (route.ts:410-570).
- Table profiles columns deletion_requested_at and deletion_scheduled_for.
- Audit event type account_deletion_requested.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/085-personalization-and-data-settings.md](../../70-qa/test-plans/web/085-personalization-and-data-settings.md)
- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Mobile: [70-qa/test-plans/mobile/085-personalization-and-data-settings.md](../../70-qa/test-plans/mobile/085-personalization-and-data-settings.md)
- VS Code: [70-qa/test-plans/vscode/085-personalization-and-data-settings.md](../../70-qa/test-plans/vscode/085-personalization-and-data-settings.md)
- Chrome: [70-qa/test-plans/chrome/085-personalization-and-data-settings.md](../../70-qa/test-plans/chrome/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **CLI has no profile or deletion control.** Affects: CLI users. Evidence: S85.01 and S85.26 brief status missing; no CLI file found. Work needed: Add commands or a web link.
- **Chrome cannot edit profile or delete the account.** Affects: Chrome users. Evidence: Only a read of /api/me found (capabilityDocument.ts:72). Work needed: Add a link or controls, or record that the web is the owner.
- **Email editing not inside Mobile or VS Code.** Affects: Mobile and VS Code. Evidence: index.tsx:392-420; commandSetup.ts:2527. Work needed: Native flow or accepted link.
- **Brief says Chrome profile is done and deletion missing; code found shows neither.** Affects: Chrome. Evidence: grep of apps/extension/src found no profile editor. Work needed: Correct the brief or add the control.
- **Mobile has no test dedicated to the delete flow that was found by name.** Affects: Mobile. Evidence: apps/mobile/__tests__ file search. Work needed: Add a test covering confirmation, 409 refusals and sign-out.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- table:profiles
- api:PATCH /api/me
- api:DELETE /api/user/delete-account

## Unknown

- What the purge-deleted-accounts cron erases and in what order (file not opened).
- The endpoint behind settingsService.uploadAvatar and the avatar storage location.
- Whether Chrome offers any profile edit not found by grep.
- What the cancel-schedule route does.
- Retention period of the audit event.
- Whether desktop Electron Local mode shows any extra account control.
