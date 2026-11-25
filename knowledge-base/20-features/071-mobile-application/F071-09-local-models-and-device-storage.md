---
id: "F071-09"
type: "feature"
title: "Local models and device storage"
aliases: ["Storage screen", "Settings, Storage", "Offline data management", "Download over cellular", "Delete everything", "Danger Zone", "Clear cache", "On-device models", "Local Mode models"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.28", "S71.29", "S71.30"]
depends_on: ["surface:mobile", "mode:local", "SYS-local-inference", "SYS-model-catalog-and-routing", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-execution-boundaries", "store:mmkv-encrypted", "store:sqlite-installed_models", "table:installed_models", "file:packages/contracts/types/src/on-device-models.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-09 Local models and device storage

In AGI Mobile, a person downloads a model and chats with it on the device without Cloud or payment. The Storage screen shows what AGI uses, lets them remove a model, clear the cache or delete all local data, and holds the cellular download switch.

Area: [71. Mobile application](README.md). Requirement items: [S71.28](../../10-requirements/capabilities/071-mobile-application.md#s7128), [S71.29](../../10-requirements/capabilities/071-mobile-application.md#s7129), [S71.30](../../10-requirements/capabilities/071-mobile-application.md#s7130).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Downloads on-device models (Wi-Fi by default), runs chats with them locally, and shows and frees the space they use. It also offers a full device wipe (apps/mobile/app/(app)/settings/storage.tsx; apps/mobile/src/features/model-picker/installStore.ts; apps/mobile/stores/chat/chatExecutionStore.ts:3037-3050).

**Why it exists.** The brief requires visible storage and removal controls (S71.28), a cellular preference (S71.29) and local chat without the cloud (S71.30). Local inference is free of any paid subscription (product rule in the task brief).

**Who uses it.** Mobile users who chat offline or privately, and anyone short of space.

**Problems it solves**

- Models are several gigabytes; people need to see and remove them.
- Mobile data is not used unless allowed.
- One place to wipe data from the device.

**Use cases**

- Download a model in onboarding over Wi-Fi.
- Remove an unused model to free space.
- Clear cache after exporting files.
- Delete everything before handing over a phone.

## 2. User experience

**Where to find it**

- Mobile: Settings, General, Storage; also from Data controls and from the settings home (apps/mobile/src/features/settings/general/index.tsx:197; apps/mobile/src/features/settings/data-controls/index.tsx:442; apps/mobile/src/features/settings/index.tsx:741). Screen title 'Storage' (apps/mobile/app/(app)/settings/storage.tsx:381).
- Model download: onboarding device-tier card ('Download model' button, 'Download over cellular too' switch) (apps/mobile/app/(public)/onboarding.tsx:746-770) and the model picker sheet (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx).

**Before you start**

- No sign-in or plan for Local mode (see access).
- A device that can run the chosen model; some are locked for low RAM or no native runtime (apps/mobile/src/features/model-picker/installStore.ts:117-190).

**Screens and controls**

- Summary line 'AGI uses X of Y on this device' with a meter, or 'Measuring…' (apps/mobile/app/(app)/settings/storage.tsx:112-139).
- Card 'On This Device': 'Downloaded models (estimated)', 'Cache', 'Free space', and 'Try again' on failure.
- Switch 'Download over cellular' ('Off waits for Wi-Fi. Models are several gigabytes.').
- Card 'Downloaded Models' with a trash button per model.
- Privacy card: 'Export all my data', 'Clear cache'.
- Danger Zone: 'Delete everything'.

**Journey**

1. Open Storage and read the totals.
2. To remove a model, tap its trash icon; confirm 'Delete <name>?'.
3. To clear cache, tap 'Clear cache' and confirm.
4. To wipe, tap 'Delete everything', confirm 'Delete all local data?' then 'Are you absolutely sure?'.
5. To download, choose a model in onboarding or the picker, optionally turn on the cellular switch, tap Download.

**What the person sees and gets**

- 'Deleting all local data…' overlay during a wipe (storage.tsx:311-322).
- Alerts 'Model removal failed', 'Storage refresh failed', 'Wipe failed' (storage.tsx:170-185; apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:33-36).
- Download errors with the real cause, such as 'This download needs Wi-Fi...' or a storage-full message (apps/mobile/services/modelDownload.ts:194-225).

**Settings**

- Download over cellular (persisted) (apps/mobile/src/features/model-picker/installStore.ts:379-384, 641).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Install states ready, download_required, downloading, failed, unavailable, locked (apps/mobile/src/features/model-picker/installStore.ts:56-57).
- Wi-Fi only by default; cellular allowed only after the switch; the check reads the live network type before every download (apps/mobile/src/features/model-picker/installStore.ts:379, 521; apps/mobile/services/modelDownload.ts:194-209).
- Free space is checked before the first byte with a 256 MB headroom (apps/mobile/services/modelDownload.ts:189-225).
- Three install paths: GGUF files (llama.rn runtime), ExecuTorch presets, and OS system models that need no download (apps/mobile/src/features/model-picker/installStore.ts:117-215, 521-560; apps/mobile/src/features/model-picker/localModelRuntime.ts).
- A Local chat cannot send to a Cloud model: 'This is a Local Mode chat. Start a separate AGI Cloud chat to use Cloud models.' (apps/mobile/stores/chat/chatExecutionStore.ts:2262-2270).
- Local turns run through the local runtime without the remote gate (apps/mobile/stores/chat/chatExecutionStore.ts:2368, 3037-3050).
- Delete model with warning, busy-model message and refresh (apps/mobile/app/(app)/settings/storage.tsx:239-285).
- Clear cache alert (storage.tsx:287-305).
- Delete everything: two alerts, then wipe of databases, key-value store, model folders, exports and attachments, with sign-out (apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:9-44; apps/mobile/services/dsarExport.ts:425-472).
- Totals show 'Measuring…' and 'Try again' (storage.tsx:112-139, 315-327).

**Incomplete**

- Clear cache deletes the cache folder with no error handling or failure alert; it then sets the cache size to 0 even if deletion failed (apps/mobile/app/(app)/settings/storage.tsx:292-299).
- Model sizes are labelled 'Estimated' (storage.tsx:395-410).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- The brief lists S71.29 'Cellular-data preferences' as not applicable anywhere, but the cellular switch and its enforcement exist on Mobile (doc: area brief S71.29 vs apps/mobile/services/modelDownload.ts:194-209). Code wins.
- Other apps: n/a for this feature.

## 4. Required behaviour

**Established requirements**

- The user can see how much data is stored on the device and delete models, cache or all local data. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.28)
- The user can choose whether large transfers use cellular data, and the app obeys it. (source: S71.29)
- In Local mode the user can download a model and chat with it on the device without the cloud. (source: S71.30)
- Local inference on mobile is free of any paid subscription; sign-in is a separate question. (source: task brief product requirements)
- Agents never destroy user data on their own; permanent removal comes only from an explicit user action that names what is lost. (source: AGENTS.md section 9)

**Acceptance criteria**

1. With the cellular switch off and the device on mobile data, a download refuses with the Wi-Fi message.
2. With the switch on, the same download starts.
3. A model in use cannot be deleted; the message 'This model is replying now. Try again when it finishes.' shows.
4. After deleting a model, the list and totals drop it and a re-download is possible.
5. Clear cache leaves chats and models in place.
6. Delete everything needs two confirmations, then signs out and returns to the age gate; a failure shows 'Wipe failed'.
7. A Local chat refuses a Cloud model with the stated message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Delete everything is expected to remove model files too, since the alert names models and MODEL_STORAGE_DIRS are deleted [inferred from apps/mobile/services/dsarExport.ts:460-462].
- Model rows with a runtime that cannot be removed show 'Model removal unavailable' [inferred from storage.tsx:240-243].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Catch and report a failed cache deletion.
- [proposed] Use the shared confirm surface for Delete everything if AGENTS.md section 9 applies to mobile alerts.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Storage screen | `apps/mobile/app/(app)/settings/storage.tsx` | Totals, model list, cellular switch, clear cache, export, wipe. |
| store | useModelInstallStore | `apps/mobile/src/features/model-picker/installStore.ts` | Install states, prepareModel, cancel, cellular flag. |
| service | modelDownload | `apps/mobile/services/modelDownload.ts` | Network and space checks, download, checksum, removal. |
| service | executorchModels | `apps/mobile/services/executorchModels.ts` | ExecuTorch preset install and removal. |
| service | modelStoragePaths | `apps/mobile/services/modelStoragePaths.ts` | Model file locations. |
| table | installed_models | `apps/mobile/storage/installedModels.ts` | Local SQLite record of installed models. |
| service | Local model runtime resolver | `apps/mobile/src/features/model-picker/localModelRuntime.ts` | Chooses installed model or system model. |
| service | Local LLM package | packages/ai/local-llm/src (not found) (not found) | Runtime abstraction (imported as @agiworkforce/local-llm). |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Local versus cloud send rules and local turn. |
| component | ModelPickerSheet | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Picker with download buttons. |
| service | Download confirmation | `apps/mobile/src/features/model-picker/downloadConfirmation.ts` | 'Wi-Fi needed' and size alerts. |
| screen | Onboarding device tier | `apps/mobile/app/(public)/onboarding.tsx` | First download with cellular toggle. |
| hook | useEraseDeviceData | `apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts` | Two-step wipe flow. |
| service | wipeAllLocalData | `apps/mobile/services/dsarExport.ts` | Wipes SQLite tables, key-value store, model folders, exports, attachments. |
| component | Storage breakdown | `apps/mobile/src/features/settings/StorageBreakdownCard.tsx` | Breakdown card on the screen. |
| service | Directory size | `apps/mobile/src/features/settings/storageUsage.ts` | getDirectorySizeBytes. |
| store | Encrypted key-value storage | `apps/mobile/lib/mmkv.ts` | Holds chats and settings; cleared by the wipe. |
| config | Backup exclusion | `apps/mobile/native/ios/AGIBackupExclusion.swift` | Keeps model files out of device backups (called from the install store). |
| service | On-device model catalog types | `packages/contracts/types/src/on-device-models.ts` | OnDeviceModel with download URL, checksum, size. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person taps Download; network type and free space are checked. | device | apps/mobile/services/modelDownload.ts:194-225 |
| The model file is downloaded from the catalog's download URL, checked against its checksum and recorded. | outside service | apps/mobile/src/features/model-picker/installStore.ts:196-230; apps/mobile/services/modelDownload.ts:432-470 (host not established) |
| Record is written to the installed_models table and files are excluded from backup. | device | apps/mobile/src/features/model-picker/installStore.ts:545-548 |
| A Local chat resolves the model and streams tokens from the on-device runtime. | device | apps/mobile/stores/chat/chatExecutionStore.ts:3037-3050 |
| Delete removes the files, the table row and the store entry. | device | apps/mobile/app/(app)/settings/storage.tsx:253-262 |
| Delete everything signs out accounts, deletes data, deletes model and export folders. | device and our servers | apps/mobile/services/dsarExport.ts:425-472 (sign-out and provider-sharing withdrawal contact the server) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Model files | App documents model folders (MODEL_STORAGE_DIRS) | No; excluded from backup | Removed by trash icon or Delete everything |
| Installed model records | SQLite table installed_models | No | Deleted with the model and by the wipe (dsarExport.ts:440) |
| Cellular preference | Persisted install store (installStore.ts:641) | No | Cleared by the wipe when the key-value store is cleared |
| Local chats | Encrypted key-value storage 'chat-message-store-local' | No | Cleared by the wipe |
| Cache | App cache directory | No | Clear cache |

**Models and providers.** Local models come from the on-device catalog; the runtime is llama.rn for GGUF files, ExecuTorch presets, or OS system models (Apple foundation model, Android AICore) (apps/mobile/src/features/model-picker/installStore.ts:117-215; apps/mobile/src/features/model-picker/localModelRuntime.ts). No provider key or cloud call is used for a Local turn. See SYS-local-inference.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account is required for a Local chat: the remote-disabled check is skipped for the local runtime (apps/mobile/stores/chat/chatExecutionStore.ts:2368). Wipe signs out any account. |
| Permissions | Storage is app private; no extra permission found for this screen. |
| Subscription | none found in the code for Local downloads or chats; Cloud models in the picker are locked by plan (apps/mobile/src/features/model-picker/service.ts:181-213). |
| Limits and metering | Free-space headroom 256 MB (apps/mobile/services/modelDownload.ts:189). RAM gate: on-device vision needs 3.5 GB (installStore.ts:117-118). No usage metering for local turns found. |
| Feature flags | none found for the storage screen. Cellular flag defaults false (installStore.ts:379). |
| Model compatibility | A Local chat can only use local models; a Cloud chat only cloud or Auto (chatExecutionStore.ts:2262-2285). |
| Provider restrictions | none for local models. The wipe withdraws provider sharing before signing out (apps/mobile/services/dsarExport.ts:426-428). |
| Local mode | This is the Local mode feature: on-device chat, no Cloud, no payment, works offline after download. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading totals | 'Measuring…'. | apps/mobile/app/(app)/settings/storage.tsx:61-65, 89 |
| Read failed | 'Unavailable' and a 'Try again' button. | storage.tsx:61-64, 315-327 |
| No models | 'No models downloaded. Get one in Settings → General → Models.' | storage.tsx:420-425 |
| Offline download | 'This device is offline, so the download cannot start. Reconnect and try again.' | apps/mobile/services/modelDownload.ts:194-199 |
| Storage full | States needed and free space. | apps/mobile/services/modelDownload.ts:216-225 |
| Mid-download cancel | Job cleared and Download offered again. | apps/mobile/src/features/model-picker/installStore.ts:565-578 |
| Model replying | Removal refused with a message. | apps/mobile/services/modelDownload.ts:68; storage.tsx:266-272 |
| Wipe failure | 'Wipe failed' and the overlay closes. | apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:31-37 |
| Clear cache failure | not handled in the code | apps/mobile/app/(app)/settings/storage.tsx:292-299 |
| Large text | Rows stack for large text. | storage.tsx:75-79 |
| Resume after app kill during download | unknown; an onboarding background download test exists | apps/mobile/__tests__/OnboardingBackgroundDownload.test.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/StorageModelDeleteClearsReady.test.tsx`: Deleting a model clears its ready state
- `apps/mobile/__tests__/StorageBreakdownCard.test.tsx`: Breakdown card
- `apps/mobile/__tests__/StorageLargeText.test.tsx`: Large text layout
- `apps/mobile/__tests__/StorageMeter.test.tsx`: Meter bar
- `apps/mobile/__tests__/model-download-policy.test.ts`: Download rules (by name)
- `apps/mobile/__tests__/model-install-lifecycle.test.ts`: Install lifecycle
- `apps/mobile/__tests__/model-install-backup-exclusion.test.ts`: Backup exclusion
- `apps/mobile/__tests__/local-data-wipe-order.test.ts`: Order of wipe steps
- `apps/mobile/__tests__/ModelRowCancelDownload.test.tsx`: Cancel a download
- `apps/mobile/src/features/model-picker/__tests__/downloadConfirmationWording.test.ts`: Wi-Fi needed wording
- `apps/mobile/src/features/settings/__tests__/storageUsage.test.ts`: Directory size
- `apps/mobile/__tests__/gguf-picker-install.test.ts`: GGUF install from the picker

**Test scenarios**

- **Cellular refusal**
  1. Turn the cellular switch off.
  2. On mobile data, tap Download.
  - Expected: Wi-Fi needed message; nothing downloads.
- **Cellular allowed**
  1. Turn the switch on.
  2. Tap Download on mobile data.
  - Expected: Download starts and shows progress.
- **Delete a model**
  1. Open Storage.
  2. Tap the trash icon, confirm.
  - Expected: Model leaves the list; totals update.
- **Delete while replying**
  1. Start a local reply.
  2. Try to delete that model.
  - Expected: Busy message; model stays.
- **Clear cache**
  1. Tap Clear cache, confirm.
  - Expected: Cache reads 0; chats and models remain.
- **Delete everything**
  1. Tap Delete everything.
  2. Confirm both alerts.
  - Expected: Overlay shows, data is gone, signed out, age gate appears.

**Where to look when it fails**

- Log '[installStore] prepareModel(<id>) failed' (installStore.ts:567).
- Error names ModelDownloadError (kinds offline, wifi_required, storage_full, cancelled) and ModelRemovalError.
- Warning '[chatMessageStore] Hydration failed' for local chat store.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **Clear cache has no error handling; a failed delete still shows 0.** Affects: Mobile users. Evidence: apps/mobile/app/(app)/settings/storage.tsx:292-299. Work needed: Catch, report, re-measure.
- **Brief marks the cellular preference not applicable although it is built.** Affects: Documentation. Evidence: area brief S71.29; modelDownload.ts:194-209. Work needed: Update the brief.
- **Model sizes and the 'Downloaded models' total are estimates.** Affects: Mobile users. Evidence: storage.tsx:395-410. Work needed: Measure real file sizes if exact figures are wanted.
- **Delete everything uses plain alerts; whether the shared confirm surface is required on mobile is not stated.** Affects: Mobile users. Evidence: useEraseDeviceData.ts:9-44; AGENTS.md section 9. Work needed: Owner call.

**Depends on**

- surface:mobile
- mode:local
- SYS-local-inference
- SYS-model-catalog-and-routing
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-execution-boundaries
- store:mmkv-encrypted
- store:sqlite-installed_models
- table:installed_models
- file:packages/contracts/types/src/on-device-models.ts

## Unknown

- Host and licence of model download URLs (catalog contents not opened).
- Whether a download resumes after the app is killed.
- Which devices lock which models (RAM table not fully read).
- How the wipe behaves when the server is unreachable during sign-out.
- Tests were not read line by line.
