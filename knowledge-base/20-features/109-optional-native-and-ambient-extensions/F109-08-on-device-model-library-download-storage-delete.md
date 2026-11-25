---
id: "F109-08"
type: "feature"
title: "On-device model library (download, storage, delete)"
aliases: ["On-device model library", "Model download manager", "Local-model download manager", "Local-model storage manager", "Downloaded Models", "Download over cellular", "Models screen (On device group)"]
area: "109 Optional native and ambient extensions"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S109.18", "S109.19"]
depends_on: ["surface:mobile", "mode:local", "SYS-local-inference", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-security-and-privacy", "store:installed_models", "store:agi-model-install-v1", "file:apps/mobile/services/modelDownload.ts", "file:packages/platform/local-llm/src/catalog.ts", "F109-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-08 On-device model library (download, storage, delete)

On AGI Mobile, a person picks an on-device model in the model picker, confirms a download, watches progress, and can cancel. Settings, Storage lists each downloaded model with its size and a Delete button. Downloads need Wi-Fi unless the cellular switch is on, and need free space. CLI and VS Code have no equivalent.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.18](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10918), [S109.19](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10919).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists on-device models from a built-in catalog, downloads a chosen model file over HTTPS with a checksum check, records it as installed, and lets the person delete it later to free space (apps/mobile/services/modelDownload.ts:432-566, :633-670).

**Why it exists.** Local models are free of any subscription and work without our servers once downloaded, but the files are several gigabytes, so the person needs control over data use and storage. The brief requires browse, download with progress and pause or cancel, and a storage view with delete (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md, S109.18 and S109.19).

**Who uses it.** Phone users who want private, offline or free chat on the device.

**Problems it solves**

- Surprise mobile-data bills from a multi-gigabyte download.
- Failed downloads that fill the phone without warning.
- Corrupt files: the file hash is checked.
- No way to see what the models use or remove them.

**Use cases**

- Download the default on-device model on Wi-Fi at home and chat offline later.
- Cancel a download that was started by mistake.
- Delete a model in Settings, Storage to free space before a trip.

## 2. User experience

**Where to find it**

- Mobile: the model picker sheet and the 'Models' screen, where on-device models sit in a group titled 'On device' (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:937; apps/mobile/app/(app)/models.tsx:321). Settings, General, row 'Models' opens it (apps/mobile/src/features/settings/general/index.tsx:176-182).
- Mobile: Settings, General, row 'Storage' opens 'Storage' with 'Download over cellular' and 'Downloaded Models' (apps/mobile/app/(app)/settings/storage.tsx:389, :409).
- Onboarding also shows the picker with local scope (apps/mobile/app/(public)/onboarding.tsx:476).
- CLI and VS Code: not available (area brief S109.18, S109.19).

**Before you start**

- Enough free space: model size plus 256 MB headroom (modelDownload.ts:189, :213-227).
- Wi-Fi, or the cellular switch on (modelDownload.ts:193-211).
- No sign-in or plan check was found in the download code (apps/mobile/services/modelDownload.ts, whole file).

**Screens and controls**

- Model row: tap a model marked 'download required' to start; rows say 'Tap to download, long press to favorite', 'Model download is in progress', 'Tap to retry download' (ModelRow.tsx accessibility hints).
- Confirmation alert 'Download <name>?' with 'Cancel' and 'Download'; on mobile data without consent the alert 'Wi-Fi needed' appears with 'OK' (apps/mobile/src/features/model-picker/downloadConfirmation.ts:29-70).
- 'Cancel download' button under a downloading row, accessibility label 'Cancel downloading <name>' (ModelRow.tsx:324-331).
- Storage: switch 'Download over cellular' (hint 'Off waits for Wi-Fi. Models are several gigabytes.'), card 'Downloaded Models' with 'Estimated <size>' per model, trash button 'Delete <name>' (storage.tsx:385-451).
- Delete confirmation 'Delete <name>?' with 'This removes the downloaded model files. You can re-download the model later.' (storage.tsx:246-249).

**Journey**

1. 1. Open the model picker or Settings, General, Models.
2. 2. Choose a model in the 'On device' group that is not downloaded.
3. 3. Read the 'Download <name>?' alert (size, mobile-data note) and tap 'Download'.
4. 4. The store checks network and free space, then downloads; the row shows a percentage.
5. 5. Optionally tap 'Cancel download'; the row returns to 'download required'.
6. 6. On finish the file hash is checked, the model is recorded as installed and the picker selects it.
7. 7. Later, open Settings, General, Storage; tap the trash icon next to the model and confirm 'Delete'.

**What the person sees and gets**

- Progress percentage in the row; a 'Loading models…' indicator while installed models are read (ModelPickerSheet.tsx:355-358, :876-883).
- Error texts: 'This download needs Wi-Fi. Connect to Wi-Fi, or turn on Settings, Storage, Download over cellular to use mobile data.'; 'This device is offline, so the download cannot start. Reconnect and try again.'; 'This model needs <size> free and this device has <size>. Free up space and try again.'; 'Integrity check failed for <name>. The downloaded file is corrupt. Please try again.'; 'Download was cancelled.' (modelDownload.ts:193-227, :522, :544).
- Delete errors: 'Model removal failed' with 'This model is replying now. Try again when it finishes.' for ExecuTorch busy case, otherwise 'Could not remove the model. Refresh Storage and try again.' (storage.tsx:262-272; modelDownload.ts:68).

**Settings**

- 'Download over cellular' switch, stored as allowCellularDownloads in persisted store 'agi-model-install-v1', default off, and pushed to native code for the system model (installStore.ts:382-385, :639-641).
- Model files are kept out of device backup (modelDownload.ts:100-107).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Download of a GGUF model file with HTTPS-only URL, SHA-256 hex check, resume data saved on failure, backup exclusion and install record (modelDownload.ts:120-170, :313-420, :432-566).
- Optional vision projector file downloaded and verified with the model (modelDownload.ts:490-526).
- ExecuTorch presets download through the same network and space gate (installStore.ts:521-545).
- Cancel clears the job, bumps a generation counter so late progress is ignored, and pauses the download (modelDownload.ts:303-311; installStore.ts:597-612).
- Storage screen lists installed models, estimated sizes, free space and cache, with retry on read failure and delete (storage.tsx:186-451).
- Deletion removes the model directory only when the stored record still matches (modelDownload.ts:633-670).

**Incomplete**

- A cancelled download may not keep its resume data: on pause, the resume file is written only in the error path, while the cancel path throws before it (modelDownload.ts:341-388) [inferred]. Whether a cancelled GGUF download truly resumes later is not verified.
- The 'model is replying' block exists for ExecuTorch models (releaseExecutorchPreset fails). deleteDownloadedModel for a GGUF model removes the folder without an in-use check (modelDownload.ts:633-670, :608-631) [inferred].
- Sizes shown are estimates taken from catalog numbers, labelled 'Estimated' (storage.tsx:409-440).
- getModelStorageBytes reads the size of a directory entry and may not give the real total; the Storage screen uses getDirectorySizeBytes instead (modelDownload.ts:672-676; storage.tsx:32) [inferred].

**Present but disconnected or switched off**

- Models with availability 'locked' or non-local surface do not start a download; they show a lock reason (installStore.ts:432-445).
- Multimodal models are blocked on low-RAM devices with a stated reason (installStore.ts:117-134).

**Not available**

- CLI: no download command; 'agi models' only lists, probes and sets models in local servers (apps/cli/src/lib.rs:1861-1887).
- VS Code: no on-device model download; its Local model note refers to Ollama and LM Studio running on the computer (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1600-1601).
- Desktop and Chrome: not listed in the brief; no code was searched for them beyond the brief [unknown].

## 4. Required behaviour

**Established requirements**

- The user can browse, download (with progress, pause or cancel) and install local models from inside the app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.18)
- The user can see how much space each local model uses and delete models to free storage. (source: S109.19 (same brief))
- Downloads check free space and Wi-Fi or cellular consent before they start. (source: apps/mobile/services/modelDownload.ts:189-235)
- Model files are excluded from device backup. (source: apps/mobile/services/modelDownload.ts:100-107)
- Failures are reported with a kind: wifi_required, offline, checksum_mismatch, storage_full, network_error, cancelled, already_installed. (source: apps/mobile/services/modelDownload.ts:41-61)
- Local inference on mobile is free of any paid subscription (project requirement stated in the task). (source: task brief)

**Acceptance criteria**

1. On cellular with the switch off, choosing a download shows 'Wi-Fi needed' and nothing downloads.
2. With less free space than size plus 256 MB, the error names both numbers and nothing is written.
3. While downloading, 'Cancel download' returns the row to 'download required' and no model is marked installed.
4. A finished download whose file hash differs is deleted and 'Integrity check failed' is shown.
5. After a successful install, Settings, Storage lists the model with an estimated size, and Delete removes it and the picker stops saying ready.
6. Model files are marked excluded from device backup after a download.
7. Starting a second download of the same model while one runs is refused (already downloading).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Download needs no sign-in because the code has no account check [inferred]; a separate app-level gate (first-run age check or terms) might still apply and was not traced.
- Resume after cancel is intended by the resume file design [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show real bytes per model rather than catalog estimates.
- [proposed] Block deletion of a loaded GGUF model with the same 'replying' message.
- [proposed] Offer 'Pause' and 'Resume' labels, not only 'Cancel download'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | modelDownload | `apps/mobile/services/modelDownload.ts` | Gates, downloads, verifies, installs and deletes model files. |
| store | useModelInstallStore | `apps/mobile/src/features/model-picker/installStore.ts` | Job states, cellular consent, prepare, cancel and forget, persisted as 'agi-model-install-v1'. |
| component | ModelPickerSheet | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Lists models, group 'On device', starts downloads, loading state. |
| component | ModelRow | `apps/mobile/src/features/model-picker/components/ModelRow.tsx` | Row states, progress and 'Cancel download'. |
| service | confirmModelDownload | `apps/mobile/src/features/model-picker/downloadConfirmation.ts` | 'Download <name>?' and 'Wi-Fi needed' alerts. |
| screen | Models screen | `apps/mobile/app/(app)/models.tsx` | Hosts the picker; scope local or all. |
| screen | Storage screen | `apps/mobile/app/(app)/settings/storage.tsx` | Sizes, cellular switch, delete and cache. |
| service | Installed models storage | `apps/mobile/storage/installedModels.ts` | Reads and writes table installed_models on the device. |
| service | modelStoragePaths | `apps/mobile/services/modelStoragePaths.ts` | MODELS_DIR and EXECUTORCH_MODELS_DIR locations. |
| service | executorchModels | `apps/mobile/services/executorchModels.ts` | Preset files, release and delete for ExecuTorch models. |
| service | backupExclusion | `apps/mobile/src/platform/backupExclusion.ts` | Marks directories as excluded from backup. |
| config | On-device catalog | `packages/platform/local-llm/src/catalog.ts` | Catalog entries: sizes, checksums, hosting URLs, runtimes. |
| service | local-llm multimodal and progress helpers | `packages/platform/local-llm/src/multimodal.ts` | ensureMultimodalArtifacts and checksum error used by download. |
| store | installed_models table | `apps/mobile/storage/installedModels.ts` | Records id, runtime, format, size, hash, local path. |
| store | agi-model-install-v1 (MMKV) | `apps/mobile/src/features/model-picker/installStore.ts` | Only allowCellularDownloads is persisted. |
| test | model-download-policy test | `apps/mobile/__tests__/model-download-policy.test.ts` | Network and free-space gates, removal. |
| test | model-install-lifecycle test | `apps/mobile/__tests__/model-install-lifecycle.test.ts` | Install, cancel and consent behaviour. |
| test | StorageModelDeleteClearsReady test | `apps/mobile/__tests__/StorageModelDeleteClearsReady.test.tsx` | Delete flow and Storage screen states. |
| test | downloadConfirmationWording test | `apps/mobile/src/features/model-picker/__tests__/downloadConfirmationWording.test.ts` | Alert wording. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person taps a model; the app asks 'Download <name>?' and checks whether the device is on mobile data. | device | downloadConfirmation.ts:29-70 |
| prepareModel sets the job to 'downloading', reads the cellular consent and calls downloadModel. | device | installStore.ts:419-545 |
| Checks offline, Wi-Fi and free space (size plus 256 MB headroom) before writing. | device | modelDownload.ts:193-235 |
| File is fetched over HTTPS from the catalog URL (Hugging Face hosting in the catalog), resumable, in a model folder under the app's documents. | outside service | packages/platform/local-llm/src/catalog.ts:4-12; modelDownload.ts:313-420 |
| SHA-256 of the file is computed in chunks and compared with the catalog value; mismatch deletes the file. | device | modelDownload.ts:258-290, :536-548 |
| A record is inserted into installed_models and the store marks the model ready; backup exclusion is applied. | device | modelDownload.ts:550-566; installStore.ts:559-572 |
| Delete: Storage screen calls deleteDownloadedModel, then deleteInstalledModel and updates the store. | device | storage.tsx:239-284; modelDownload.ts:633-670 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Model files (model.gguf, optional projector, ExecuTorch preset files) | App documents folder under MODELS_DIR; ExecuTorch files under EXECUTORCH_MODELS_DIR | No; excluded from device backup | Kept until deleted from Settings, Storage or 'Delete everything' |
| Partial download resume data (.partial) | Next to the model file | No | Deleted after a completed download; otherwise kept |
| Installed model record | Device database table installed_models | No sync code found for it | Removed on delete |
| Cellular consent flag | MMKV store 'agi-model-install-v1'; copied to native code | No | Persists until changed |

**Models and providers.** The catalog is owned by the local-llm package. Downloads come from a public hosting service named in the catalog, not from our servers and not from a provider in packages/ai/providers. No account or key is sent by the downloader (modelDownload.ts:313-420). Runtimes that run the files are covered by F109-09.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account check found in the download or delete code (apps/mobile/services/modelDownload.ts). |
| Permissions | Needs storage space and network; no OS permission prompt found. Delete asks for confirmation. |
| Subscription | none found in the code; local inference is intended to be free of any paid subscription. |
| Limits and metering | Free space plus 256 MB headroom; Wi-Fi only by default. No usage metering found. |
| Feature flags | Per-model 'availability' (locked, unavailable) and a RAM lock for multimodal models (installStore.ts:117-134). Cellular consent setting. |
| Model compatibility | Only catalog models with a runnable GGUF file or an ExecuTorch preset can install; others show 'The native package for this model is not bundled yet.' (installStore.ts:467-474). Models with the system runtime need no download. |
| Provider restrictions | None found; hosting service is fixed in the catalog. |
| Local mode | Fully usable in Local mode; this feature exists for it. Download needs a network once; after install, chat needs none. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Picker shows 'Loading models…' and rows wait until installed models are read so none flash 'download required'. | ModelPickerSheet.tsx:353-368, :876-883 |
| Empty | Storage says 'No models downloaded. Get one in Settings → General → Models.' | storage.tsx:428-431 |
| Offline | Download refused with the offline message. | modelDownload.ts:193-203 |
| Wi-Fi required | Refused on cellular unless the switch is on; the alert names the setting. | modelDownload.ts:204-210; downloadConfirmation.ts:40-47 |
| Storage full | Refused before writing, with both sizes; also mapped from disk-space errors during write. | modelDownload.ts:213-227, :376-381 |
| Cancel | Job cleared, 'Download was cancelled.' raised internally, no model marked ready. | installStore.ts:597-612; model-install-lifecycle.test.ts:201 |
| Checksum mismatch | File deleted and retry advised. | modelDownload.ts:536-548 |
| Already installed or downloading | Second request refused. | modelDownload.ts:446-460 |
| Failed row | Row shows 'download failed' and tap retries. | ModelRow.tsx hints |
| Storage read failure | 'Could not read downloaded models.' with 'Try reading storage again'. | storage.tsx:318-322, :418-425 |
| Removal unsupported | Alert 'Model removal unavailable' for models without a supported removal method. | storage.tsx:241-244; modelDownload.ts:571-631 |
| App closed mid-download | not handled in the code beyond the partial resume file; whether the job continues in background is unknown. | modelDownload.ts:313-345 |
| Accessibility | Rows announce downloading percent, failed and ready; the Cancel button has a label; the cellular switch has a label. | ModelRow.tsx:89; storage.tsx:399 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/model-download-policy.test.ts`: Wi-Fi, offline and free-space gates, exact headroom boundary, removal of owned directory.
- `apps/mobile/__tests__/model-install-lifecycle.test.ts`: Default Wi-Fi only, consent passing, cancel clearing job, cancelled attempt never marked ready, forget model.
- `apps/mobile/__tests__/StorageModelDeleteClearsReady.test.tsx`: Delete drops model from picker readiness, cellular switch, free space, unreadable list retry, refresh failure after removal.
- `apps/mobile/__tests__/model-install-backup-exclusion.test.ts`: Backup exclusion (by name).
- `apps/mobile/__tests__/installed-models-storage.test.ts`: installed_models storage (by name).
- `apps/mobile/__tests__/gguf-picker-install.test.ts`: Picker install of GGUF models (by name).
- `apps/mobile/src/features/model-picker/__tests__/downloadConfirmationWording.test.ts`: Alert wording (by name).
- `packages/platform/local-llm/src/__tests__/catalog.test.ts`: Catalog entries (by name).

**Test scenarios**

- **Cellular refusal**
  1. Turn Wi-Fi off, use mobile data, switch 'Download over cellular' off.
  2. Tap a model marked download required.
  - Expected: 'Wi-Fi needed' alert; no download starts.
- **Download and cancel**
  1. On Wi-Fi tap a model, confirm 'Download'.
  2. At about 20 percent tap 'Cancel download'.
  - Expected: Row returns to download required; model absent from Storage; start again and see whether it resumes.
- **Low space**
  1. Fill the device until free space is below the model size plus 256 MB.
  2. Start a download.
  - Expected: Message with both sizes; no file created.
- **Delete**
  1. Install a model.
  2. Settings, General, Storage, trash icon, 'Delete'.
  - Expected: Model removed; picker shows download required; space returns.
- **Backup exclusion**
  1. Install a model.
  2. Inspect the model folder's backup flag on device.
  - Expected: Folder is excluded from backup.
- **Delete during reply**
  1. Start a reply on an ExecuTorch model.
  2. Try to delete it in Storage.
  - Expected: 'This model is replying now. Try again when it finishes.'

**Where to look when it fails**

- Console lines '[installStore] prepareModel(<id>) failed:' and '[modelDownload] Could not keep the partial download to resume:'.
- Error class ModelDownloadError with kind; ModelRemovalError.
- installed_models table and the model folder under the app documents.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **Resume after cancel is not proven; the resume file is written only on error.** Affects: Mobile users cancelling large downloads.. Evidence: modelDownload.ts:303-311, :341-388. Work needed: Test cancel then retry on a device and fix if it restarts.
- **No in-use check before deleting a GGUF model.** Affects: Mobile users deleting a loaded model.. Evidence: modelDownload.ts:633-670. Work needed: Check loadedLocalModel() and block with the busy message.
- **No CLI or VS Code on-device model library.** Affects: CLI and VS Code users.. Evidence: area brief S109.18, S109.19; apps/cli/src/lib.rs:1861-1887. Work needed: Decide whether on-device models belong to these surfaces; otherwise record the brief as n/a.
- **Sizes are catalog estimates, not measured per model.** Affects: Mobile users.. Evidence: storage.tsx:409-440. Work needed: Measure folders.
- **No evidence of background or foreground-service downloads on app close.** Affects: Mobile users.. Evidence: modelDownload.ts (no background task code). Work needed: Verify on device.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:mobile
- mode:local
- SYS-local-inference
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-security-and-privacy
- store:installed_models
- store:agi-model-install-v1
- file:apps/mobile/services/modelDownload.ts
- file:packages/platform/local-llm/src/catalog.ts
- F109-09

## Unknown

- Whether a cancelled GGUF download resumes on the next attempt.
- Whether any app-level sign-in or age gate blocks a first download (not traced).
- Whether downloads continue when the app is in the background.
- Contents of tests marked 'by name' were not opened.
- Hosting terms or availability of the catalog's hosting service.
