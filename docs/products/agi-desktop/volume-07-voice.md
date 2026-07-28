# AGI Desktop — Volume 07 — Voice

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/desktop/AGENTS.md`, and the desktop voice implementation: `apps/desktop/src/features/voice/`, `apps/desktop/src/stores/settings/voice.ts`, `apps/desktop/src/stores/voiceInputStore.ts`, `apps/desktop/src/features/settings/VoiceSettings.tsx`, `apps/desktop/src/features/settings/VoicePersonaSelector.tsx`, `apps/desktop/src/features/v3/MicSettings.tsx`, `apps/desktop/src/features/chat/AudioPreview.tsx`, `apps/desktop/src/api/voice.ts`, `apps/desktop/src-tauri/src/features/speech/{tts.rs,local_tts.rs,deepgram.rs}`, `apps/desktop/src-tauri/src/sys/commands/{voice.rs,voice_global.rs}`, and catalog IDs from `packages/contracts/types/src/models.json`.

## Overview & stance

Voice on AGI Desktop is a full-loop capability: capture microphone audio, transcribe to text (STT), route the text through the selected chat model, and speak the reply (TTS). Because Desktop is the full-trust surface (Local + BYOK + Managed Cloud), voice must expose the same trust boundary as chat. The default recognition engine is on-device Whisper and the default speech engine is on-device Piper, so a user can run the entire loop **Local** with no audio leaving the machine. Cloud engines (Deepgram, OpenAI Whisper, OpenAI TTS, ElevenLabs) exist but are opt-in and must carry a visible provider label. Local audio must never be silently uploaded to BYOK or Managed Cloud (`apps/desktop/src/features/voice/README.md`). Cloud STT/TTS usage is metered under the Managed-Cloud ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise); BYOK keys live in the OS keychain and are a free access mode, not a plan.

## Voice Conversations

Full voice-conversation mode runs a listen → transcribe → LLM → speak turn loop with phase states (`idle`/`listening`/`processing`/`speaking`), multi-turn context (last five turns), and audio-level metering for a live waveform. **✅ Built** — `apps/desktop/src/stores/settings/voice.ts` (`useVoiceModeStore`, `startListening`/`stopListeningAndProcess`) with the `VoiceMode.tsx` overlay in `apps/desktop/src/features/voice/`. The LLM leg calls `llm_send_message` with the user's selected provider/model, so the trust mode of the conversation follows the chat trust mode — voice does not introduce a fourth trust boundary. Wake-word and global push-to-talk entry points exist (`voice_global.rs`).

## Speech Recognition

Three STT engines are selectable: `local_whisper` (offline, Local), `deepgram` (cloud streaming — Nova-3/Nova-2 per `apps/desktop/src-tauri/src/features/speech/deepgram.rs`), and `openai_whisper` (cloud, catalog `gpt-4o-transcribe` in `packages/contracts/types/src/models.json` — `whisper-1` was retired upstream and removed from the catalog; the engine key kept its historical name). Blob transcription (`voiceTranscribeBlob`), native recording (`speechStartRecording`/`speechStopAndTranscribe`), and live Deepgram streaming with interim + final results are all wired. **✅ Built** — `apps/desktop/src/api/voice.ts`, `apps/desktop/src/stores/voiceInputStore.ts`, `deepgram.rs`. Optional AI/basic/none dictation post-processing cleans transcripts before insert. **🟡 Gap:** selecting a cloud STT engine from a Local session is a plain provider switch today; the Local→BYOK/Cloud fork ceremony (secret scan, payload preview, explicit consent) is not yet enforced on the voice path.

## Text-to-Speech

Four speech paths exist: on-device **Piper** neural TTS (offline, Local — `apps/desktop/src-tauri/src/features/speech/local_tts.rs`), **system TTS** (`speak_sync`, e.g. macOS `say`), **OpenAI TTS** (`gpt-4o-mini-tts`), and **ElevenLabs** (`voice_id`-addressed, default model `eleven_flash_v2_5`). **✅ Built** — `apps/desktop/src-tauri/src/features/speech/tts.rs` with `voiceTtsSpeak`, `speakLocal`, and `configureTts` bridged through `apps/desktop/src/api/voice.ts`. Piper voices download on demand (`downloadPiperVoice`). Local TTS keeps text on-device; cloud TTS carries a provider label and is BYOK/Managed-Cloud.

## Playback Controls

Rendered audio (attachments and TTS replies) supports play/pause with a live waveform visualization, plus a global stop for in-flight speech (`stopTts`/`stopSpeaking`). **✅ Built** — `apps/desktop/src/features/chat/AudioPreview.tsx` (`togglePlayPause`, `Volume2`) and `apps/desktop/src/features/chat/VoiceRecordingStatus.tsx`; inline results render via `apps/desktop/src/features/chat/InlineToolResults/InlineVoiceResult.tsx`. **🟡 Gap:** there is no scrub/seek bar or resume-from-position control for spoken replies — playback is play/pause/stop only.

## Voice Selection

Users pick a speaking persona (Professional, Friendly, Calm, Energetic, Storyteller, Code) with a sample-phrase preview, and can list/download concrete engine voices (`listTtsVoices` for cloud engines, `listPiperVoices` for offline Piper). **✅ Built (UI + listing)** — `apps/desktop/src/features/settings/VoicePersonaSelector.tsx`, `apps/desktop/src/features/settings/VoiceSettings.tsx`. **🟡 Gap:** the selected persona is persisted to `localStorage` (`agiworkforce-voice-persona`) but is not yet mapped to a concrete engine `voice_id`/Piper voice in `configureTts`, so persona choice does not deterministically change the spoken voice end-to-end yet.

## Playback Speed

The speech backend accepts a speaking-rate parameter: `speakLocal(text, rate, volume)` in `apps/desktop/src/stores/settings/voice.ts` forwards `rate`/`volume` to `voiceTtsSpeakLocal`. **🟡 Partial** — the rate/volume path is plumbed through the store and Tauri API, but no playback-speed slider is surfaced in `VoiceSettings.tsx` or the playback UI, so users cannot yet choose 0.75×/1×/1.5× speech. Surfacing a speed control and persisting it is **🔭 Planned**.

## Interruptions

Barge-in interruption is implemented: while the assistant is speaking, detected user speech stops TTS and returns to listening. Controls include `enableBargeIn`, `voiceTtsSpeakWithBargeIn`, `startBargeInMonitoring`/`stopBargeInMonitoring`, and `configureBargeIn(sensitivity, minSpeechMs, consecutiveFramesThreshold)`. **✅ Built** — `apps/desktop/src/stores/settings/voice.ts`, `deepgram.rs`, and `tts.rs`. Manual interruption (stop button / close overlay) is always available via `stopTts`/`stopSpeaking`. Barge-in enablement is persisted (`partialize` in `useVoiceModeStore`).

## Microphone Selection

Users choose an input device from an enumerated list; the choice is persisted and applied as an exact-device constraint on capture. **✅ Built** — `apps/desktop/src/features/v3/MicSettings.tsx` enumerates `audioinput` devices via `navigator.mediaDevices.enumerateDevices()`, and `apps/desktop/src/stores/voiceInputStore.ts` stores `selectedDeviceId` and passes `{ deviceId: { exact: … } }` to `getUserMedia`. A "Default microphone" fallback is always present when labels are unavailable (pre-permission or non-secure context). Hold-to-record and auto-trim-silence toggles live alongside the picker.

## Multiple Audio Devices

Device hot-plug is handled: a `devicechange` listener re-enumerates inputs when headphones/USB mics connect or disconnect, and the picker updates live. **✅ Built (input)** — `apps/desktop/src/features/v3/MicSettings.tsx`. **🔭 Planned:** output-device (sink) selection — routing TTS/playback to a chosen speaker via `setSinkId` — is not implemented; playback uses the system default output only.

## Repository map

- `apps/desktop/src/features/voice/` — voice mode, input overlay, mic button (`VoiceMode.tsx`, `VoiceInputOverlay.tsx`, `VoiceMicButton.tsx`, `README.md`).
- `apps/desktop/src/stores/settings/voice.ts`, `apps/desktop/src/stores/voiceInputStore.ts` — voice-mode and voice-input state.
- `apps/desktop/src/features/settings/VoiceSettings.tsx`, `VoicePersonaSelector.tsx`, `apps/desktop/src/features/settings/tabs/Voice/index.tsx` — settings UI.
- `apps/desktop/src/features/v3/MicSettings.tsx`, `apps/desktop/src/features/v3/Composer.tsx` — device picker + composer entry.
- `apps/desktop/src/features/chat/{AudioPreview.tsx,VoiceRecordingStatus.tsx,VoiceInputButton.tsx,InlineToolResults/InlineVoiceResult.tsx}` — chat playback + inline results.
- `apps/desktop/src/api/voice.ts` — Tauri command bridge.
- `apps/desktop/src-tauri/src/features/speech/{tts.rs,local_tts.rs,deepgram.rs}`, `apps/desktop/src-tauri/src/sys/commands/{voice.rs,voice_global.rs}`, `apps/desktop/src-tauri/src/lib.rs` — Rust STT/TTS backend + command registration.
- `packages/contracts/types/src/models.json` — catalog IDs for cloud STT/TTS (`gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-mini-tts`).

## Competitor notes

ChatGPT ships Advanced Voice Mode (realtime, low-latency, single vendor, cloud-only). Claude offers voice primarily on mobile clients. Codex has no first-class voice. AGI diverges deliberately: **multi-engine and local-first** — the default STT (Whisper) and TTS (Piper) run fully offline in Local mode, so a private voice loop needs no network. Cloud engines (Deepgram, OpenAI, ElevenLabs) are opt-in, per-surface trust-labeled, and on Desktop usable via **BYOK** keys held in the OS keychain — no forced managed-cloud subscription for voice. This is the local-first, no-lock-in stance the suite competes on, not a bid to out-latency a single hosted realtime API.

## Acceptance / Definition of Done

Voice is production-ready on Desktop when: (1) a full Local voice conversation (Whisper STT → chat model → Piper TTS) runs with no outbound network; (2) every cloud engine shows a visible provider label and never receives Local audio without explicit consent; (3) persona selection deterministically maps to a spoken voice; (4) a playback-speed control is surfaced and persisted; and (5) mic selection + hot-plug work across macOS/Windows/Linux.

- [ ] Build: `pnpm --filter @agiworkforce/desktop typecheck && pnpm --filter @agiworkforce/desktop test`; `cargo check -p agiworkforce-desktop`.
- [ ] Trust: Local voice loop verified offline; cloud STT/TTS gated behind the Local→BYOK/Cloud fork (secret scan, payload preview, consent, provider label).
- [ ] Security: mic capture stops and streams close on overlay close/reset; no residual audio buffers; cloud keys read only from the OS keychain.

## Anti-patterns

- Do **not** silently send Local-mode microphone audio to Deepgram, OpenAI, ElevenLabs, or Managed Cloud — that violates the Local trust boundary.
- Do **not** treat cloud STT/TTS selection as a bare dropdown; it is a Local→BYOK/Cloud fork requiring consent + a visible provider label.
- Do **not** hardcode or invent STT/TTS model IDs — cloud catalog IDs (`gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-mini-tts`) come from `packages/contracts/types/src/models.json`; Deepgram Nova / Piper voice identifiers stay grounded in `deepgram.rs` / `local_tts.rs`. **🟡 Known deviation:** `tts.rs` still hardcodes both TTS defaults (`gpt-4o-mini-tts`, `eleven_flash_v2_5`) because there is no `voice_tts` routing slot and the catalog carries no ElevenLabs provider — a `tts_defaults_are_not_retired_models` unit test guards against the ids going stale until the slot exists. STT is correctly catalog-driven via the `voice_transcription` slot.
- Do **not** reference removed tiers ("Plus", `pro_plus`, "Hobby"), invent INR prices for Pro/Max, or add voice credit top-ups.
- Do **not** reference Supabase or rename `proxy.ts` to `middleware.ts`.
- Do **not** claim persona-to-voice mapping, playback-speed UI, output-device selection, or seek/scrub as shipped — they are 🟡/🔭 until a cited path proves them.
