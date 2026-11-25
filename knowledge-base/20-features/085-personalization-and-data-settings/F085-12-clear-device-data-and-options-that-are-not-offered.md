---
id: "F085-12"
type: "feature"
title: "Clear device data, and options that are not offered"
aliases: ["Delete everything (mobile Danger Zone)", "Delete all local data", "Delete all local chats", "Clear cache", "Storage (desktop settings)", "Clear browsing data", "Clear device data", "S85.23", "S85.08", "S85.09", "S85.15", "S85.24", "S85.25"]
area: "85 Personalization and data settings"
available_on: ["desktop", "mobile"]
implementation: {web: "n/a", desktop: "partial", mobile: "built", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S85.23", "S85.08", "S85.09", "S85.15", "S85.24"]
depends_on: ["SYS-local-inference", "SYS-security-and-privacy", "SYS-memory-projects-and-context", "SYS-sync-and-continuity", "SYS-authentication-and-identity", "store:mobile-sqlite", "store:mobile-mmkv", "surface:mobile", "surface:desktop", "mode:local", "F085-09", "F085-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-12 Clear device data, and options that are not offered

Mobile can wipe all chats, memory, settings and downloaded models stored on the phone, and sign out. Desktop has storage clean-up buttons and a Clear browsing data button for its browser pane, but no full wipe. CLI and VS Code have no wipe. Connected sources, location use, voice retention and reset personalization are not offered.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.23](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8523), [S85.08](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8508), [S85.09](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8509), [S85.15](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8515), [S85.24](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8524).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives the person a way to remove data the app keeps on this device. On Mobile that means everything local (apps/mobile/services/dsarExport.ts:431-472). On Desktop it means selected caches and the browser pane's cookies (apps/web/features/desktop-host/components/StorageSettings.tsx:57-90; BrowserPaneSettings.tsx:39-47).

**Why it exists.** Data rights and device hygiene: a person selling or handing over a phone should be able to erase local data. The row text on Mobile names GDPR and DPDP (apps/mobile/app/(app)/settings/storage.tsx:488).

**Who uses it.** Mobile users (Local and Cloud), Desktop users who want to free space or clear browser sign-ins.

**Problems it solves**

- Erasing local chats, memory, models and keys from a phone.
- Freeing disk space on Desktop.
- Signing out of every site in the Desktop browser pane.

**Use cases**

- Mobile: Settings > Storage > Delete everything before handing the phone on.
- Mobile Local mode: delete only local chats.
- Desktop: clear web cache or old logs.
- Desktop: Clear browsing data after using the browser pane for a sensitive site.

## 2. User experience

**Where to find it**

- Mobile: Settings > Storage, card 'Danger Zone', row 'Delete everything' with note 'Wipes all conversations, memory, and models from this device' (apps/mobile/app/(app)/settings/storage.tsx:521-542).
- Mobile: same screen has 'Clear cache' (Removes temp files) and 'Export all my data' (storage.tsx:495-515).
- Mobile Local mode: data controls > 'Local chats' > 'Delete all local chats' (apps/mobile/src/features/settings/data-controls/index.tsx:437-472).
- Desktop: Settings 'Storage' with 'Clean up' rows (Web cache, Old logs, Old archived sessions, Temporary command files) (apps/web/features/desktop-host/components/StorageSettings.tsx:23-90; apps/web/features/settings/components/WebSettingsModal.tsx:254).
- Desktop: Settings 'Browser' > 'Browsing data' > 'Clear browsing data' (BrowserPaneSettings.tsx:38-47).
- CLI, VS Code, Web, Chrome: no device wipe (brief; none found).

**Before you start**

- Mobile wipe needs no account. It signs out all accounts as part of the wipe (dsarExport.ts:433-436).
- Delete all local chats works only in Local mode (data-controls/index.tsx:366).

**Screens and controls**

- Mobile two alerts: 'Delete all local data?' then 'Are you absolutely sure?' with button 'Yes, delete everything' (apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:11-36).
- Desktop confirmation titled 'Clear browsing data?' naming the loss of sign-ins (BrowserPaneSettings.tsx:39-45).

**Journey**

1. Mobile: open Settings > Storage, scroll to Danger Zone.
2. Tap Delete everything and confirm twice.
3. The app withdraws sharing with providers, signs out accounts, deletes local tables, files and models.
4. The app returns to the age gate (onboarding) (storage.tsx:173-176).
5. If it fails: 'Wipe failed - Could not delete all local data. Try again.' (useEraseDeviceData.ts:31).

**What the person sees and gets**

- Mobile 'Chats deleted' alert with count after local chat delete (data-controls/index.tsx:381-386).
- Desktop 'Browsing data cleared.' (BrowserPaneSettings.tsx:46).
- Desktop errors 'That could not be cleared.' (StorageSettings.tsx:28).

**Settings**

- None stored. Items not offered anywhere: connected mail, calendar or docs as personalization sources (S85.08), location-use preference (S85.09), voice recording retention (S85.15), reset personalization (S85.25) (brief).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile wipeAllLocalData: withdraws sharing with providers, signs out all accounts, deletes rows from telemetry_queue, memory_facts, custom_instructions, installed_models, provider_keys (if present), settings, conversations, memory_vectors in one transaction, closes and removes set-aside databases, clears MMKV, removes model folders, exports, local chat attachments and viewer copies (apps/mobile/services/dsarExport.ts:431-472).
- Mobile confirmation is two-step and says it cannot be undone (useEraseDeviceData.ts:11-36).
- Mobile Delete all local chats deletes Local-mode chats and drafts (apps/mobile/src/features/settings/data-controls/deleteLocalChats.ts:11-24).
- Mobile Clear cache exists on the Storage screen (storage.tsx:495-515).
- Desktop storage clean-up for web cache, old logs, old archived sessions and temporary command files with a confirmation naming the loss (StorageSettings.tsx:57-90).
- Desktop Clear browsing data clears cookies, storage and cache of the browser pane session (apps/desktop/electron/browserPane.ts:423-427; dispatcher.ts:2487-2489).
- Web deliberately has no location or remember-chats toggle because nothing read them (apps/web/features/settings/sections/PrivacySection.tsx:33-42).

**Incomplete**

- Desktop has clean-up actions but no single wipe of chats, memory and settings (brief: missing; StorageSettings lists only four clean-ups).
- The wipe does not touch Cloud data; the Cloud account screen says deleting the Cloud account does not erase data kept only on the device (apps/mobile/src/features/settings/data-controls/index.tsx:594-596 equivalent note).

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- CLI and VS Code: no local wipe (brief; none found).
- Connected personalization sources, location preference, voice retention, reset personalization: no controls (brief S85.08, S85.09, S85.15, S85.25). I did not search the code for reset-personalization; the brief says not applicable.
- Brief says S85.24 Clear browser data is not applicable anywhere, but Desktop has 'Clear browsing data' for its browser pane (BrowserPaneSettings.tsx:39); the brief is out of date on this point.

## 4. Required behaviour

**Established requirements**

- The user can wipe the data the app keeps on this device (local chats, cache, settings) from within the app (mobile done; desktop, cli, vscode missing). (source: S85.23 (brief))
- Connected personalization sources, location preference, voice retention, clear browser data and reset personalization are not applicable and should not appear as controls. (source: S85.08, S85.09, S85.15, S85.24, S85.25 (brief))
- An action a user cannot undo asks first and names the consequence. (source: AGENTS.md section 9 (doc: AGENTS.md))
- Mobile local wipe signs out all accounts, withdraws provider sharing, then deletes local rows in a transaction. (source: apps/mobile/services/dsarExport.ts:431-452)

**Acceptance criteria**

1. After Delete everything on Mobile, no conversations, memory, instructions, settings or models remain on the phone.
2. The wipe requires two confirmations and the first says it cannot be undone.
3. The wipe signs the person out of every account.
4. If the wipe fails midway, the app says so and does not report success.
5. Delete all local chats leaves memory, settings, projects and downloaded models in place.
6. Desktop Clear browsing data asks first and says sign-ins are lost.
7. No app shows a control for location, connected sources, voice retention or reset personalization.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A Desktop wipe, if built, should reuse the confirm pattern of StorageSettings [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Desktop 'Delete local data' that covers chats, memory and settings with the same two-step confirmation.
- [proposed] Add `agi data wipe` to the CLI that removes sessions and config after confirmation, moving files to Trash first as AGENTS.md section 9 requires.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | wipeAllLocalData | `apps/mobile/services/dsarExport.ts` | Full on-device wipe (lines 431-472). |
| hook | useEraseDeviceData | `apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts` | Two-step confirmation and failure alert. |
| screen | Mobile Storage | `apps/mobile/app/(app)/settings/storage.tsx` | Danger Zone, Clear cache, export. |
| screen | Mobile data controls | `apps/mobile/src/features/settings/data-controls/index.tsx` | Delete all local chats. |
| service | deleteLocalChats | `apps/mobile/src/features/settings/data-controls/deleteLocalChats.ts` | Local chat deletion. |
| service | localDataSnapshot | `apps/mobile/src/features/settings/data-controls/localDataSnapshot.ts` | resetLocalInMemoryState after the wipe. |
| store | mobile SQLite tables | `apps/mobile/storage/db.ts` | conversations, memory_facts, custom_instructions, installed_models, settings, memory_vectors, telemetry_queue. |
| store | MMKV | `apps/mobile/lib/mmkv.ts` | Key-value store cleared by storage.clearAll(). |
| component | StorageSettings (desktop) | `apps/web/features/desktop-host/components/StorageSettings.tsx` | Clean-up rows and usage. |
| command | desktop_storage_clean | `apps/desktop/electron/runtime/dispatcher.ts` | Runtime command behind clean-up (lines 2533-2535). |
| component | BrowserPaneSettings | `apps/web/features/desktop-host/components/BrowserPaneSettings.tsx` | Clear browsing data button. |
| service | clearBrowserPaneData | `apps/desktop/electron/browserPane.ts` | Clears storage data and cache of the pane session (lines 423-427). |
| command | browser_pane_clear_data | `apps/desktop/electron/runtime/dispatcher.ts` | Runtime command (line 2487). |
| test | local-data-wipe-order | `apps/mobile/__tests__/local-data-wipe-order.test.ts` | Order of wipe steps. |
| test | DataControlsLocalChats | `apps/mobile/__tests__/DataControlsLocalChats.test.tsx` | Local chat delete. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person confirms twice on Mobile. | device | useEraseDeviceData.ts:11-36 |
| App records that sharing with AI providers is withdrawn for this device, before anything is deleted. | device and our servers | apps/mobile/services/dsarExport.ts:432-434; test local-data-wipe-order.test.ts:211-236 |
| App signs out all accounts. | device and our servers | dsarExport.ts:435-436 (signOutAllAccounts) |
| App deletes local tables in a transaction, closes the database, removes set-aside copies. | device | dsarExport.ts:440-458 |
| App clears MMKV, model folders, exports, attachments, viewer copies. | device | dsarExport.ts:460-472 |
| App resets in-memory state and returns to the age gate. | device | useEraseDeviceData.ts:26-27; storage.tsx:173-176 |
| Desktop clean-up or Clear browsing data runs in the Electron main process. | device | apps/desktop/electron/runtime/dispatcher.ts:2487-2489, :2533-2535 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Local chats, memory, instructions, settings, models, keys, attachments | phone SQLite, MMKV and files | Local only; Cloud copies are separate | Deleted permanently by the wipe, no Trash step found (the in-app copy says it cannot be undone) |
| Browser pane cookies and storage | Electron pane session | No | Cleared by the button; cannot be recovered per the dialog |
| Provider-sharing withdrawal record | server (recorded before the wipe) | Server | Kept as a record [inferred] |

**Models and providers.** Downloaded local models are deleted from the phone. No model is called.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not required on Mobile for the wipe. Mobile Delete all local chats needs Local mode only. |
| Permissions | Device owner access to the app; no extra OS permission found. |
| Subscription | none found in the code. Local data deletion is free. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | This feature is mostly Local mode: it works offline, needs no sign-in and no payment (the sign-out step affects only accounts that exist). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No local chats | Alert 'No local chats' - 'There are no chats stored on this device.' | data-controls/index.tsx:365-368 |
| Wipe in progress | isWiping flag is set. | useEraseDeviceData.ts:23-24 |
| Wipe failure | 'Wipe failed' alert; the state flag resets. | useEraseDeviceData.ts:28-31 |
| Local chat delete failure | 'Could not delete chats - Some chats may still be on this device. Try again.' | data-controls/index.tsx:386-389 |
| Best-effort cleanup fails | Does not block the wipe (test). | apps/mobile/__tests__/local-data-wipe-order.test.ts:300-315 |
| Persistent deletion fails | Error is propagated and completion not reported. | local-data-wipe-order.test.ts:325 |
| Cancel | Cancel on either alert does nothing. | useEraseDeviceData.ts:12-14 |
| Not in Local mode | Delete all local chats returns without action. | data-controls/index.tsx:366 |
| Offline | Wipe is mostly local; the provider-sharing withdrawal needs a record and the test says nothing is deleted when it cannot be recorded. | local-data-wipe-order.test.ts:227-236 |
| Accessibility | Rows carry accessibilityLabel and role. | storage.tsx:521-530 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/local-data-wipe-order.test.ts`: Order of the wipe, sign-out, provider withdrawal, failure handling.
- `apps/mobile/__tests__/DataControlsLocalChats.test.tsx`: Delete all local chats.
- `apps/mobile/__tests__/RecentSearchesWipe.test.ts`: Recent searches removed by the wipe.
- `apps/web/features/desktop-host/__tests__/StorageSettings.test.tsx`: Desktop clean-up rows.
- `apps/web/features/desktop-host/__tests__/BrowserPaneSettings.test.tsx`: Clear browsing data confirmation.

**Test scenarios**

- **Full wipe**
  1. Seed chats, memory, a downloaded model.
  2. Settings > Storage > Delete everything > confirm twice.
  - Expected: All gone; signed out; age gate shown.
- **Failure**
  1. Force the database delete to fail.
  - Expected: 'Wipe failed' alert; success is not reported.
- **Local chats only**
  1. Local mode, 2 chats and a memory fact.
  2. Delete all local chats.
  - Expected: Chats removed, memory remains.
- **Desktop clear data**
  1. Sign in to a site in the browser pane.
  2. Settings > Browser > Clear browsing data > Clear.
  - Expected: Signed out of that site; account untouched.
- **Not offered controls**
  1. Search Settings on each app for location, connected sources, voice retention, reset personalization.
  - Expected: No such controls.

**Where to look when it fails**

- Alert text 'Wipe failed'.
- Mobile SQLite tables listed above.
- Desktop errors 'That could not be cleared.'

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Mobile: [70-qa/test-plans/mobile/085-personalization-and-data-settings.md](../../70-qa/test-plans/mobile/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **Desktop has no wipe of chats, memory and settings; only four clean-ups.** Affects: Desktop users.. Evidence: StorageSettings.tsx:57-90; brief S85.23 missing.. Work needed: Define the scope and add a confirmed wipe.
- **CLI and VS Code have no local wipe.** Affects: CLI and VS Code users.. Evidence: Brief S85.23.. Work needed: Decide scope and add commands.
- **Mobile wipe deletes permanently without a Trash step, while AGENTS.md section 9 says an agent never destroys user data; here the user acts explicitly, so this is allowed.** Affects: Policy review only.. Evidence: dsarExport.ts:440-458; AGENTS.md section 9.. Work needed: None unless the owner wants a recovery path.
- **The brief says Clear browser data is not applicable anywhere, but Desktop offers it.** Affects: Documentation accuracy.. Evidence: BrowserPaneSettings.tsx:39-47. Work needed: Update the brief.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-local-inference
- SYS-security-and-privacy
- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- SYS-authentication-and-identity
- store:mobile-sqlite
- store:mobile-mmkv
- surface:mobile
- surface:desktop
- mode:local
- F085-09
- F085-11

## Unknown

- Whether the Mobile wipe also removes secure keychain items beyond what signOutAllAccounts clears (the test mocks a keychain delete; not traced).
- The exact settings route label on Desktop (Storage section is registered at WebSettingsModal.tsx:254).
- Whether any reset-personalization control exists; the brief says none and I did not search for it.
- Whether the Desktop app stores chats locally at all, since it shows the hosted web app.
- The note about Cloud account deletion not erasing device data is quoted from the data-controls screen; its exact line was not re-read.
