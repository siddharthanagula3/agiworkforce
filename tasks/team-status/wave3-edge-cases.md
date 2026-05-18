# Wave 3 — Edge-Case Modals: Mount Points

All 10 modals live in `apps/mobile/components/edge-cases/`. The barrel is
`apps/mobile/components/edge-cases/index.ts`. Import everything from there.

## WIRED (already mounted)

| #   | Component            | Mounted where                                                                                            | Status                    |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------- |
| 4   | `OfflineBanner`      | `app/_layout.tsx` (above `<Slot />` in main return)                                                      | DONE                      |
| 9   | `ContextWarningChip` | `components/chat/ContextWarningChip.tsx` (already existed, wired by context-budget-engineer in task #30) | DONE — verify in composer |

## NEEDS WIRING by feature engineers

| #   | Component                   | Recommended mount point                                                                      | Trigger condition                                                     |
| --- | --------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | `FileTooLargeModal`         | Document-picker handler in `components/chat/ChatInput.tsx` or the file-attach flow           | `file.size > 50 * 1024 * 1024`                                        |
| 2   | `FileUnreadableModal`       | File-parse error handler in doc-qa service or `AddToChatSheet`                               | `parseFile()` throws / returns null                                   |
| 3   | `ImageTooLargeModal`        | Image picker result handler in `components/chat/ChatInput.tsx`                               | `image.fileSize > 10MB` or dimension > 8192px                         |
| 5   | `BatteryLowModal`           | Pre-inference gate in the local-LLM send path (`services/llmGate.ts`)                        | `Battery.getBatteryLevelAsync() < 0.15`                               |
| 6   | `StorageFullModal`          | Model download entry point in `services/modelDownload.ts`                                    | Free disk < 500MB (use `expo-file-system` `getFreeDiskStorageAsync`)  |
| 7   | `ThermalThrottleModal`      | Native thermal bridge callback in the local-LLM runtime; pause inference before showing      | iOS: `thermalState >= 3` (serious); Android: ThermalStatus.SEVERE     |
| 8   | `ModelLoadingFirstRunModal` | Chat screen send handler, first inference after install                                      | Model loaded flag not set in MMKV; track `progress` from runtime      |
| 10  | `CloudTeaseModal`           | Any cloud-gated feature tap handler (e.g. in `ModeToggle`, `ModelPickerSheet` cloud section) | User already joined waitlist (rank stored); they tap a cloud-only CTA |

## Props quick-reference

```tsx
// 1
<FileTooLargeModal visible={show} onDismiss={() => setShow(false)} />

// 2
<FileUnreadableModal visible={show} onDismiss={() => setShow(false)} />

// 3
<ImageTooLargeModal visible={show} onDismiss={() => setShow(false)} />

// 5
<BatteryLowModal
  visible={show}
  onConfirm={startInference}
  onCancel={() => setShow(false)}
/>

// 6
<StorageFullModal visible={show} onCancel={() => setShow(false)} />
// CTA "Open Storage Settings" is self-contained (calls Linking internally)

// 7
<ThermalThrottleModal visible={show} onDismiss={() => setShow(false)} />

// 8
<ModelLoadingFirstRunModal
  visible={show}
  progress={0.0..1.0}       // 0 = just started, 1 = done (modal closes)
  etaSeconds={45}            // optional
/>

// 10
<CloudTeaseModal
  visible={show}
  rank={waitlistRank}        // 1-indexed display rank from waitlist store
  onDismiss={() => setShow(false)}
/>
```

## Notes for chat-screen-engineer

`ContextWarningChip` is already wired in `components/chat/ContextWarningChip.tsx`.
Confirm it's placed above `<Composer />` in the chat screen (`app/(app)/chat/[id].tsx`)
using the pattern documented in the component's JSDoc.
The copy for this chip lives in `components/edge-cases/copy.ts` under `contextGettingLong`
for reference, but the chip component itself is in `components/chat/`.
