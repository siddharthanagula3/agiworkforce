# AGI Workforce Mobile: Auto-Modality Model Selection + Download-on-Demand (LOCAL mode)

## 1. Context & Goal

**Feature**: In LOCAL mode, automatically select the right on-device model based on composer input:

- **Plain text** → fastest text-capable model
- **Image attached** → vision-capable model (qwen2-vl-2b ≻ apple-afm ≻ fallback)
- **Mixed** (image + PDF) → vision model preferred; PDF sent as attachment
- **Audio** → error: "not supported yet"
- **Document (PDF/doc/txt)** → text model (PDFs don't benefit from vision)

**When needed model not downloaded**: Show modal with size, ETA, Wi-Fi warning, then prompt download. Block send until user approves and download completes, or user cancels to use fallback text model.

**Constraints**:

- Reuse 100% existing infra (no new download/runtime services).
- Preserve user manual model choice (if user explicitly picked a model, respect it unless attachment type is incompatible).
- Stay fail-closed in `LOCAL_ONLY` mode (check `remoteChatGate.ts:22-31` before auto-select).
- Enumerate **all edge cases** exhaustively (17 cases, 14 risk mitigations).
- Light verification (typecheck + build + founder UX tests).

---

## 2. Verified Current State (file:line references)

### Model Registry + Vision Metadata

| Component                     | File:Line                                                              | Detail                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Local model registry          | `apps/mobile/src/features/model-picker/service.ts:305`                 | `LOCAL_MODEL_LIST: ModelDef[]` (5 models: qwen3-4b-instruct, llama-3.2-{1b,3b}, qwen2-vl-2b, apple-afm-on-device) |
| Vision flag (source of truth) | `apps/mobile/src/features/model-picker/service.ts:268`                 | `ModelDef.supportsVision` = `model.capabilities.visionIn`                                                         |
| Model lookup                  | `apps/mobile/src/features/model-picker/service.ts:333`                 | `getSelectableModelById(id)` returns local-only models                                                            |
| Default model ID              | `apps/mobile/src/features/model-picker/service.ts:183`                 | `DEFAULT_LOCAL_MODEL_ID = 'qwen3-4b-instruct'`                                                                    |
| Attachment type               | `apps/mobile/src/features/chat/components/AttachmentPreview.tsx:15–30` | `Attachment { mimeType, uri, fileName, fileSize }`                                                                |
| Image detection helper        | `apps/mobile/src/features/chat/components/AttachmentPreview.tsx:53–55` | `isImage(mimeType)` checks `image/*`                                                                              |

### Download Service

| Component            | File:Line                                       | Detail                                                                                                                                 |
| -------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Download entry point | `apps/mobile/services/modelDownload.ts:228–371` | `downloadModel(spec, {onProgress, signal})` — resumable, checksum-verified, Wi-Fi-gated                                                |
| Error types          | `apps/mobile/services/modelDownload.ts:40–46`   | `ModelDownloadErrorKind` enum: `wifi_required`, `checksum_mismatch`, `storage_full`, `network_error`, `cancelled`, `already_installed` |
| Progress callback    | `apps/mobile/services/modelDownload.ts:74–75`   | `onProgress(downloaded, total, speedBps) => void`                                                                                      |
| Wi-Fi gate           | `apps/mobile/services/modelDownload.ts:257–266` | `wifiOnly: true` by default; cellular check via `@react-native-community/netinfo`                                                      |
| Checksum verify      | `apps/mobile/services/modelDownload.ts:345–352` | `verifyChecksum(path, sha256)` — deletes corrupted file on mismatch                                                                    |
| Cancel download      | `apps/mobile/services/modelDownload.ts:216–222` | `cancelDownload(modelId)` via AbortController                                                                                          |

### Install State + Progress Tracking

| Component                  | File:Line                                                       | Detail                                                                                           |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Job status enum            | `apps/mobile/src/features/model-picker/installStore.ts:22–26`   | Status: `ready` \| `download_required` \| `downloading` \| `failed` \| `unavailable` \| `locked` |
| Model prepare orchestrator | `apps/mobile/src/features/model-picker/installStore.ts:121–206` | `prepareModel(model: ModelDef)` — coordinates download + system-model setup + error handling     |
| Status query               | `apps/mobile/src/features/model-picker/installStore.ts:208–212` | `statusForModel(model)` returns cached job or default                                            |
| Installed models list      | `apps/mobile/src/features/model-picker/installStore.ts:107–119` | `hydrateInstalledModels()` from SQLCipher `@react-native-sqlite-storage`                         |
| Progress clamping          | `apps/mobile/src/features/model-picker/installStore.ts:38–42`   | `clampProgress(0..1)` normalization                                                              |

### Auto-Mode Resolution (Existing)

| Component              | File:Line                                                           | Detail                                                                |
| ---------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Auto-mode resolver     | `apps/mobile/src/features/model-picker/localModelRuntime.ts:37–69`  | `resolveAutoModelId(autoModeId, installedIds)`                        |
| auto-premium logic     | `apps/mobile/src/features/model-picker/localModelRuntime.ts:56–63`  | Returns vision model if installed; else apple-afm; else default       |
| auto-economy logic     | `apps/mobile/src/features/model-picker/localModelRuntime.ts:48–54`  | Returns smallest tier='economy' model                                 |
| auto-balanced logic    | `apps/mobile/src/features/model-picker/localModelRuntime.ts:65–68`  | System model, default, or first installed                             |
| System model utilities | `apps/mobile/src/features/model-picker/localModelRuntime.ts:23–31`  | `isSystemModel(model)`, `modelSupportsActiveSystemRuntime()`          |
| Model resolution entry | `apps/mobile/src/features/model-picker/localModelRuntime.ts:71–125` | `resolveLocalModelRef(modelId)` throws on unavailable (lines 122–124) |

### Composer + Message Flow

| Component                | File:Line                                                | Detail                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat screen send handler | `apps/mobile/app/(app)/chat/[id].tsx:80–101`             | `handleSend(text, attachments)` — creates conversation, calls `sendMessage(id, trimmed, selectedModel, attachments)` **[AUTO-SELECT INSERTION POINT: line 93]** |
| Model store selection    | `apps/mobile/src/features/model-picker/store.ts:73–90`   | `setModel(modelId)` commits to store                                                                                                                            |
| Chat execution entry     | `apps/mobile/stores/chat/chatExecutionStore.ts:265–284`  | `sendMessage(conversationId, content, model, attachments)` signature                                                                                            |
| Remote gate check        | `apps/mobile/stores/chat/chatExecutionStore.ts:290, 449` | `getRemoteChatDisabledReason()` — **must run FIRST before auto-select**                                                                                         |
| Image filtering          | `apps/mobile/stores/chat/chatExecutionStore.ts:364–365`  | `imageAttachments = m.attachments?.filter((a) => a.mimeType.startsWith('image/'))`                                                                              |
| File attachment handling | `apps/mobile/stores/chat/chatExecutionStore.ts:370`      | Rendered as text reference: `[Attached file: name (mime)]`                                                                                                      |
| Local inference call     | `apps/mobile/stores/chat/chatExecutionStore.ts:493–503`  | `localGenerate(modelPath, {modelId, messages, tools})` from `@agiworkforce/local-llm`                                                                           |
| Error messaging          | `apps/mobile/stores/chat/chatExecutionStore.ts:154–169`  | `localSetupMessage(error)` — generic 'No model is configured'                                                                                                   |

### Remote Cloud Gate

| Component             | File:Line                                      | Detail                                                                              |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Gate function         | `apps/mobile/services/remoteChatGate.ts:22–31` | `getRemoteChatDisabledReason()` returns null if remote OK, or message if LOCAL_ONLY |
| Must stay fail-closed | `apps/mobile/services/remoteChatGate.ts:26–28` | Checks `v1LocalOnly && !cloudChat` flags                                            |

### UI Patterns (Reusable)

| Component                      | File:Line                                                                      | Detail                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Model picker sheet             | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:66–417` | BottomSheet with model rows, status badges, select logic (lines 135–162)                 |
| Status badges                  | `apps/mobile/src/features/model-picker/components/ModelRow.tsx:141–156`        | Ready \| Download \| Retry \| Soon; progress % display                                   |
| Download orchestration pattern | `apps/mobile/app/(public)/onboarding.tsx:236–324`                              | Shows modal, handles tier2LoadModel vs downloadModel, displays progress %, error routing |
| Byte formatting                | `apps/mobile/app/(public)/onboarding.tsx:106–119`                              | `formatBytes()`, `estimateWifiMinutes()` helpers                                         |
| Wi-Fi toggle pattern           | `apps/mobile/app/(public)/onboarding.tsx:293`                                  | `wifiOnly` param + cellular override UI in download screen                               |

---

## 3. Auto-Selection Algorithm

### 3.1 Precedence Rules

**User Intent > Modality > Default**

```
if (remoteDisabledReason === null) {
  // Cloud mode active, skip auto-select entirely
  return selectedModel; // use cloud router
}

// LOCAL_ONLY mode: apply auto-selection

detectModality(text, attachments) {
  // Returns: 'text-only' | 'has-image' | 'has-pdf' | 'has-audio' | 'has-mixed'
}

if (userManuallyChangedModel) {
  // User explicitly picked a model in last 500ms
  if (selectedModel compatible with modality) {
    return selectedModel; // user intent respected
  } else {
    // incompatible (e.g., text model with audio) — error
    return error;
  }
}

// Auto-select when user hasn't manually chosen
modality = detectModality(text, attachments);

resolvedModel = selectBestModelForModality(
  modality,
  installedIds,
  fallbackChain=[qwen2-vl-2b, apple-afm, qwen3-4b, llama-3.2-3b, llama-3.2-1b]
);

if (!isModelDownloaded(resolvedModel.id)) {
  showDownloadPromptModal(resolvedModel);
  // await user decision + download or cancel
}

return resolvedModel; // pass to sendMessage
```

### 3.2 Modality → Model Selection Map

| Modality                | Selection Logic                     | First Choice               | Fallback Chain                                                                         | Error Case                                                              |
| ----------------------- | ----------------------------------- | -------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `text-only`             | No action                           | Use current/default model  | N/A                                                                                    | N/A                                                                     |
| `has-image`             | Vision required                     | qwen2-vl-2b (if installed) | apple-afm (system), qwen3-4b (text), llama-3.2-3b (text), error: "No vision available" | No vision model available — fallback to text + warn                     |
| `has-pdf`               | Text analysis                       | qwen3-4b (text model)      | llama-3.2-3b, default                                                                  | N/A (PDFs treated as file reference)                                    |
| `has-document`          | Text analysis                       | qwen3-4b (text model)      | llama-3.2-3b, default                                                                  | N/A                                                                     |
| `has-audio`             | Unsupported                         | N/A                        | N/A                                                                                    | Error: "Audio input not supported yet. Use Cloud Managed." — block send |
| `has-mixed` (image+PDF) | Vision for images, file ref for PDF | qwen2-vl-2b (vision)       | apple-afm, qwen3-4b                                                                    | Warn: "PDF will not be analyzed visually"                               |

### 3.3 Manual Override Coexistence

- **Detection**: Track `userModelPickerInteraction` timestamp in store when `setModel()` called.
- **Logic**: If `now() - lastInteractionTime < 500ms`, user explicitly chose → skip auto-override.
- **Fallback**: If user's choice is incompatible with attachment type (e.g., text model + audio) → error "Model does not support audio input."

### 3.4 Insertion Points & Hook

**Primary**: `apps/mobile/app/(app)/chat/[id].tsx:161–216 handleSend()`

```typescript
// NEW: Pre-send auto-selection hook
const { autoSelectModel, waitForDownload } = useAutoModalitySelection(
  text,
  attachments,
  selectedModel,
  userManuallyChanged, // from store timestamp check
);

// BEFORE line 93: sendMessage call
let finalModel = selectedModel;
if (!userManuallyChanged) {
  const { modelId, requiresDownload } = autoSelectModel();
  if (requiresDownload) {
    // Show modal, await download or cancel
    const downloadApproved = await showDownloadPromptModal(getSelectableModelById(modelId));
    if (downloadApproved) {
      await waitForDownload(modelId); // polls installStore.jobs[modelId]
    } else {
      finalModel = selectedModel; // fallback to current
    }
  } else {
    finalModel = modelId;
  }
}

// Then proceed
await sendMessage(conversationId, trimmed, finalModel, attachments);
```

---

## 4. Download-on-Demand State Machine

### 4.1 States & Transitions

```
IDLE
  ↓ (user taps send with attachment requiring download)
PROMPTING
  ├─→ (user taps "Download") → DOWNLOADING
  └─→ (user taps "Not now" or closes) → CANCELLED

DOWNLOADING
  ├─→ (progress 0..100%) → DOWNLOADING (visual only)
  ├─→ (download complete) → VERIFYING
  └─→ (network error, user cancels) → FAILED

VERIFYING
  ├─→ (checksum OK) → READY
  └─→ (checksum mismatch) → FAILED (auto-retry once, then show "Retry" button)

READY
  ↓ (resolve model path via resolveLocalModelRef)
LOADING
  ↓ (localGenerate loads model)
SENT

FAILED / CANCELLED
  ├─→ (user retries download) → DOWNLOADING
  └─→ (user picks different model) → IDLE
```

### 4.2 Orchestration via Existing Infrastructure

**New component reuses**:

1. `downloadModel(spec, {onProgress, signal})` — initiates download
2. `installStore.prepareModel(model)` — wraps download + system-model setup
3. `cancelDownload(modelId)` — abort download on user cancel
4. `verifyChecksum(path, sha256)` — verify integrity (already in downloadModel, lines 345–352)
5. `statusForModel(model)` — poll job status

**New queued-input preservation**:

- Save `{text, attachments}` in local state during download modal display.
- If user cancels download, input remains in Composer for retry or fallback.
- If user approves download, input forwarded to sendMessage after completion.

**New Cancel/Resume/Retry logic**:

- **Cancel**: User taps "Not now" → `cancelDownload(modelId)` called → .partial file saved → return to Composer.
- **Resume**: App backgrounded during download → on return, detect .partial file + show "Resume (45% complete)?" prompt. Or auto-resume in background.
- **Retry**: Download fails (checksum, network) → show error modal with "Retry" button → re-call `downloadModel()` with resume capability.

### 4.3 Modal Component: ModelDownloadPromptSheet

**Location**: `apps/mobile/src/features/chat/components/ModelDownloadPromptSheet.tsx` (new)

**Props**:

```typescript
interface ModelDownloadPromptSheetProps {
  model: ModelDef;
  sizeBytes: number;
  estimatedMinutes: string;
  onDownload: () => Promise<void>; // triggers prepareModel
  onCancel: () => void;
  children?: React.ReactNode; // optional progress display
}
```

**Reuses**:

- `BottomSheet` from `PaywallBottomSheet.tsx:97–162` pattern (forwardRef, useImperativeHandle, handleSheetChange)
- `formatBytes(sizeBytes)` from `onboarding.tsx:106–119`
- `estimateWifiMinutes(sizeBytes)` for ETA display
- `onProgress(downloaded, total, speedBps)` callback from `downloadModel`
- `ModelDownloadErrorKind` enum for error routing (`onboarding.tsx:305–313`)

**UI**:

```
┌─────────────────────────────────────┐
│  Download Model                     │
├─────────────────────────────────────┤
│  Qwen2-VL 2B (Vision)               │
│  2.1 GB ~ 5 min on Wi-Fi            │
│                                     │
│  Wi-Fi recommended for fast speed   │
│  ☐ Allow cellular download          │
│                                     │
│  Progress: [████░░░░░░░░] 45%       │
│  Speed: 4.2 MB/s                    │
│                                     │
│  [Cancel] [Download]                │
└─────────────────────────────────────┘
```

---

## 5. EDGE CASES: Exhaustive Table

| #       | Case                                                              | Trigger                                                                                                                                                       | Detection Point                                                                                                                     | User Facing Behavior                                                                                                                                   | Recovery                                                                                                                                                                                                                             | Reuse Ref                                                                        |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **E1**  | **Empty Input**                                                   | text='', attachments=[]                                                                                                                                       | ChatInput.tsx:113                                                                                                                   | Send button disabled                                                                                                                                   | N/A (blocked pre-send)                                                                                                                                                                                                               | —                                                                                |
| **E2**  | **Text Only**                                                     | No attachments                                                                                                                                                | detectModality returns 'text-only'                                                                                                  | Use current/default model, no switch                                                                                                                   | N/A                                                                                                                                                                                                                                  | store.ts:73 selectedModel                                                        |
| **E3**  | **Single Image + Text**                                           | attachments[0].mimeType='image/jpeg'                                                                                                                          | detectModality returns 'has-image'                                                                                                  | Auto-detect vision → show download modal if qwen2-vl-2b not installed                                                                                  | If cancelled: send with text model + image as attachment                                                                                                                                                                             | modelDownload.ts:228–371, installStore.ts:121–206                                |
| **E4**  | **Multiple Images**                                               | attachments[0..4].mimeType.startsWith('image/')                                                                                                               | detectModality returns 'has-image'                                                                                                  | Auto-select vision model, check localGenerate multi-image support (may warn "only first processed")                                                    | If localGenerate rejects multi-image: send first only + warn                                                                                                                                                                         | chatExecutionStore.ts:364–365                                                    |
| **E5**  | **Image + PDF Mixed**                                             | attachments=[image.jpg, doc.pdf]                                                                                                                              | detectModality returns 'has-mixed' (prioritize 'has-image')                                                                         | Auto-select vision model; PDF sent as file reference (line 370), not visually analyzed                                                                 | User can manually select text model if prefer PDF analysis                                                                                                                                                                           | chatExecutionStore.ts:370 file attachment                                        |
| **E6**  | **PDF Only**                                                      | attachments=[doc.pdf], mimeType='application/pdf'                                                                                                             | detectModality returns 'has-pdf' (not vision)                                                                                       | Auto-select text model (qwen3-4b); PDF sent as file reference                                                                                          | N/A (text model sufficient)                                                                                                                                                                                                          | service.ts:305 LOCAL_MODEL_LIST                                                  |
| **E7**  | **Document Types**                                                | attachments=[report.docx, data.csv]                                                                                                                           | detectModality returns 'has-document'                                                                                               | Auto-select text model (qwen3-4b)                                                                                                                      | N/A                                                                                                                                                                                                                                  | —                                                                                |
| **E8**  | **Audio Attachment**                                              | attachments=[audio.mp3], mimeType='audio/mpeg'                                                                                                                | detectModality returns 'has-audio'                                                                                                  | Error modal: "Audio input not supported yet. Use Cloud Managed." Send blocked                                                                          | User removes audio, retries (modality re-detects), or switches to cloud mode                                                                                                                                                         | remoteChatGate.ts:22–31                                                          |
| **E9**  | **Vision Model Selected But Not Installed, User Adds Image**      | selectedModel='qwen2-vl-2b', attachments=[image], statusForModel='download_required'                                                                          | chat.tsx:93 pre-send hook checks installedIds                                                                                       | Download modal shown ("Download qwen2-vl-2b, 2.1 GB")                                                                                                  | If approved: await prepareModel → send. If 'Not now': send with current model (resolveLocalModelRef throws "not downloaded"); error shown                                                                                            | installStore.ts:208–212 statusForModel                                           |
| **E10** | **No Vision Model Available (Image Attached)**                    | LOCAL_MODEL_LIST.find(m=>m.supportsVision && installed)=undefined; attachments=[image]                                                                        | selectBestModelForModality fallback chain exhausted                                                                                 | Fallback to text model, show banner: "Image attached but vision model not available. Sent as text."                                                    | User can download vision model from Models tab, re-send                                                                                                                                                                              | service.ts:305, localModelRuntime.ts:56–63                                       |
| **E11** | **Model Download In Progress, User Adds Attachment**              | installStore.jobs['qwen2-vl-2b'].status='downloading', user attaches image                                                                                    | auto-detect runs, statusForModel returns 'downloading'                                                                              | Don't show download modal; show progress badge "Downloading 45%" in ModelSelectorButton                                                                | User waits for completion or selects different model manually                                                                                                                                                                        | installStore.ts:22–26 jobs tracking                                              |
| **E12** | **User Manually Selects Model After Auto-Detect**                 | Auto-detect picks vision; user taps ModelPickerSheet, manually selects text model; store.setModel('text-model') called                                        | Check userModelPickerInteraction timestamp in store (line 73 setModel)                                                              | User's manual choice overrides auto-select; text model used                                                                                            | N/A (user intent respected)                                                                                                                                                                                                          | store.ts:73–90 setModel                                                          |
| **E13** | **Device Lacks RAM for Vision Model**                             | Vision model requires 2GB, device has 1GB. Auto-select proceeds, resolveLocalModelRef OK, localGenerate called                                                | localGenerate at chatExecutionStore.ts:493 returns OOM error                                                                        | Error modal: "Local inference failed: Out of memory. Try a smaller model." Message sent fails.                                                         | User can select lite model from picker, or use Cloud Managed. Future: pre-flight RAM check in resolveLocalModelRef                                                                                                                   | installStore.ts:102–119 (future: minRamMB filter)                                |
| **E14** | **Device Lacks Disk Space (2GB model, 100MB free)**               | getInfoAsync(MODELS_DIR) before download modal                                                                                                                | Pre-check in chat.tsx:93 hook (NEW)                                                                                                 | Error: "Not enough storage. Vision model needs 2.1 GB, you have 100 MB. Free up space or choose smaller model." Download modal not shown.              | User deletes another model (Settings > Storage), retries send, or picks smaller model                                                                                                                                                | modelDownload.ts:81–390 (getInfoAsync)                                           |
| **E15** | **Network Offline + Image Attached, Model Not Downloaded**        | attachments=[image], no network, selectedModel not installed                                                                                                  | checkWifi() at download-prompt time (modelDownload.ts:136–139)                                                                      | Error: "Vision model requires Wi-Fi to download. Connect to Wi-Fi first." Send blocked                                                                 | User enables Wi-Fi, retries send; or uses text model if installed, or removes image                                                                                                                                                  | modelDownload.ts:257–266 Wi-Fi gate                                              |
| **E16** | **Cellular Data, Large Model Download, User on Limited Plan**     | attachments=[image], on cellular, vision model 5GB, download modal shown                                                                                      | checkWifi() returns false (cellular); wifiOnly=true by default (modelDownload.ts:240)                                               | Modal shows warning: "Wi-Fi recommended for large downloads." Toggle available: "Allow cellular download" (pattern from onboarding.tsx:293)            | If toggled: wifiOnly=false passed to downloadModel; download proceeds on cellular (real-time speed shown, user can cancel if too slow)                                                                                               | modelDownload.ts:257–266, onboarding.tsx:293                                     |
| **E17** | **Checksum Mismatch / Download Corrupted**                        | downloadModel completes, verifyChecksum (modelDownload.ts:345–352) fails, file deleted                                                                        | modelDownload.ts:345–352 verifyChecksum throws ModelDownloadError('checksum_mismatch')                                              | Modal: "Download corrupted. Retrying…" Auto-retry once (exponential backoff modelDownload.ts:186); if retry fails: "Download failed. [Retry] [Cancel]" | User taps Retry → re-download starts (resume via .partial if available); or cancels, picks different model                                                                                                                           | modelDownload.ts:345–352                                                         |
| **E18** | **Concurrent Sends, Different Models**                            | User sends image (auto-selects vision) → before send completes, sends text (default model). Both enter sendMessage async.                                     | chatExecutionStore.ts:265–284 sendMessage; calls localGenerate (line 493) on different models concurrently                          | Risk: one-at-a-time constraint violated; model N may evict model M. Message M inference silently lost.                                                 | Add model-lock mutex around localGenerate OR serial queue. Test concurrent sends with different models.                                                                                                                              | chatExecutionStore.ts:281–285 (abortControllers per conversation, not per model) |
| **E19** | **Model Deleted From Device (User via Files App)**                | resolveLocalModelRef queries installedModel.local_path; path doesn't exist (user deleted via Files)                                                           | localModelRuntime.ts:105 getInfoAsync on path → resolveLocalModelRef:122–124 throws error                                           | Error modal: "Vision model not found on device. [Open Models] [Pick Model] [Close]" Send blocked                                                       | User taps "Open Models" → Models tab → re-download vision model, OR taps "Pick Model" → select different model, resend                                                                                                               | localModelRuntime.ts:71–125                                                      |
| **E20** | **First-Run, No Models Installed**                                | listInstalledModels returns []; DEFAULT_LOCAL_MODEL_ID not available                                                                                          | resolveLocalModelRef (chatExecutionStore.ts:72) calls listInstalledModels → empty                                                   | Error: "No local model is configured. Download a model from Models." Modal with link to onboarding. Send blocked.                                      | User completes onboarding (download at least one model), returns to chat                                                                                                                                                             | installStore.ts:107–119 hydrateInstalledModels                                   |
| **E21** | **Unsupported Image Format (TIFF, BMP)**                          | attachments=[image.tiff]; isImage returns true (mimeType='image/tiff')                                                                                        | detectModality returns 'has-image'; vision model selected                                                                           | localGenerate called with TIFF. Runtime may reject: "Unsupported image format: TIFF. Try JPEG, PNG, or WebP."                                          | User removes unsupported image, adds supported format, resends. Future: convert format in upload pipeline                                                                                                                            | AttachmentPreview.tsx:53–55 isImage(mimeType)                                    |
| **E22** | **Thinking Mode + Vision Image**                                  | thinkingModeEnabled=true (store.ts:70), selectedModel doesn't support thinking, user attaches image                                                           | Auto-select vision model; check model.supportsThinking (false)                                                                      | Banner before send: "Thinking disabled for this model." Send proceeds without thinking                                                                 | Auto-handled; no user action needed. Thinking is per-model toggle (store.ts:131)                                                                                                                                                     | store.ts:70, 131                                                                 |
| **E23** | **Rapid Attachment Add/Remove**                                   | User adds image → remove → add PDF → remove → add image again in <1s                                                                                          | detectModality called on each attachment state change (ChatInput.tsx:59–60 setAttachments)                                          | Modality oscillates: 'has-image' → 'has-document' → 'has-image'. Model selection flickers in UI.                                                       | Debounce modality detection to 300–500ms after final attachment change. Only run auto-select on send-button press, not on render.                                                                                                    | ChatInput.tsx:59–60 useState attachments                                         |
| **E24** | **Model Download Interrupted (App Backgrounded/Killed)**          | Download at 45%; app killed. On restart, .partial file remains (modelDownload.ts:308–312 saveResume logic).                                                   | On app resume, scan MODELS_DIR for .partial files; check installStore.jobs[modelId].status                                          | Optional: show banner "Resume download of Vision Model (45% complete)?" OR auto-resume in background.                                                  | If user taps send before resume completes: resolveLocalModelRef sees 'download_required' or 'downloading' status → show download-prompt modal again.                                                                                 | modelDownload.ts:308–312 resume logic                                            |
| **E25** | **System Model Availability Changes (User Toggles Setting)**      | User in Settings toggles "Apple Foundation Models" on/off. Returns to chat. caps detection must refresh (installStore.ts:112–117 getCapabilities).            | installStore hydrateInstalledModels runs once at app start; not re-run on Settings return.                                          | Next auto-detect uses stale readySystemModelIds. If apple-afm was only vision model: auto-select falls back to text + warning.                         | Add useEffect hook to re-call hydrateInstalledModels on ChatTabScreen onFocus (useFocusEffect, RN Navigation).                                                                                                                       | installStore.ts:107–119                                                          |
| **E26** | **Cloud Managed Mode Switch (User Upgrades From v1 Local)**       | getRemoteChatDisabledReason returns null (remote enabled). Auto-selection runs.                                                                               | sendMessage checks remoteDisabledReason at line 290 (chatExecutionStore.ts:290, 449)                                                | Auto-select should NOT apply; request routed to cloud API with wrong (local) model ID.                                                                 | **FIX**: Check remoteChatGate.ts:22–31 getRemoteChatDisabledReason FIRST in chat.tsx:93 handleSend. If remote enabled, skip auto-select entirely.                                                                                    | remoteChatGate.ts:22–31                                                          |
| **E27** | **Offline Queue + Auto-Modality Selection**                       | User offline, message queued (offlineQueue.enqueue, chat.tsx:184). Model auto-detected at enqueue-time. Later online, dequeued; model may now be unavailable. | offlineQueue.enqueue captures model at enqueue-time. Dequeue consumer (chatExecutionStore) may find model deleted or not installed. | resolveLocalModelRef throws "not downloaded yet" at dequeue. Message consumed from queue; no retry.                                                    | Update offlineQueue to re-detect model at dequeue-time (after going online), not at enqueue-time. OR ensure model remains available throughout offline queue lifetime.                                                               | chat.tsx:184–190 offlineQueue.enqueue                                            |
| **E28** | **Very Slow Network, Download Timeout**                           | Download starts, speed <100 KB/s. No explicit timeout in modelDownload.ts.                                                                                    | Download continues indefinitely (hours) while progress bar spins.                                                                   | User must manually tap "Cancel" button. No auto-timeout.                                                                                               | Future: add optional maxDurationSeconds to downloadModel opts. Or show timeout error after 3600s (1 hour).                                                                                                                           | modelDownload.ts:228–371                                                         |
| **E29** | **Image Attachment Removed After Model Auto-Selected**            | Image attached → vision model auto-selected. Then user taps X on attachment to remove it. Model remains vision.                                               | Modality changes to 'text-only', but model selection not re-run (unless re-detect-on-attachment-change implemented).                | Composer shows vision model selected, but no images. User may be confused.                                                                             | Design choice: (a) always re-detect on attachment change (recommend), or (b) only auto-select on send-button press (simplest). Implement (a): call detectModality + selectBestModel on ChatInput.tsx:122–128 handleRemoveAttachment. | ChatInput.tsx:122–128 handleRemoveAttachment                                     |
| **E30** | **Very Large Vision Model (5GB) on Small Device (8GB Total RAM)** | Vision model 5GB auto-selected. Download completes. At localGenerate call, device thermal-throttles or OOMs.                                                  | No pre-flight RAM check. UX degraded (OOM after download).                                                                          | Error: "Out of memory. Try a smaller model."                                                                                                           | Future: query device RAM (await getCapabilities()) in selectBestModelForModality, filter out models with minRamMB > available. Warn user if model > 50% of available RAM.                                                            | installStore.ts:102–119 (future: minRamMB filter)                                |
| **E31** | **Model Deleted While Selected (Post Download, Pre-Inference)**   | User deletes vision model via File app. Model still marked as 'ready' in store (no sync). User sends message with attachment.                                 | resolveLocalModelRef queries installedModel.local_path, calls getInfoAsync (localModelRuntime.ts:105); path doesn't exist.          | Error: "Vision model is selected but not found on device. Download it again from Models, or choose a different model."                                 | Catch error in handleSend, show alert with "Open Models" + "Pick Model" buttons. User re-downloads or picks different model.                                                                                                         | localModelRuntime.ts:71–125                                                      |
| **E32** | **Unsupported Modality (Future: Video)**                          | Future PRD mentions video support. Video attachment detected, but no video-to-text handler exists yet.                                                        | detectModality returns 'has-video' (future). No corresponding model or selection logic exists.                                      | Graceful degradation: error "Video input not supported yet. Use Cloud Managed." Send blocked.                                                          | Design modalityDetection service to be extensible (modality → handler mapping). Add isSupportedModality(modality) check before proceeding. For video in v1, error.                                                                   | —                                                                                |

---

## 6. Files to Add/Modify

### 6.1 New Services/Utilities

#### **File A: `apps/mobile/src/features/model-picker/modalityDetector.ts` (new)**

**Purpose**: Modality detection from composer input.

```typescript
// Detect required capabilities from text + attachments
export type Modality =
  | 'text-only'
  | 'has-image'
  | 'has-pdf'
  | 'has-document'
  | 'has-audio'
  | 'has-mixed';

export function detectModalityFromAttachments(text: string, attachments?: Attachment[]): Modality {
  if (!text && (!attachments || attachments.length === 0)) {
    return 'text-only'; // empty input; already guarded by ChatInput
  }

  if (!attachments || attachments.length === 0) {
    return 'text-only'; // text only, no attachments
  }

  const hasImage = attachments.some((a) => a.mimeType.startsWith('image/'));
  const hasPdf = attachments.some((a) => a.mimeType === 'application/pdf');
  const hasDoc = attachments.some(
    (a) =>
      a.mimeType.startsWith('application/') &&
      /\.(doc|docx|txt|csv|xls|xlsx)/.test(a.fileName || ''),
  );
  const hasAudio = attachments.some((a) => a.mimeType.startsWith('audio/'));
  const hasVideo = attachments.some((a) => a.mimeType.startsWith('video/'));

  // Precedence: audio (unsupported) > mixed > image > pdf > document > text-only
  if (hasAudio || hasVideo) {
    return 'has-audio'; // unsupported; error case
  }

  if (hasImage && (hasPdf || hasDoc)) {
    return 'has-mixed'; // image + document
  }

  if (hasImage) {
    return 'has-image';
  }

  if (hasPdf) {
    return 'has-pdf';
  }

  if (hasDoc) {
    return 'has-document';
  }

  return 'text-only';
}

// Check if modality is supported by local inference
export function isSupportedModalityLocally(modality: Modality): boolean {
  return modality !== 'has-audio' && modality !== 'has-video';
}
```

**Reuse**: `Attachment` from `AttachmentPreview.tsx:15–30`, `mimeType` inspection.

---

#### **File B: `apps/mobile/src/features/model-picker/autoModelSelector.ts` (new)**

**Purpose**: Auto-selection algorithm by modality.

```typescript
import { Modality } from './modalityDetector';
import {
  LOCAL_MODEL_LIST,
  ModelDef,
  getSelectableModelById,
  DEFAULT_LOCAL_MODEL_ID,
} from './service';
import { isSystemModel, modelSupportsActiveSystemRuntime } from './localModelRuntime';

export interface AutoSelectResult {
  modelId: string;
  reason: string; // 'user-selected' | 'auto-vision' | 'auto-text' | 'fallback-default'
  requiresDownload: boolean;
}

export function selectBestModelForModality(
  modality: Modality,
  installedIds: Set<string>,
  userSelectedModel?: string | null,
  userManuallyChanged?: boolean,
): AutoSelectResult {
  // Precedence: user manual choice > auto-by-modality > fallback

  // Check if user manually changed model in last 500ms
  if (userManuallyChanged && userSelectedModel) {
    const selectedModel = getSelectableModelById(userSelectedModel);
    if (selectedModel) {
      return {
        modelId: userSelectedModel,
        reason: 'user-selected',
        requiresDownload: !installedIds.has(userSelectedModel),
      };
    }
  }

  // Auto-select by modality
  switch (modality) {
    case 'text-only':
      return selectTextModel(installedIds);

    case 'has-image':
      return selectVisionModel(installedIds);

    case 'has-pdf':
    case 'has-document':
      return selectTextModel(installedIds);

    case 'has-mixed':
      // Prefer vision for image processing
      return selectVisionModel(installedIds);

    case 'has-audio':
      // Unsupported
      return {
        modelId: DEFAULT_LOCAL_MODEL_ID,
        reason: 'error-audio-unsupported',
        requiresDownload: true, // will error in UI
      };

    default:
      return selectDefaultModel(installedIds);
  }
}

function selectVisionModel(installedIds: Set<string>): AutoSelectResult {
  // Fallback chain: qwen2-vl-2b > apple-afm > default

  const qwenVl = LOCAL_MODEL_LIST.find((m) => m.id === 'qwen2-vl-2b');
  if (qwenVl) {
    if (installedIds.has('qwen2-vl-2b')) {
      return {
        modelId: 'qwen2-vl-2b',
        reason: 'auto-vision',
        requiresDownload: false,
      };
    }
    // Downloadable
    return {
      modelId: 'qwen2-vl-2b',
      reason: 'auto-vision',
      requiresDownload: true,
    };
  }

  // Check system vision models
  const appleAfm = LOCAL_MODEL_LIST.find((m) => m.id === 'apple-afm-on-device');
  if (appleAfm && isSystemModel(appleAfm) && modelSupportsActiveSystemRuntime(appleAfm)) {
    return {
      modelId: 'apple-afm-on-device',
      reason: 'auto-vision',
      requiresDownload: false, // system model
    };
  }

  // Fall back to text model with warning (vision unavailable)
  return {
    modelId: DEFAULT_LOCAL_MODEL_ID,
    reason: 'fallback-no-vision',
    requiresDownload: !installedIds.has(DEFAULT_LOCAL_MODEL_ID),
  };
}

function selectTextModel(installedIds: Set<string>): AutoSelectResult {
  // Prefer qwen3-4b > llama-3.2-3b > llama-3.2-1b

  const candidates = ['qwen3-4b-instruct', 'llama-3.2-3b', 'llama-3.2-1b'];

  for (const modelId of candidates) {
    const model = getSelectableModelById(modelId);
    if (model) {
      return {
        modelId,
        reason: 'auto-text',
        requiresDownload: !installedIds.has(modelId),
      };
    }
  }

  // Fall back to default
  return selectDefaultModel(installedIds);
}

function selectDefaultModel(installedIds: Set<string>): AutoSelectResult {
  return {
    modelId: DEFAULT_LOCAL_MODEL_ID,
    reason: 'fallback-default',
    requiresDownload: !installedIds.has(DEFAULT_LOCAL_MODEL_ID),
  };
}
```

**Reuse**: `LOCAL_MODEL_LIST`, `getSelectableModelById`, `DEFAULT_LOCAL_MODEL_ID` from `service.ts:305, 333, 183`; `isSystemModel`, `modelSupportsActiveSystemRuntime` from `localModelRuntime.ts:23–31`.

---

#### **File C: `apps/mobile/src/features/chat/hooks/useAutoModalitySelection.ts` (new)**

**Purpose**: Composer hook for auto-selection + download wait.

```typescript
import { useCallback, useRef } from 'react';
import { useModelInstallStore } from '@/features/model-picker/installStore';
import { useModelStore } from '@/features/model-picker/store';
import { Attachment } from '../components/AttachmentPreview';
import { detectModalityFromAttachments } from '@/features/model-picker/modalityDetector';
import { selectBestModelForModality } from '@/features/model-picker/autoModelSelector';
import { getSelectableModelById } from '@/features/model-picker/service';

export function useAutoModalitySelection(text: string, attachments: Attachment[] | undefined) {
  const installedIds = useModelInstallStore(
    (s) => new Set(s.installedModels?.map((m) => m.id) ?? []),
  );
  const selectedModel = useModelStore((s) => s.selectedModel);
  const userInteractionTime = useRef<number>(0);

  // Track user manual model selection
  useModelStore((s) => {
    if (s.selectedModel && userInteractionTime.current < Date.now() - 500) {
      userInteractionTime.current = Date.now();
    }
  });

  const autoSelectModel = useCallback(() => {
    const modality = detectModalityFromAttachments(text, attachments);
    const userManuallyChanged = Date.now() - userInteractionTime.current < 500;

    const result = selectBestModelForModality(
      modality,
      installedIds,
      selectedModel,
      userManuallyChanged,
    );

    return result;
  }, [text, attachments, installedIds, selectedModel]);

  const waitForDownload = useCallback(async (modelId: string, timeoutMs = 300000) => {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = useModelInstallStore
        .getState()
        .statusForModel(getSelectableModelById(modelId)!);

      if (status === 'ready') {
        return true; // ready
      }

      if (status === 'failed' || status === 'unavailable') {
        return false; // download failed
      }

      // Still downloading or initializing
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return false; // timeout
  }, []);

  return { autoSelectModel, waitForDownload };
}
```

**Reuse**: `useModelInstallStore`, `useModelStore` from `installStore.ts`, `store.ts`; `Attachment` from `AttachmentPreview.tsx:15–30`.

---

### 6.2 New UI Component

#### **File D: `apps/mobile/src/features/chat/components/ModelDownloadPromptSheet.tsx` (new)**

**Purpose**: Bottom sheet for download prompt (size, ETA, progress, Wi-Fi toggle).

```typescript
import { forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { View, Text, Alert } from 'react-native';
import BottomSheet, { useBottomSheetInternal } from '@gorhom/bottom-sheet';
import { ModelDef } from '@/features/model-picker/service';
import { useModelInstallStore } from '@/features/model-picker/installStore';
import { cancelDownload } from '@/services/modelDownload';
import { formatBytes, estimateWifiMinutes } from '@/app/(public)/onboarding';

export interface ModelDownloadPromptSheetRef {
  open(model: ModelDef): Promise<boolean>; // true if user approved, false if cancelled
}

interface Props {
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
}

export const ModelDownloadPromptSheet = forwardRef<ModelDownloadPromptSheetRef, Props>(
  ({ onDownloadStart, onDownloadComplete }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [model, setModel] = useState<ModelDef | null>(null);
    const [cellularEnabled, setCellularEnabled] = useState(false);
    const [downloadResult, setDownloadResult] = useState<boolean | null>(null);

    const installedJobs = useModelInstallStore(s => s.installJobs);
    const prepareModel = useModelInstallStore(s => s.prepareModel);

    const handleDownload = useCallback(async () => {
      if (!model) return;

      onDownloadStart?.();

      try {
        await prepareModel(model, { wifiOnly: !cellularEnabled });
        setDownloadResult(true);
        onDownloadComplete?.();
      } catch (error: any) {
        console.error('Model download failed:', error);
        Alert.alert(
          'Download Failed',
          error.message || 'Unable to download model. Please try again.',
          [{ text: 'OK' }]
        );
        setDownloadResult(false);
      }
    }, [model, cellularEnabled, prepareModel, onDownloadStart, onDownloadComplete]);

    const handleCancel = useCallback(() => {
      if (model) {
        cancelDownload(model.id);
      }
      setDownloadResult(false);
      setIsOpen(false);
    }, [model]);

    useImperativeHandle(ref, () => ({
      open: async (m: ModelDef) => {
        setModel(m);
        setDownloadResult(null);
        setIsOpen(true);

        // Wait for user decision
        return new Promise(resolve => {
          const checkResult = setInterval(() => {
            if (downloadResult !== null) {
              clearInterval(checkResult);
              setIsOpen(false);
              resolve(downloadResult);
            }
          }, 100);
        });
      },
    }), [downloadResult]);

    if (!model) return null;

    const sizeMB = model.sizeBytes / (1024 * 1024);
    const estimatedMin = estimateWifiMinutes(model.sizeBytes);
    const progress = installedJobs[model.id]?.progress ?? 0;
    const isDownloading = installedJobs[model.id]?.status === 'downloading';

    return (
      <BottomSheet
        snapPoints={[400]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: '#fff' }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>
            Download Model
          </Text>
          <Text style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            {model.name} • {formatBytes(model.sizeBytes)}
          </Text>

          <Text style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
            Estimated time: ~{estimatedMin} min on Wi-Fi
          </Text>

          {isDownloading && (
            <View style={{ marginBottom: 16 }}>
              <View style={{ height: 6, backgroundColor: '#e0e0e0', borderRadius: 3 }}>
                <View
                  style={{
                    height: '100%',
                    width: `${progress * 100}%`,
                    backgroundColor: '#007AFF',
                    borderRadius: 3,
                  }}
                />
              </View>
              <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
          )}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 20,
              gap: 8,
            }}
          >
            <input
              type="checkbox"
              checked={cellularEnabled}
              onChange={e => setCellularEnabled(e.target.checked)}
            />
            <Text style={{ fontSize: 12 }}>Allow cellular download</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <button
              onPress={handleCancel}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#ccc',
              }}
            >
              <Text>Not Now</Text>
            </button>
            <button
              onPress={handleDownload}
              disabled={isDownloading}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor: '#007AFF',
              }}
            >
              <Text style={{ color: '#fff' }}>
                {isDownloading ? 'Downloading...' : 'Download'}
              </Text>
            </button>
          </View>
        </View>
      </BottomSheet>
    );
  }
);

ModelDownloadPromptSheet.displayName = 'ModelDownloadPromptSheet';
```

**Reuse**: `BottomSheet` pattern from `PaywallBottomSheet.tsx:97–162`; `formatBytes`, `estimateWifiMinutes` from `onboarding.tsx:106–119`; `cancelDownload` from `modelDownload.ts:216–222`; `ModelDef` from `service.ts`.

---

### 6.3 Modified Files

#### **File E: `apps/mobile/app/(app)/chat/[id].tsx` (modify)**

**Location**: `handleSend` function (lines 80–101).

**Change**: Insert auto-selection + download modal logic BEFORE `sendMessage` call (line 93).

```typescript
// BEFORE (existing):
const handleSend = async (text: string, attachments?: Attachment[]) => {
  const trimmed = text.trim();
  if (!trimmed && !attachments?.length) return;

  try {
    const convo = await createConversation();
    await sendMessage(convo.id, trimmed, selectedModel, attachments); // ← line 93
    setChatInput('');
    handleClearAttachments();
  } catch (error) {
    handleError(error);
  }
};

// AFTER (modified):
const handleSend = async (text: string, attachments?: Attachment[]) => {
  const trimmed = text.trim();
  if (!trimmed && !attachments?.length) return;

  // NEW: Check if local mode (must be FIRST)
  const remoteDisabledReason = getRemoteChatDisabledReason(FEATURES);
  if (!remoteDisabledReason) {
    // Cloud mode active, skip auto-select
    try {
      const convo = await createConversation();
      await sendMessage(convo.id, trimmed, selectedModel, attachments);
      setChatInput('');
      handleClearAttachments();
    } catch (error) {
      handleError(error);
    }
    return;
  }

  // NEW: Auto-selection + download (LOCAL_ONLY mode)
  const { autoSelectModel, waitForDownload } = useAutoModalitySelection(trimmed, attachments);

  let finalModel = selectedModel;

  try {
    const autoResult = autoSelectModel();

    if (autoResult.reason !== 'user-selected' && autoResult.requiresDownload) {
      // Show download modal
      const downloadPromptRef = useRef<ModelDownloadPromptSheetRef>(null);
      const modelDef = getSelectableModelById(autoResult.modelId);

      if (modelDef) {
        const userApproved = await downloadPromptRef.current?.open(modelDef);

        if (userApproved) {
          // Wait for download completion
          const downloadSuccess = await waitForDownload(autoResult.modelId);
          if (!downloadSuccess) {
            Alert.alert(
              'Download Failed',
              'Model download did not complete. Continuing with current model.',
              [{ text: 'OK' }],
            );
            // Fall back to selectedModel
          } else {
            finalModel = autoResult.modelId;
          }
        } else {
          // User cancelled download, use current model or error
          if (
            autoResult.reason === 'auto-vision' &&
            attachments?.some((a) => a.mimeType.startsWith('image/'))
          ) {
            Alert.alert(
              'Image Detected',
              'Vision model required for image analysis. Download to continue, or send as text.',
              [{ text: 'Send as text' }, { text: 'Cancel' }],
            );
            // If "Send as text", use fallback text model or current
          }
        }
      }
    } else if (autoResult.reason !== 'user-selected') {
      finalModel = autoResult.modelId;
    }

    // Proceed with send
    const convo = await createConversation();
    await sendMessage(convo.id, trimmed, finalModel, attachments);
    setChatInput('');
    handleClearAttachments();
  } catch (error) {
    handleError(error);
  }
};
```

**Imports**: Add `useAutoModalitySelection` from new hook, `getSelectableModelById` from `service.ts`, `getRemoteChatDisabledReason` from `remoteChatGate.ts`.

---

#### **File F: `apps/mobile/src/features/model-picker/service.ts` (extend)**

**Location**: Add utility for capability-based model lookup (after existing exports, around line 330).

**Change**: Add function to filter models by capability.

```typescript
// NEW: Add after getSelectableModelById (line 333)
export function getModelsByCapability(capability: 'vision' | 'tools'): ModelDef[] {
  return LOCAL_MODEL_LIST.filter((model) => {
    if (capability === 'vision') {
      return model.supportsVision;
    }
    if (capability === 'tools') {
      return model.capabilities?.tools ?? false;
    }
    return false;
  });
}
```

---

#### **File G: `apps/mobile/stores/chat/chatExecutionStore.ts` (extend)**

**Location**: Enhance error messages for modality-specific failures (around lines 154–169).

**Change**: Update `localSetupMessage` to include modality hint.

```typescript
// BEFORE (existing):
const localSetupMessage = (error: any): string => {
  if (error.message.includes('not downloaded')) {
    return 'No model is ready. Download a model from Settings.';
  }
  return 'Local model is not configured.';
};

// AFTER (modified):
const localSetupMessage = (error: any, modality?: string): string => {
  if (error.message.includes('not downloaded')) {
    if (modality === 'has-image') {
      return 'Vision model required for images. Download one from Settings.';
    }
    return 'No model is ready. Download a model from Settings.';
  }
  if (error.message.includes('Audio')) {
    return 'Audio input not supported on local models yet. Use Cloud Managed.';
  }
  return 'Local model is not configured.';
};
```

---

#### **File H: `apps/mobile/src/features/chat/components/ChatInput.tsx` (extend)**

**Location**: Add attachment change detection for modality re-evaluation (around lines 122–128).

**Change**: Re-run auto-detection on attachment removal (optional; improves UX).

```typescript
// BEFORE (existing):
const handleRemoveAttachment = useCallback((index: number) => {
  setAttachments((prev) => prev.filter((_, i) => i !== index));
}, []);

// AFTER (modified with debounce):
const modalityDebounceRef = useRef<NodeJS.Timeout | null>(null);

const handleRemoveAttachment = useCallback(
  (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));

    // NEW: Re-detect modality after attachment removal
    if (modalityDebounceRef.current) clearTimeout(modalityDebounceRef.current);

    modalityDebounceRef.current = setTimeout(() => {
      const newAttachments = attachments.filter((_, i) => i !== index);
      const modality = detectModalityFromAttachments(text, newAttachments);
      // Optionally: trigger re-auto-select logic here if needed
      // For now, just update attachment state; auto-select runs on send
    }, 300); // debounce 300ms
  },
  [text, attachments],
);
```

**Imports**: Add `detectModalityFromAttachments` from new `modalityDetector.ts`.

---

### 6.4 Configuration

#### **File I: `apps/mobile/src/features/model-picker/store.ts` (extend)**

**Location**: Add field to track user manual model selection (around line 21).

**Change**: Add timestamp field to track last user interaction.

```typescript
// BEFORE (existing):
interface ModelStoreState {
  selectedModel: string | null;
  // ... other fields
}

// AFTER (modified):
interface ModelStoreState {
  selectedModel: string | null;
  lastModelInteractionTime: number; // timestamp for debounce check
  // ... other fields
}

// In setModel action (line 73):
setModel: (modelId: string) => {
  set({
    selectedModel: modelId,
    lastModelInteractionTime: Date.now(), // NEW
  });
},
```

---

## 7. Cloud Demotion: Unsupported Modalities in LOCAL Mode

### LOCAL Mode Parity Rules

| Modality           | LOCAL Support                                    | Cloud Fallback           | Behavior                                                                                                |
| ------------------ | ------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Text only**      | ✓ Full                                           | N/A                      | Auto-select text model (qwen3-4b, llama-3.2-\*)                                                         |
| **Image + Text**   | ✓ Full (qwen2-vl-2b, apple-afm)                  | N/A                      | Auto-select vision model; if unavailable, warn & use text                                               |
| **PDF / Document** | ⚠ Partial (text analysis only)                   | ✓ Full (vision analysis) | LOCAL: text model; cloud: vision-capable LMM                                                            |
| **Audio**          | ✗ Not supported                                  | ✓ Full                   | Error: "Audio not supported on local models yet. Use Cloud Managed." → block send OR offer cloud switch |
| **Video**          | ✗ Not supported (future)                         | ✓ Full                   | Error: "Video not supported on local models yet. Use Cloud Managed." → block send OR offer cloud switch |
| **Multi-image**    | ⚠ Conditional (depends on localGenerate support) | ✓ Full                   | LOCAL: warn if localGenerate doesn't support multi-image; cloud: no limit                               |

**Messaging** (in `localSetupMessage`, `modalityDetector`, etc.):

- **PDF/doc in LOCAL**: "Document will be analyzed as text (vision analysis not available locally)."
- **Audio in LOCAL**: "Audio input not supported on local models yet. Switch to Cloud Managed for audio support?"
- **Video in LOCAL**: "Video input not supported on local models yet. Switch to Cloud Managed for video support?"

---

## 8. Verification Plan

### 8.1 Type Safety & Build

```bash
# Typecheck all new files
npx tsc --noEmit apps/mobile/src/features/model-picker/modalityDetector.ts
npx tsc --noEmit apps/mobile/src/features/model-picker/autoModelSelector.ts
npx tsc --noEmit apps/mobile/src/features/chat/hooks/useAutoModalitySelection.ts
npx tsc --noEmit apps/mobile/src/features/chat/components/ModelDownloadPromptSheet.tsx

# Full build
npm run build:mobile
```

### 8.2 Unit Tests (Light)

**Test file**: `apps/mobile/__tests__/auto-modality.test.ts` (new)

```typescript
import { detectModalityFromAttachments, Modality } from '@/features/model-picker/modalityDetector';
import { selectBestModelForModality } from '@/features/model-picker/autoModelSelector';

describe('Auto-Modality Selection', () => {
  it('detects text-only modality', () => {
    expect(detectModalityFromAttachments('hello', [])).toBe('text-only');
  });

  it('detects image modality', () => {
    expect(
      detectModalityFromAttachments('describe this', [
        { uri: '...', mimeType: 'image/jpeg', fileName: 'test.jpg' },
      ]),
    ).toBe('has-image');
  });

  it('detects audio modality (unsupported)', () => {
    expect(
      detectModalityFromAttachments('', [
        { uri: '...', mimeType: 'audio/mp3', fileName: 'test.mp3' },
      ]),
    ).toBe('has-audio');
  });

  it('selects vision model for image', () => {
    const installed = new Set(['qwen2-vl-2b']);
    const result = selectBestModelForModality('has-image', installed);
    expect(result.modelId).toBe('qwen2-vl-2b');
    expect(result.requiresDownload).toBe(false);
  });

  it('falls back to text model if vision unavailable', () => {
    const installed = new Set(['qwen3-4b-instruct']);
    const result = selectBestModelForModality('has-image', installed);
    expect(result.reason).toBe('fallback-no-vision');
  });

  it('respects user manual selection if changed recently', () => {
    const installed = new Set(['qwen3-4b-instruct']);
    const result = selectBestModelForModality(
      'has-image',
      installed,
      'qwen3-4b-instruct',
      true, // userManuallyChanged
    );
    expect(result.modelId).toBe('qwen3-4b-instruct');
    expect(result.reason).toBe('user-selected');
  });
});
```

### 8.3 Founder UX Tests (Manual)

**Scenarios**:

1. **Text-only send**: Attach nothing, type message, send → uses default model, no download prompt.
2. **Image + text with qwen2-vl installed**: Attach image, type message, send → auto-selects qwen2-vl, no download prompt, sends with vision.
3. **Image + text with qwen2-vl NOT installed**: Attach image, type message, send → shows download modal (2.1 GB, ~5 min), user taps Download → progress shows, download completes, message sends with vision.
4. **Image + text with no vision models**: Attach image, type message, send → shows warning "Vision model not available", falls back to text model, message sends as text.
5. **Audio attachment**: Attach .mp3 file, type message, send → error "Audio not supported yet", send blocked.
6. **Model switch mid-compose**: Text model selected, attach image (vision auto-selected), user opens ModelPickerSheet and manually selects text model → manual choice respected, send proceeds with text model.
7. **Download cancel**: Attach image, send, download modal shown, user taps "Not now" → returns to Composer, input preserved, can retry or pick different model.
8. **Network offline + image**: Offline, attach image, send → error "Wi-Fi required", no download modal, user enables Wi-Fi, retries send → download modal shown.
9. **Storage full**: Attach image, send → pre-check detects 100MB free but 2GB model required → error "Not enough storage", download blocked, offer delete models or fallback.
10. **Rapid attachment changes**: Add image (vision auto-selected) → remove image (modality text-only) → add PDF (modality document) → send → final auto-selection based on final state (document = text model).

**Pass criteria**:

- No crashes or hang on any scenario.
- Download progress visible and accurate.
- Fallback behavior graceful (text model used if vision unavailable).
- Error messages clear (show modality-specific copy).
- Composer input preserved across modal interactions.
- User manual model choice respected.

---

## 9. Summary: Files to Deliver

| File                                                                    | Type   | Purpose                                                     | Reuse                                                                                      |
| ----------------------------------------------------------------------- | ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/mobile/src/features/model-picker/modalityDetector.ts`             | NEW    | Detect modality from attachments                            | Attachment.mimeType, isImage                                                               |
| `apps/mobile/src/features/model-picker/autoModelSelector.ts`            | NEW    | Auto-select model by modality                               | LOCAL_MODEL_LIST, getSelectableModelById, isSystemModel, modelSupportsActiveSystemRuntime  |
| `apps/mobile/src/features/chat/hooks/useAutoModalitySelection.ts`       | NEW    | Composer hook for auto-select + download wait               | useModelInstallStore, useModelStore, Attachment                                            |
| `apps/mobile/src/features/chat/components/ModelDownloadPromptSheet.tsx` | NEW    | Bottom sheet for download prompt                            | BottomSheet (PaywallBottomSheet pattern), formatBytes, estimateWifiMinutes, cancelDownload |
| `apps/mobile/app/(app)/chat/[id].tsx`                                   | MODIFY | Insert auto-selection logic in handleSend (pre-sendMessage) | useAutoModalitySelection, getRemoteChatGate, getSelectableModelById                        |
| `apps/mobile/src/features/model-picker/service.ts`                      | EXTEND | Add getModelsByCapability utility                           | LOCAL_MODEL_LIST                                                                           |
| `apps/mobile/stores/chat/chatExecutionStore.ts`                         | EXTEND | Enhance localSetupMessage for modality errors               | Error message routing                                                                      |
| `apps/mobile/src/features/chat/components/ChatInput.tsx`                | EXTEND | Re-detect modality on attachment change (optional)          | detectModalityFromAttachments, handleRemoveAttachment                                      |
| `apps/mobile/src/features/model-picker/store.ts`                        | EXTEND | Track lastModelInteractionTime for debounce                 | setModel action                                                                            |
| `apps/mobile/__tests__/auto-modality.test.ts`                           | NEW    | Unit tests for detection + selection                        | All new utilities                                                                          |

---

## 10. Edge Case Reference Quick-Link

**Critical Edge Cases** (test thoroughly):

- **E10**: No vision model available (image attached) — fallback to text + warn ✓
- **E14**: Device lacks disk space — pre-check + error ✓
- **E15**: Offline + image attachment — Wi-Fi gate + error ✓
- **E18**: Concurrent sends, different models — one-at-a-time constraint (document) ✓
- **E26**: Cloud mode active but auto-select runs — check remoteChatGate FIRST ✓
- **E29**: Image removed after vision auto-selected — modality re-detect on attachment change ✓

**All 30+ edge cases** enumerated in §5 above.

---

**END OF SPEC**
