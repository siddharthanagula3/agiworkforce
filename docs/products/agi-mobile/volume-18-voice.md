# AGI Mobile — Volume 18 — Voice

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md`. Grounded in real repo paths: `apps/mobile/src/features/voice/` (services `voiceInput.ts`, `voice.ts`, `tts.ts`, `voiceOutput.ts`; components `VoiceConversationScreen.tsx`, `VoiceSelector.tsx`; hook `useVoicePlayback.ts`; `voicePresets.ts`), `apps/mobile/src/features/settings/voice/index.tsx`, `apps/mobile/stores/settingsStore.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/app.config.js`, and `packages/types/src/models.json` (model SSOT).

## Overview & stance

Voice on AGI Mobile is **local-first by default**. Speech-to-text and text-to-speech run on-device through the platform speech engines, so a user can hold a spoken conversation with a Local on-device model with no audio leaving the phone. Mobile exposes exactly two trust modes — **Local** (on-device LLM, free) and **Managed Cloud** (public alpha, real auth gate). **There is no BYOK on mobile**: the "Provider" choice in voice settings selects an on-device versus a future AGI-Cloud speech engine, never a user-supplied API key. Cloud STT/TTS helpers exist but stay behind `FEATURES.cloudChat` and a hard-locked provider toggle; they must obey the same trust boundary as cloud chat (Clerk auth, egress guard, fail-closed in Local mode). Models that back cloud voice resolve only from `packages/types/src/models.json` — never a hardcoded ID. This volume covers the spoken conversation loop, recognition, synthesis, playback, voice selection, interruption, and audio routing.

## Voice Conversations — full duplex

A full-screen conversation surface (`VoiceConversationScreen.tsx`) drives a turn-based loop with four phases — `idle → listening → thinking → speaking` — an animated orb, mute, end-call, transcript preview, and the active model label sourced from `useModelStore`. After the assistant finishes speaking it auto-resumes listening (`autoListenRef`).

- ✅ Built — turn-based ("half-duplex") spoken conversation loop with auto-listen and on-device STT→model→TTS round trip: `apps/mobile/src/features/voice/components/VoiceConversationScreen.tsx`.
- 🔭 Planned — **true full duplex** (simultaneous listen-while-speaking, server-side streaming voice like ChatGPT Advanced Voice). The current loop is sequential, not concurrent; do not market it as full duplex until implemented.

## Speech Recognition

On-device STT is wired through `expo-speech-recognition` with `requiresOnDeviceRecognition: true`: iOS `SFSpeechRecognizer`, Android `SpeechRecognizer`. The service emits interim/partial results, volume metering, punctuation, locale auto-detection (`expo-localization`), and typed errors (`mic-permission-denied`, `on-device-recognition-unavailable`, `aborted`).

- ✅ Built — on-device recognition + permission flow + metering: `apps/mobile/src/features/voice/services/voiceInput.ts`; facade `voice.ts`. Permissions declared in `app.config.js` (`NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`, `RECORD_AUDIO`, `expo-speech-recognition` plugin).
- 🟡 Partial — **cloud STT** (Deepgram `nova-3`, ephemeral token from `${API_URL}/api/v1/voice/token`) exists in `voice.ts` but is gated by `FEATURES.cloudChat`, throws `CloudVoiceDisabledError` when off, and is **not wired into the conversation screen**. Token fetch uses `guardedFetch` (Local mode blocks before network I/O, fail-closed); the direct Deepgram call uses TLS-pinned `secureFetch`.
- Requirement: when on-device recognition is unavailable for the locale, surface the typed error to the user — never silently fall back to cloud.

## Text-to-Speech

System TTS via `expo-speech` (iOS `AVSpeechSynthesizer`, Android `TextToSpeech`), both on-device. `voiceOutput.ts` adds sentence-boundary chunking (≤500 chars/chunk) so long answers don't get cut by platform engine limits. Rate (0.5–2.0) and pitch (0.5–2.0) are clamped in `settingsStore`.

- ✅ Built — on-device synthesis with chunking, rate, pitch, voice id, language, and lifecycle callbacks: `apps/mobile/src/features/voice/services/tts.ts`, `voiceOutput.ts`.
- 🟡 Partial — `ttsProvider: 'system' | 'cloud'` exists in `settingsStore.ts` and the settings UI, but the **Cloud** option is hard-`disabled` (Lock icon): `apps/mobile/src/features/settings/voice/index.tsx`. Cloud TTS (e.g. ElevenLabs/OpenAI) is design intent only.
- 🔭 Planned — streaming/low-latency cloud TTS; mobile must not become the first heavy synthesis surface.

## Playback Controls

`useVoicePlayback` reads voice id, rate, and pitch from the settings store and exposes `speak` / `stop`, stopping any prior utterance before a new one (prevents overlap). The conversation screen exposes mute (cancels in-flight recording) and end-call (full cleanup of recorder + TTS).

- ✅ Built — message playback hook and conversation controls: `apps/mobile/src/features/voice/hooks/useVoicePlayback.ts`, `VoiceConversationScreen.tsx`. Cleanup releases mic/recognizer/TTS on unmount.
- 🔭 Planned — scrubbing, pause/resume mid-utterance, per-message replay history, and background-audio playback controls.

## Voice Selection

`VoiceSelector` (bottom sheet) lists five branded presets (Aurora, Nova, Sage, Ember, Atlas) that map keywords to the best matching system voice plus rate/pitch, a language picker derived from installed voice packs, and the raw system voice list with per-voice sample playback. Voice id/preset/rate/pitch are device-global; **speech language is a mode-scoped (Local vs Cloud) synced preference**.

- ✅ Built — presets, system-voice list, sample playback, language picker: `apps/mobile/src/features/voice/components/VoiceSelector.tsx`, `voicePresets.ts`; mode-split language via `localSettingsStore` / `cloudSettingsStore`.
- Requirement: presets resolve to whatever voices the OS actually has installed; never claim a branded voice that the device cannot produce.

## Interruptions — natural

While the assistant is speaking, tapping the orb stops TTS and immediately reopens the mic (`handleOrbPress` → `TTS.stop()` + `startListening`). Mute during listening cancels capture.

- ✅ Built — manual tap-to-interrupt (barge-in by gesture): `VoiceConversationScreen.tsx`.
- 🔭 Planned — **natural voice-activity barge-in** (detecting the user starting to speak and ducking/stopping TTS automatically) and echo cancellation. This needs concurrent capture+playback and is not implemented.

## Audio Routing — speaker + Bluetooth

Today playback and capture use the **OS default audio route**; there is no explicit in-app route control (no `setAudioModeAsync`/`expo-av` audio-mode or Bluetooth SCO handling present in `apps/mobile`).

- 🔭 Planned — explicit speaker vs earpiece toggle, Bluetooth/AirPods/CarPlay route selection and display, route-change handling (e.g. headset unplug pauses playback), and ducking other audio. Until built, the spec must not claim route control.
- Requirement when built: respect the OS audio session, never force the speaker over an active Bluetooth call route without consent, and show the active route in the conversation UI.

## Repository map

- `apps/mobile/src/features/voice/services/` — `voiceInput.ts` (on-device STT), `voice.ts` (facade + gated cloud STT), `tts.ts` (system TTS), `voiceOutput.ts` (chunked TTS).
- `apps/mobile/src/features/voice/components/` — `VoiceConversationScreen.tsx`, `VoiceSelector.tsx`, `Waveform.tsx`, `VoiceRecording.tsx`, `VoiceReview.tsx`, `RecordingOverlay.tsx`, `VoiceInputButton.tsx`.
- `apps/mobile/src/features/voice/` — `voicePresets.ts`, `hooks/useVoicePlayback.ts`, `index.ts`, `README.md`.
- `apps/mobile/src/features/settings/voice/index.tsx`, `settings/voice-language/` — voice settings + provider/auto-listen/rate.
- `apps/mobile/stores/settingsStore.ts` — `selectedVoiceId`, `speechRate`, `speechPitch`, `selectedPresetId`, `ttsProvider`.
- `apps/mobile/lib/v1FeatureFlags.ts` — `FEATURES.cloudChat` gate. `apps/mobile/app.config.js` — mic/speech permissions + `expo-speech-recognition` plugin.
- `packages/types/src/models.json` — model SSOT for any cloud-backed voice model.

## Competitor notes

ChatGPT (Advanced Voice) and Claude mobile offer cloud-streamed, low-latency, full-duplex voice tied to their own hosted models. AGI's deliberate divergence:

- **On-device Local voice as the default** — usable offline against a small on-device model, audio never leaving the phone, no account required.
- **Per-surface trust** — voice obeys the Local vs Managed-Cloud boundary; cloud voice is fail-closed in Local mode via the egress guard.
- **Multi-provider, model-from-SSOT** — the spoken model is whatever the user selected, resolved from `models.json`, not a single vendor voice stack.
- **No BYOK on mobile** — unlike desktop surfaces, mobile never accepts provider keys; "provider" means on-device vs AGI-Cloud engine.
- Trade-off: AGI is currently turn-based, not full-duplex; this volume marks that gap honestly rather than overclaiming parity.

## Acceptance / Definition of Done

Production-ready when: on-device STT and TTS work offline against a Local model; permission denial and on-device-unavailable states show clear typed errors with no silent cloud fallback; cloud voice stays fully gated and fail-closed when Local mode is active or `FEATURES.cloudChat` is off; mute/end-call reliably release mic, recognizer, and TTS; and no BYOK affordance exists anywhere in the voice path.

- [ ] Build/behavior: `pnpm --filter @agiworkforce/mobile typecheck` and `test` green; conversation loop, presets, and sample playback verified on a simulator/device.
- [ ] Trust: Local voice produces zero outbound network I/O (egress-guard verified); cloud STT/TTS only reachable when signed-in + `cloudChat` true; no provider-key UI.
- [ ] Security/permissions: mic + speech-recognition permission strings present and accurate; cloud token via `guardedFetch`, Deepgram via TLS-pinned `secureFetch`; no Supabase reference.

## Anti-patterns

- Adding a BYOK / API-key field to any voice screen (mobile has no BYOK — ever).
- Silently routing Local voice audio or transcripts to Deepgram/cloud TTS without explicit cloud mode + consent.
- Claiming full duplex, natural barge-in, or Bluetooth route control as shipped — they are 🔭 Planned.
- Hardcoding a voice model ID instead of reading `packages/types/src/models.json`.
- Making mobile the first heavy synthesis/recognition compute surface; delegate heavy cloud voice work upstream.
- Referencing Supabase or any retired tier (Plus/Hobby/pro_plus) in pricing or gating copy.
