# AGI Mobile — Volume 09 — Message Composer

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md` (repo root); `apps/mobile/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon). Grounded in real repo paths cited inline below, chiefly `apps/mobile/src/features/chat/components/ChatInput.tsx`, `apps/mobile/src/features/chat/components/AttachmentPreview.tsx`, `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`, `apps/mobile/src/features/media/photo-picker.ts`, `apps/mobile/app/(app)/camera.tsx`, `apps/mobile/src/features/voice/services/voiceInput.ts`, `apps/mobile/lib/clipboard.ts`, `apps/mobile/stores/chat/chatExecutionStore.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, and `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies the AGI Mobile message composer: the persistent input bar at the foot of every chat. The composer is one component (`ChatInput.tsx`, wrapped by `Composer.tsx`) shared by Local and Managed Cloud, so its trust posture is driven entirely by the active mode, never by a per-key affordance. **Mobile has no BYOK.** The model pill in the composer (`ModelSelectorButton.tsx`) selects an on-device model in Local mode or a Managed-Cloud model in Cloud mode — it is never a place to enter or display a provider API key. "Provider configuration" reachable from here means on-device model management, not keys.

UX Lock: the empty composer screen must always show the text input, add/plus button, an attach path, model selector, mic, send/stop control, and a visible trust/provider label. On mobile the trust label is the header `ModeToggle` (Local/Cloud) directly above the composer, plus the model pill inside it; both stay visible whenever the composer is shown. Local input never auto-routes to Cloud: capability gates (File, image gen, web search) read `appMode` and `FEATURES`, and Cloud paths fail closed when `cloudChat` is off.

## Growing Text Area

✅ Built — `ChatInput.tsx`. The `TextInput` is `multiline` with `minHeight: 24` and `maxHeight: 200`, and `numberOfLines={MAX_INPUT_LINES}` (=6, `lib/constants.ts`). Requirements: the field grows with content up to the cap, then scrolls internally; it never pushes the toolbar row off-screen; text color, placeholder, and selection use theme tokens (`useTheme`), not hardcoded colors. Placeholder is context-aware: streaming → "Reply to {model}…", offline → an "Offline — message will send on reconnect" string with queue count, active thread → "Reply to AGI", else "What's on your mind?". Draft text persists per `draftKey` via MMKV (`draftStore`) and restores on remount.

## Attachments

✅ Built — `AttachmentPreview.tsx` + `ChatInput.tsx` state. Selected files render as a horizontal thumbnail strip above the input: image thumbnails or a file card (name + human-readable size), each with a remove (X) control and an optional per-file privacy chip (`privacyShortLabel`, e.g. "LOCAL") sourced from the host's send-preview presentation. Parent screens push picker results in through `attachRef.addAttachments`. Requirements: send is enabled when there is trimmed text OR ≥1 attachment; the privacy chip must reflect the real outbound destination per the trust boundary, never a cosmetic badge; attachments are cleared on successful send.

## Voice Input

✅ Built — `voiceInput.ts`, `VoiceInputButton.tsx`, `RecordingOverlay`. The mic captures speech **on-device** via `expo-speech-recognition` with `requiresOnDeviceRecognition: true`; audio bytes do not leave the device when on-device support is reported for the locale. Tap dictates into the composer (transcript appended/cleaned via `cleanupVoiceDictation`); long-press opens full voice mode (`onOpenVoiceMode`). Requirements: mic permission is requested before capture and a denial surfaces a clear alert (`VoiceCaptureError` → "Voice input unavailable"); the live overlay shows duration + metering with Cancel/Send; the mic is disabled during streaming. Cloud STT (Whisper/Deepgram) is a separate path behind `FEATURES.cloudChat` — Local dictation must never silently use it.

## Camera Shortcut

✅ Built — `AddToChatSheet.tsx` Camera card → `app/(app)/camera.tsx`. A full-screen `CameraView` (`expo-camera`) captures a photo, shows a preview with an optional prompt, and attaches it to a conversation. Requirements: camera permission is requested with a graceful denial path (link to Settings); capture quality is bounded (0.85); the captured image is treated as a normal attachment subject to the active trust label. In Local mode the image is inspected on-device (OCR/vision) without upload; it is uploaded only in Cloud mode.

## Image Picker

✅ Built — `photo-picker.ts` (`pickImageAssetsFromLibrary` via `expo-image-picker`) wired to the "Photos" card in `AddToChatSheet.tsx`. Returns assets mapped to `Attachment` objects (`imageAssetsToChatAttachments`). Requirements: `exif: false` (strip location/EXIF before attaching); honor a selection limit; results flow through `attachRef.addAttachments` so the preview strip and privacy chip apply. Document/File picking (`expo-document-picker`) is offered **only** in Cloud mode (`appMode === 'cloud'`) — Local stays an attach-and-inspect-on-device path. Mobile must not become the first heavy local PDF/DOCX/PPTX surface; large document work delegates to Desktop/Cloud.

## Clipboard Support

🟡 Partial — copy-out is ✅ (`lib/clipboard.ts` `copyToClipboard` via `expo-clipboard`; used by message Copy actions in `MessageBubble.tsx`). Paste **into** the composer relies on the native `TextInput` long-press paste, which works today but is not a dedicated, tested affordance, and there is no programmatic "paste image/URL" handler. Gap before ✅: an explicit paste path (text and image) with the same privacy labeling as picked attachments. Anti-requirement: never read the clipboard automatically on focus.

## Keyboard Behavior

✅ Built — `ChatInput.tsx` + screen-level `KeyboardAvoidingView`/safe-area insets. The composer uses `returnKeyType="default"` and `blurOnSubmit={false}`, so Return inserts a newline and **does not** send — sending is an explicit button tap (deliberate divergence from desktop Enter-to-send to prevent accidental Local→model dispatch on a touch keyboard). Requirements: bottom padding respects `useSafeAreaInsets`; the bar stays above the keyboard; accessibility label/hint are set on the input; haptics fire on send when enabled.

## Streaming Controls — stop generation

✅ Built — `SendButton.tsx` + `ChatInput.tsx` + `chatExecutionStore.ts`. The send button is a state machine: `idle` (send), `queued` (offline, has content), `streaming` (stop). While streaming, the same control becomes Stop and calls `onStop` → `stopStreaming`, which aborts the in-flight request via the per-conversation `AbortController` and marks pre-stream sends cancelled. Requirements: Stop is immediate and idempotent; an aborted turn must not persist a half-streamed reply as complete; the model pill hides during streaming to reclaim space but the trust label stays visible.

## Editing previous messages

✅ Built — `MessageBubble.tsx` action sheet ("Edit Message") + `MessageEditModal.tsx` → `editMessage` in `chatExecutionStore.ts`. Editing a prior user message trims the conversation back to that turn, removes the stale assistant reply, adjusts `messageCount`, and re-sends with the same model and mode (retry-capped at `MAX_RETRY_ATTEMPTS` with backoff). Requirements: the edit re-runs in the **same trust mode** as the original turn — a Local message re-runs Local, a Cloud message re-runs Cloud; an edit never crosses the boundary or changes the provider label silently.

## Repository map

- `apps/mobile/src/features/chat/components/{Composer/Composer,ChatInput,SendButton,ModelSelectorButton,AttachmentPreview,AddToChatSheet,CommandPalette,ModeToggle}.tsx` — composer UI.
- `apps/mobile/src/features/chat/components/{MessageBubble,MessageEditModal}.tsx` — edit/retry/copy entry points.
- `apps/mobile/src/features/media/photo-picker.ts`, `apps/mobile/app/(app)/camera.tsx` — image picker + camera capture.
- `apps/mobile/src/features/voice/{services/voiceInput.ts,components/VoiceInputButton.tsx,components/RecordingOverlay.tsx}` — on-device dictation.
- `apps/mobile/lib/{clipboard.ts,constants.ts,v1FeatureFlags.ts}` — clipboard, line caps, feature gates.
- `apps/mobile/stores/chat/chatExecutionStore.ts` — send/stop/edit/retry. Shared: `packages/contracts/types/src/models.json` (model ids), `apps/web/app/api/{chat,media}` (Cloud endpoints).

## Competitor notes

ChatGPT and Claude mobile composers assume one cloud account: every attachment, photo, and dictation is uploaded, with no on-device-only path. AGI's divergence: the same composer serves a **Local** mode where camera, image, and voice are inspected on-device with no upload, and a **Managed Cloud** mode that uploads only under a visible trust label. Neither competitor exposes a per-surface trust toggle beside the input, and neither offers (nor should AGI add) BYOK keys on mobile. The model pill picks among multiple providers/models by capability — a model selector, never a key field.

## Acceptance / Definition of Done

The composer is production-ready only when the empty state shows input + plus + attach + model pill + mic + send/stop + a visible trust/provider label, and every capability respects the Local/Cloud boundary.

- [ ] Build: composer renders and sends in Local and Cloud; passes `pnpm --filter @agiworkforce/mobile typecheck` and `test`; text area grows to the cap then scrolls; drafts survive remount.
- [ ] Trust: Local voice/camera/image make zero network calls; File picker + image gen + web search appear only when their `FEATURES`/`appMode` gate is on; edit/retry re-run in the original trust mode; `byokKeys` stays false; no provider-key UI exists.
- [ ] Security/privacy: EXIF stripped from picked images; per-file privacy chip reflects the real destination; Stop aborts cleanly without persisting partial turns; no model id, route, env var, or INR price is hardcoded.

## Anti-patterns

- Adding any BYOK / provider-key field, or relabeling the model pill as a key entry.
- Auto-sending Local input, or routing Local attachments/voice/camera to Cloud without explicit mode + consent.
- Making Return send by default, or auto-reading the clipboard on focus.
- Faking an unsupported capability (e.g. a File card in Local, a fake "uploaded" badge) instead of gating it honestly.
- Hardcoding or inventing a model id rather than reading `packages/contracts/types/src/models.json`.
- Making Mobile the first heavy local PDF/DOCX/PPTX/image-gen engine instead of delegating to Desktop/Cloud.
- Referencing Supabase, or any removed tier (Plus / pro_plus / Hobby) in composer copy.
