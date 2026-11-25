---
id: "F041-10"
type: "feature"
title: "Clear all data on this device"
aliases: ["Delete everything", "Delete all local data", "Clear local data", "Erase this device's data", "wipeAllLocalData", "Danger Zone", "S41.17"]
area: "41 Temporary and private experiences"
available_on: ["mobile"]
implementation: {web: "missing", desktop: "missing", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S41.17"]
depends_on: ["surface:mobile", "mode:local", "mode:cloud", "store:sqlite", "store:mmkv", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "F041-08", "F041-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-10 Clear all data on this device

One action that erases the app's data on this device. Built on Mobile only: Settings, Storage, Danger Zone, 'Delete everything', then two confirmations. It withdraws provider sharing, signs out all accounts, deletes local tables, settings, models and files, and returns to onboarding. The age-refusal screen reuses it. Other apps have none.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.17](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4117).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Wipes conversations, memory, custom instructions, settings, installed model records, downloaded model files, chat files and exports from the phone, signs the person out of every account on the device and restarts onboarding.

**Why it exists.** The brief requires one action that clears all data the app keeps on this device (brief S41.17). It also serves the under-age refusal flow, which must be able to erase device data.

**Who uses it.** A Mobile user leaving the app or handing over the phone; a person refused by the age gate.

**Problems it solves**

- No need to delete each chat, memory and model separately.
- Account sessions on the device end with the data.

**Use cases**

- Sell or hand over the phone.
- Start fresh after testing.
- Erase after the age check refuses the account.

## 2. User experience

**Where to find it**

- Mobile: Settings, Storage, card 'Danger Zone', row 'Delete everything' with note 'Wipes all conversations, memory, and models from this device' (apps/mobile/app/(app)/settings/storage.tsx:521).
- Mobile age refusal screen: link 'Erase this device's data' (apps/mobile/src/features/auth/components/AgeRefused.tsx:73).
- Web, Desktop, CLI, VS Code, Chrome: not available (brief S41.17 missing).

**Before you start**

- None; works signed out. Wipe is not blocked by an ongoing download [inferred; not traced].

**Screens and controls**

- Alert 1 'Delete all local data?': 'This permanently deletes all conversations, memory, settings, and downloaded models from this device. This action cannot be undone.' Buttons Cancel, 'Delete Everything'.
- Alert 2 'Are you absolutely sure?': 'All local data will be wiped. You will be signed out and returned to onboarding.' Buttons Cancel, 'Yes, delete everything'.
- Overlay text 'Deleting all local data…' with a spinner (apps/mobile/app/(app)/settings/storage.tsx:336).

**Journey**

1. Open Settings, then Storage.
2. Scroll to Danger Zone and tap 'Delete everything'.
3. Read the first alert; tap 'Delete Everything'.
4. Read the second alert; tap 'Yes, delete everything'.
5. Watch 'Deleting all local data…'.
6. The app returns to the age gate and onboarding.

**What the person sees and gets**

- Overlay while wiping; on error the alert 'Wipe failed' with 'Could not delete all local data. Try again.' (apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:34).
- Success is the return to onboarding; no success alert.

**Settings**

- Related: Storage 'Clear cache' (removes temp files only) and per-model delete in the same screen; Data Controls 'Delete all local chats' (chats only).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Two-step confirmation with named consequences (apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:11).
- wipeAllLocalData: withdraw provider sharing for this device, sign out all accounts, delete rows from telemetry_queue, memory_facts, custom_instructions, installed_models, provider_keys (if present), settings, conversations and memory_vectors in one transaction, close the database, delete set-aside databases, clear the key-value store and set-aside stores, run a reset callback, delete model folders, the export folder, local chat attachments and file exports and viewer copies (apps/mobile/services/dsarExport.ts:425).
- Reset callback empties in-memory stores, clears the biometric flag and device id, and sets the app mode back to local (apps/mobile/src/features/settings/data-controls/localDataSnapshot.ts:182).
- Failure shows 'Wipe failed' and clears the spinner (useEraseDeviceData.ts:34).
- The same hook backs the age-refusal screen (apps/mobile/src/features/auth/components/AgeRefused.tsx:62).

**Incomplete**

- Cloud copies of chats and memory are not deleted by this action; only a local sign-out and local deletion run (apps/mobile/services/dsarExport.ts:425). The alert text says 'conversations' without saying Cloud copies stay [inferred from the code path].
- Storage totals shown on the screen cover only models and cache, not all data (apps/mobile/src/features/settings/StorageScopeNotice.tsx:13).
- Alert text omits custom instructions and provider sharing even though they are removed.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Web, Desktop, CLI, VS Code, Chrome have no clear-all-local-data action (brief S41.17).
- No 'move to Trash first' step: the wipe is permanent and deletes files directly, which differs from the user-data rule in AGENTS.md section 9 for agent actions (this is a user-initiated action, which is allowed to be permanent) [inferred].

## 4. Required behaviour

**Established requirements**

- One action clears all data the app keeps on this device. (source: brief S41.17)
- An action a user cannot undo asks first and the question names the consequence. (source: doc: AGENTS.md section 9)
- Permanent removal happens only from an explicit user action that names what is lost. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Both alerts appear in order and Cancel in either stops the wipe.
2. After 'Yes, delete everything', every listed table is empty and the key-value store is cleared.
3. Provider sharing is withdrawn before accounts are signed out.
4. If provider-sharing withdrawal cannot be recorded, nothing is deleted.
5. All accounts are signed out and the app lands on onboarding.
6. A failure shows 'Wipe failed' and the app stays usable.
7. The age-refusal screen runs the same wipe.
8. Downloaded model folders and chat files are gone.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Cloud data should be named in the alert as staying in the account, to avoid a false 'everything' claim. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the same action to Desktop and CLI under their own data stores.
- [proposed] Add a success confirmation before onboarding.
- [proposed] Offer export first, as the age-refusal screen does ('Export this device's data').

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | StorageManagerScreen | `apps/mobile/app/(app)/settings/storage.tsx` | Settings, Storage screen with the Danger Zone row, wipe overlay and model list. |
| hook | useEraseDeviceData | `apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts` | Two alerts, calls wipe, shows 'Wipe failed'. |
| service | wipeAllLocalData | `apps/mobile/services/dsarExport.ts` | Performs the ordered deletion. |
| service | resetLocalInMemoryState | `apps/mobile/src/features/settings/data-controls/localDataSnapshot.ts` | Resets in-memory stores, biometric flag and device id after deletion. |
| component | AgeRefused | `apps/mobile/src/features/auth/components/AgeRefused.tsx` | Age-refusal screen with export and erase actions. |
| service | withdrawSharingWithProviders | `apps/mobile/src/features/settings/cloud-privacy/CloudProviderSharingGroup.tsx` | Withdraws AI provider sharing for this device and pauses Cloud work first. |
| store | useAuthStore.signOutAllAccounts | `apps/mobile/src/features/auth/store.ts` | Ends every account session on the device. |
| service | storage layer | `apps/mobile/storage/db.ts` | getDb, closeDb and deleteSetAsideDatabases used by the wipe. |
| store | mmkv | `apps/mobile/lib/mmkv.ts` | Key-value store cleared with storage.clearAll and set-aside stores. |
| service | modelStoragePaths | `apps/mobile/services/modelStoragePaths.ts` | Model folders deleted by the wipe. |
| service | localChatAttachments | `apps/mobile/services/localChatAttachments.ts` | removeAllLocalChatAttachments. |
| service | fileCreation | `apps/mobile/services/fileCreation.ts` | Exports folder and viewer copies removal. |
| table | telemetry_queue, memory_facts, custom_instructions, installed_models, provider_keys, settings, conversations, memory_vectors | `apps/mobile/services/dsarExport.ts` | Local tables cleared inside one transaction. |
| test | local-data-wipe-order | `apps/mobile/__tests__/local-data-wipe-order.test.ts` | Order and failure behaviour of the wipe. |
| test | local-data-reset | `apps/mobile/__tests__/local-data-reset.test.ts` | Reset defaults after a wipe. |
| test | AgeGateContract | `apps/mobile/__tests__/AgeGateContract.test.tsx` | Uses the erase hook (name-based). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person confirms two alerts; the overlay 'Deleting all local data…' shows. | device | apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:25 |
| Provider sharing for this device is withdrawn; Cloud answers stop and may be paused, which may call AGI servers. | device and our servers | apps/mobile/services/dsarExport.ts:428; apps/mobile/src/features/settings/cloud-privacy/CloudProviderSharingGroup.tsx:241 |
| All accounts are signed out on the device; the sign-in sessions are held by the identity service. | outside service | apps/mobile/services/dsarExport.ts:430; apps/mobile/src/features/auth/store.ts:277 [identity service role inferred from the Clerk mock in apps/mobile/__tests__/local-data-wipe-order.test.ts:14] |
| Tables are cleared in one transaction, the database closed and set-aside copies deleted. | device | apps/mobile/services/dsarExport.ts:436 |
| Key-value store cleared; in-memory state reset; model, export and attachment folders deleted. | device | apps/mobile/services/dsarExport.ts:454 |
| The screen's callback routes to the age gate for onboarding. | device | apps/mobile/app/(app)/settings/storage.tsx:198 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| All local app data listed above | on-device SQLite, key-value store and app folders | Not applicable; deleted | Deleted permanently; no undo and no Trash step. |
| Cloud account data | AGI servers | Not touched by this action | Stays until deleted through account controls (Web account deletion starts 24 hours after confirmation per apps/web/features/settings/sections/PrivacySection.tsx:521 text). |

**Models and providers.** No model takes part. The wipe deletes downloaded on-device model files and records. Withdrawal of provider sharing concerns Cloud providers and is recorded before deletion.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None required; works signed out. If signed in, all accounts on the device are signed out. |
| Permissions | Mobile app file storage only; no extra permission found. |
| Subscription | none found in the code. A paid plan does not change the action. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | not applicable |
| Provider restrictions | not applicable |
| Local mode | Fully works in Local Mode and is the way to remove Local data; it returns the app mode to local. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Cancel at either alert | Nothing happens. | apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:15 |
| Wiping | Overlay with spinner 'Deleting all local data…'; the age screen link reads 'Erasing…'. | apps/mobile/app/(app)/settings/storage.tsx:329; apps/mobile/src/features/auth/components/AgeRefused.tsx:73 |
| Failure | Alert 'Wipe failed'; the user can retry. | apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:34 |
| Provider-sharing withdrawal cannot be recorded | Nothing is deleted (tested). | apps/mobile/__tests__/local-data-wipe-order.test.ts:227 |
| Best-effort cleanup failure | Does not block the wipe (tested). | apps/mobile/__tests__/local-data-wipe-order.test.ts:300 |
| Older builds with a provider_keys table | Deleted if present; missing table ignored. | apps/mobile/services/dsarExport.ts:441 |
| Offline | Wipe is local; sign-out and sharing withdrawal over the network may need care, behaviour not traced. | apps/mobile/services/dsarExport.ts:428 |
| Accessibility | Row has role button with label 'Delete all local data'. | apps/mobile/app/(app)/settings/storage.tsx:527 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/local-data-wipe-order.test.ts`: Sign-out, sharing withdrawal first, nothing deleted if withdrawal fails, model folders, attachments, exports, failure propagation.
- `apps/mobile/__tests__/local-data-reset.test.ts`: Defaults restored after the wipe.
- `apps/mobile/__tests__/AgeGateContract.test.tsx`: Age gate flows that use the erase hook (name-based).
- `apps/mobile/__tests__/MinorModeNotChildClearable.test.tsx`: Minor mode state after clearing (name-based).
- `apps/mobile/__tests__/UpgradeFromAndroidBuild6.test.tsx`: Uses the erase hook (name-based).
- `apps/mobile/__tests__/LocalDataResetNotice.test.tsx`: Notice after a local data reset (name-based).

**Test scenarios**

- **Happy path wipe**
  1. Create a chat, add a memory, download a model.
  2. Settings, Storage, Danger Zone, Delete everything; confirm twice.
  - Expected: Overlay shows; app lands on onboarding; chats, memory and model are gone.
- **Cancel**
  1. Start the wipe; tap Cancel on the first, then on the second alert.
  - Expected: No data is removed.
- **Failure**
  1. Force a database delete failure in a test build; confirm both alerts.
  - Expected: 'Wipe failed' alert; app usable.
- **Signed-in device**
  1. Sign in; run the wipe.
  - Expected: All accounts signed out; Cloud data remains in the account.
- **Age refusal**
  1. Trigger an age refusal; tap 'Erase this device's data'; confirm.
  - Expected: Same two alerts and wipe.

**Where to look when it fails**

- Alert 'Wipe failed'.
- Check tables and key-value keys after the wipe.
- Look for the 'Deleting all local data…' overlay stuck on screen.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/041-temporary-and-private-experiences.md](../../70-qa/test-plans/mobile/041-temporary-and-private-experiences.md)

## 10. Gaps and dependencies

- **No equivalent on Web, Desktop, CLI, VS Code, Chrome** Affects: Those five apps. Evidence: brief S41.17. Work needed: Define the set of local data per app and add a confirm-then-clear action, e.g. CLI config and sessions folder, Chrome storage.
- **Alert says 'all conversations, memory' without saying Cloud copies stay** Affects: Mobile signed-in users. Evidence: apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:12; apps/mobile/services/dsarExport.ts:425. Work needed: Add a sentence naming Cloud data and how to delete it.
- **No Trash or recovery step** Affects: Mobile. Evidence: apps/mobile/services/dsarExport.ts:460. Work needed: Confirm with the owner whether the user-initiated wipe may stay permanent.
- Not built on: Web, Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:mobile
- mode:local
- mode:cloud
- store:sqlite
- store:mmkv
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- F041-08
- F041-09

## Unknown

- What the Mobile 'Delete everything' does to Cloud-side sign-out beyond local session end (server effect not traced).
- Behaviour of the wipe while a model download or Cloud run is active.
- Whether the success route lands on the age gate before onboarding on every platform (route constant AGE_GATE_PATH not opened).
- Exact mechanism of Clerk device sign-out calls.
