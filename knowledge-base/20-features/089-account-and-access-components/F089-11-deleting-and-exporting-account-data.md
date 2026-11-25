---
id: "F089-11"
type: "feature"
title: "Deleting and exporting account data"
aliases: ["Account export/deletion coordinator (S89.23)", "Data export", "Delete account", "Account erasure", "Workspace deletion", "Purge deleted accounts", "Right to erasure"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.23"]
depends_on: ["SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "mode:cloud", "surface:web", "surface:desktop", "table:profiles", "table:erasure_tombstones", "table:legal_holds", "table:legal_hold_custodians"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-11 Deleting and exporting account data

Lets a person download their data and delete their account, and lets an owner delete a workspace. Deletion is scheduled with a cooling period, cancellable, then a nightly job erases every store, refuses when a legal hold applies, leaves a tombstone, and reports which stores succeeded or failed.

Area: [89. Account and access components](README.md). Requirement items: [S89.23](../../10-requirements/capabilities/089-account-and-access-components.md#s8923).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Exports account data through GET and POST /api/user/export and archive routes, schedules account deletion through DELETE /api/user/delete-account, schedules workspace deletion through DELETE /api/settings/organization, and runs scheduled erasure through cron routes (apps/web/app/api/user/export/route.ts:3456-3458; apps/web/app/api/user/delete-account/route.ts:616-617; apps/web/app/api/settings/organization/route.ts:582; vercel.json:90-96).

**Why it exists.** People must be able to take and remove their data; a legal hold must stop erasure; the product must show what is kept and why (S89.23; doc: docs/compliance/legal-hold-and-ediscovery.md:37-60).

**Who uses it.** Any signed-in person (account export and deletion); workspace owners (workspace deletion); compliance staff reading the retention manifest.

**Problems it solves**

- Half-erased accounts: each store reports success or failure and a failed store is retried (apps/web/lib/server/account-erasure.ts:440-460; deletion-manifest.ts:584-612).
- Erasing under a legal hold: the whole erasure is refused (account-erasure.ts:893-976; organization-erasure.ts:285-306).
- Orphaned stored files and backup copies: files and backup copies are deleted (account-erasure.ts:763-820).
- Re-creation of an erased subject: a tombstone row remembers it (account-erasure.ts:1203-1215).

**Use cases**

- A person requests their data export and downloads the archive.
- A person deletes their account, changes their mind within the cooling period and cancels.
- An owner deletes a workspace; 14 days later the job erases it and cancels its seat subscription.
- An account under a legal hold requests deletion; the job keeps all data and reports the hold.

## 2. User experience

**Where to find it**

- Web: Account section with controls 'Delete account' and the notice 'Account deletion scheduled' (apps/web/features/settings/sections/AccountSection.tsx:466,510).
- Desktop (Tauri build): CloudAccountControls (apps/desktop/src/features/settings/tabs/Account/CloudAccountControls.tsx); the public Electron desktop shows the hosted web page.
- Export: through the web settings queries (apps/web/features/settings/hooks/use-settings-queries.ts) calling /api/user/export. Mobile, CLI, VS Code, Chrome: no deletion or export screen found by search [inferred].

**Before you start**

- Signed in. Delete needs CSRF, a rate limit 'user-data-delete' and a step-up check (delete-account/route.ts:386-389,462).
- A paid plan must be settled first: the route refuses with a message when a plan change is scheduled or a subscription must be handled (delete-account/route.ts:500-510).
- Workspace deletion: owner with the right permission (organization route; not traced in detail).

**Screens and controls**

- Cancel control while the schedule is still cancellable (can_cancel in delete-account/route.ts:348).
- Refusal text example: 'Your <plan> plan has a scheduled change, so nothing was deleted. Keep your current plan in Settings > Billing, then delete your account.' (delete-account/route.ts:503-504).
- Error text: 'Account deletion could not be scheduled. Nothing was deleted. Please try again, or contact <support email> if this persists.' (delete-account/route.ts:533-536 region).

**Journey**

1. 1. Person opens Account settings and chooses 'Delete account'.
2. 2. The server checks sign-in, CSRF, rate limit and step-up, then schedules deletion for 24 hours later by setting deletion_scheduled_for on the profile (delete-account/route.ts:481,523-529).
3. 3. The page shows 'Account deletion scheduled' with a cancel option until the time arrives.
4. 4. The nightly job purge-deleted-accounts picks due accounts and runs the erasure (cron route; schedule '7 4 * * *' in vercel.json).
5. 5. Erasure checks legal holds, media jobs, deletes files and rows, anonymises financial records, records a tombstone and a report.
6. 6. A failed store leaves the profile for the next run; a success removes the profile.
7. 7. Workspace: DELETE schedules 14 days ahead; cancel at /api/settings/organization/deletion/cancel; job purge-deleted-organizations erases it ('12 4 * * *').

**What the person sees and gets**

- Erasure report with counts per store, anonymised stores, complete flag and profileRetained (account-erasure.ts:440-460).
- Deletion status values pending, blocked, partial, complete with human reasons (deletion-manifest.ts:563-612).
- Held report text: 'Subject is under an active legal hold; data preserved.' or 'Legal hold status could not be read, so nothing was erased: ...' (account-erasure.ts:950-957).
- Audit event deletion_blocked_by_legal_hold (doc: docs/compliance/legal-hold-and-ediscovery.md:61-65).

**Settings**

- Account deletion delay is 24 hours (delete-account/route.ts:481); workspace delay is 14 days (apps/web/lib/server/organization-deletion.ts:10).
- Retention manifest: apps/web/lib/services/deletion-manifest.ts RETENTION_MATRIX.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Account erasure refuses under a member, custodian or workspace legal hold, and refuses when the hold cannot be read (account-erasure.ts:893-933).
- Knowledge object files, avatar, feedback screenshots and media are deleted with their backup copies; untracked knowledge ledger rows must be settled or the erasure throws (account-erasure.ts:763-857).
- A tombstone row is opened, advanced and closed (account-erasure.ts:1203-1260).
- Organization erasure refuses under an active legal hold and when the seat subscription cannot be canceled, keeping the workspace for the next run (organization-erasure.ts:285-350).
- The deletion manifest lists each store with retention and a deletion path (deletion-manifest.ts:289-518).
- Export has tests that it covers personal data and matches the erasure inventory (apps/web/app/api/user/export/__tests__/export-matches-erasure-inventory.test.ts).

**Incomplete**

- Some stores are deliberately not deleted, with reasons in UNDELETED_USER_TABLES and the financial disposition table (account-erasure.ts:351-440); the full list was not enumerated here.

**Present but disconnected or switched off**

- none found

**Not available**

- Export and deletion screens on mobile, CLI, VS Code and Chrome were not found.

## 4. Required behaviour

**Established requirements**

- An export/deletion coordinator produces the user's export and erases account and organization data across every store, honouring legal holds and recording what is retained. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S89.23)
- Account erasure deletes stored files and their backup copies and leaves a tombstone. (source: apps/web/lib/server/account-erasure.ts:763-820,1203-1215)
- Organization erasure is blocked by an active legal hold; data is kept and the report says so. (source: apps/web/lib/server/organization-erasure.ts:285-306)
- If the seat subscription cannot be ended, the workspace is kept and the report says why. (The first draft called this a billing hold; the code reports a failed subscription cancellation.) (source: apps/web/lib/server/organization-erasure.ts:309-350)
- Untracked knowledge ledger rows block erasure until settled. (source: apps/web/lib/server/account-erasure.ts:847-857)
- A held deletion is recorded, not only refused; a hold placed before the delete wins. (source: doc: docs/compliance/legal-hold-and-ediscovery.md:37-65)
- A pairing in the relay lasts at most eight days including the sweep. (source: apps/web/lib/services/deletion-manifest.ts:425-435)

**Acceptance criteria**

1. Deleting an account sets deletion_scheduled_for about 24 hours ahead and nothing is erased immediately.
2. Cancelling before the time clears the schedule.
3. The purge job erases a due account with no hold and removes its files.
4. The purge job on a subject with an active hold erases nothing and reports the hold.
5. If the hold query fails, nothing is erased.
6. A workspace deletion schedules 14 days ahead and the cancel route reverses it.
7. Organization erasure keeps the workspace when the seat subscription cannot be canceled.
8. The export matches the erasure inventory: every personal table is exported or listed as not exported with a reason.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local-mode data on the device is not touched by the coordinator [inferred: it runs only on the server].
- Per-store retention such as audit logs follows the manifest, not this feature's code [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the person which stores are pending in the account screen using DeletionOutcome.
- [proposed] Provide export and deletion entry points on mobile for store review expectations.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | account-erasure | `apps/web/lib/server/account-erasure.ts` | Per-store erasure, legal hold check, tombstone, report |
| service | organization-erasure | `apps/web/lib/server/organization-erasure.ts` | Workspace erasure, hold and seat subscription checks |
| service | organization-deletion | `apps/web/lib/server/organization-deletion.ts` | 14-day cooling period |
| service | scheduled-account-erasure | `apps/web/lib/server/scheduled-account-erasure.ts` | Scheduled erasure jobs |
| service | erasure-tombstones | `apps/web/lib/server/erasure-tombstones.ts` | Tombstone handling |
| service | object-backup-erasure | `apps/web/lib/server/object-backup-erasure.ts` | Backup copy removal |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Retention matrix and deletion progress |
| service | legal-hold-gate | `apps/web/lib/services/legal-hold-gate.ts` | Legal hold predicate on destructive statements |
| endpoint | GET and DELETE /api/user/delete-account | `apps/web/app/api/user/delete-account/route.ts` | Status and schedule deletion |
| endpoint | GET and POST /api/user/export | `apps/web/app/api/user/export/route.ts` | Immediate export and archive request |
| endpoint | GET /api/user/export/archives and /archives/{exportId} | `apps/web/app/api/user/export/archives/route.ts` | List and download archives |
| endpoint | DELETE /api/settings/organization | `apps/web/app/api/settings/organization/route.ts` | Schedule workspace deletion |
| endpoint | cancel workspace deletion | `apps/web/app/api/settings/organization/deletion/cancel/route.ts` | Reverse the schedule |
| job | purge-deleted-accounts | `apps/web/app/api/cron/purge-deleted-accounts/route.ts` | Nightly account erasure (schedule in vercel.json) |
| job | purge-deleted-organizations | `apps/web/app/api/cron/purge-deleted-organizations/route.ts` | Nightly workspace erasure |
| service | account-deletion-cancellation | `apps/web/lib/server/account-deletion-cancellation.ts` | Cancel a pending account deletion |
| table | profiles | `apps/web/app/api/user/delete-account/route.ts` | deletion_requested_at and deletion_scheduled_for columns (SQL lines 523-529) |
| table | erasure_tombstones | `apps/web/lib/server/account-erasure.ts` | Tombstone row per erased user (line 211) |
| table | legal_holds and legal_hold_custodians | `apps/web/lib/server/account-erasure.ts` | Hold lookup (lines 893-933) |
| screen | AccountSection | `apps/web/features/settings/sections/AccountSection.tsx` | Delete account controls |
| screen | CloudAccountControls | `apps/desktop/src/features/settings/tabs/Account/CloudAccountControls.tsx` | Tauri desktop account controls |
| config | cron schedule | `vercel.json` | purge-deleted-accounts 7 4 * * *, purge-deleted-organizations 12 4 * * * |
| test | account-erasure.test.ts | `apps/web/lib/server/account-erasure.test.ts` | Erasure behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person requests deletion from Account settings; the server verifies step-up and schedules deletion for 24 hours later. | our servers | apps/web/app/api/user/delete-account/route.ts:386-529 |
| The nightly job selects profiles whose schedule has passed and have no current erasure job. | our servers | apps/web/app/api/cron/purge-deleted-accounts/route.ts:44-57 |
| Erasure reads legal holds; a hold or an unreadable hold stops everything. | our servers | apps/web/lib/server/account-erasure.ts:965-976 |
| Files in object storage and backup copies are deleted; table rows are deleted or anonymised. | outside service | account-erasure.ts:733-820 |
| A tombstone is recorded; the profile row is removed when complete. | our servers | account-erasure.ts:1193-1260 |
| Workspace erasure first cancels the seat subscription with the payment provider. | outside service | apps/web/lib/server/organization-erasure.ts:338-362 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Account data across user-scoped tables | Database tables listed in USER_SCOPED_TABLES (account-erasure.ts:37-190) | No | Deleted, anonymised or kept per UNDELETED_USER_TABLES with reasons (account-erasure.ts:351-440) |
| Stored files (knowledge, avatar, media, feedback screenshots) and backups | Object storage | No | Deleted with backup copies; failures counted and retried |
| Erasure tombstone | table erasure_tombstones | No | Kept as proof of erasure |
| Export archives | Object storage; entries listed through the archives route | No | Export objects are erased with the account (exportObjectsDeleted in the report) |
| Relay pairings | signaling_sessions | No | Expiry sweep, maximum eight days (deletion-manifest.ts:425-435) |

**Models and providers.** No model or provider decides deletion. The payment provider is called to cancel workspace subscriptions; provider-side copies of data held by outside model providers are not covered by this code: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; cron routes use cron authentication (apps/web/lib/server/cron-auth.ts). |
| Permissions | Self-service for the person's own account; owner for workspace deletion [inferred from the organization route; not traced]. |
| Subscription | No plan is needed to export or delete. A paid plan must be settled before account deletion is accepted (delete-account/route.ts:500-510). |
| Limits and metering | Rate limits 'user-data-export', 'user-data-delete', 'account-deletion-status'. Cooling period 24 hours for accounts and 14 days for workspaces. Cron functions have a duration limit of 60 s (accounts) and 300 s (workspaces). |
| Feature flags | none found. |
| Model compatibility | Not applicable. |
| Provider restrictions | Payment provider needed to cancel seat subscriptions on workspace deletion. |
| Local mode | Local data stays on the device; the coordinator does not delete it. Removing local data is a device-side action outside this feature [inferred]. Export and deletion of a cloud account needs sign-in but no plan. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Legal hold active | Nothing erased; report shows legal_holds retained | account-erasure.ts:950-957; organization-erasure.ts:285-306 |
| Hold lookup fails | Treated as held (fail closed) | account-erasure.ts:925-931 |
| A store fails | Report marks error; profile kept; next run retries; status 'partial' | deletion-manifest.ts:584-612 |
| Untracked knowledge ledger rows | Erasure throws until settled | account-erasure.ts:847-857 |
| Media job in flight | Erasure blocked and retried | account-erasure.ts:1000-1012 |
| Seat subscription cannot be canceled | Workspace kept with blockedByBilling | organization-erasure.ts:309-350 |
| Cancel after the cooling period | can_cancel false | delete-account/route.ts:348 |
| Offline or accessibility | not handled in the code read | n/a |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/account-erasure.test.ts`: Account erasure
- `apps/web/lib/server/organization-erasure.test.ts`: Workspace erasure
- `apps/web/lib/server/erasure-tombstones.test.ts`: Tombstones
- `apps/web/lib/services/__tests__/deletion-manifest.test.ts`: Manifest, including the relay maximum age
- `apps/web/lib/services/__tests__/legal-hold-deletion-paths.test.ts`: Legal hold on deletion paths
- `apps/web/app/api/cron/purge-deleted-accounts/purge-deleted-accounts.test.ts`: Account purge job
- `apps/web/app/api/user/export/__tests__/export-matches-erasure-inventory.test.ts`: Export and erasure inventories agree
- `apps/web/app/api/user/export/__tests__/export-covers-personal-data.test.ts`: Export completeness
- `apps/web/features/settings/sections/AccountSection.delete.test.tsx`: Delete UI

**Test scenarios**

- **Cancel in time**
  1. Schedule deletion
  2. Cancel before the due time
  3. Run the purge job
  - Expected: Account untouched
- **Due deletion**
  1. Schedule deletion
  2. Move the clock past the due time
  3. Run purge-deleted-accounts
  - Expected: Files and rows gone, tombstone present
- **Legal hold**
  1. Place a member hold
  2. Run the purge for that user
  - Expected: Nothing erased; held report
- **Hold unreadable**
  1. Make the hold query fail
  - Expected: Nothing erased
- **Workspace subscription failure**
  1. Make the subscription cancel fail
  2. Run purge-deleted-organizations
  - Expected: Workspace kept with blockedByBilling
- **Export**
  1. POST /api/user/export
  2. Download the archive
  - Expected: Archive lists every personal table or its exclusion reason

**Where to look when it fails**

- Log 'Account erasure declined: subject is under an active legal hold'.
- Erasure report fields tables, anonymized, complete, profileRetained.
- Tables erasure_tombstones, legal_holds; audit event deletion_blocked_by_legal_hold.
- Retention matrix functions unclassifiedStores and storesOutlivingTheirSubject (deletion-manifest.ts:544-560).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No export or deletion entry on mobile, CLI, VS Code or Chrome found** Affects: Those apps. Evidence: Search of non-web files found only the Tauri desktop controls. Work needed: Confirm they link to the web flow or add entries.
- **Account deletion delay is 24 hours while the doc string calls both periods a cooling period of the same shape** Affects: Documentation readers. Evidence: organization-deletion.ts:4-9 vs delete-account/route.ts:481. Work needed: State both periods in one product document.
- **Not all stores are erased; reasons are in code only** Affects: Compliance reviewers. Evidence: account-erasure.ts:351-440. Work needed: Publish the retained-store list from the manifest.
- **No file records a live erasure run** Affects: All. Evidence: scheduled-account-erasure.live.test.ts exists but no recorded result. Work needed: Run and record.

**Depends on**

- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- mode:cloud
- surface:web
- surface:desktop
- table:profiles
- table:erasure_tombstones
- table:legal_holds
- table:legal_hold_custodians

## Unknown

- Complete list of stores kept and their reasons.
- Export archive retention lifetime.
- Permission required for workspace deletion.
- Whether data held by outside model providers is covered.
- Cancellation window for account deletion in the UI (the code sets 24 hours; UI text not opened).
