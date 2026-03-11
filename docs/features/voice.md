# Feature: Voice
> Push-to-talk and continuous voice dictation that captures mic audio via MediaRecorder or cpal, routes through Deepgram streaming or Whisper batch transcription, applies optional AI cleanup, then inserts text into the chat composer or any focused OS window.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Components | `components/Voice/VoiceInputOverlay.tsx` (floating overlay, 5 visual states), `VoiceMicButton.tsx` (DEPRECATED) |
| Stores | `stores/voiceInputStore.ts` — mode state machine (idle/listening/transcribing/processing/preview), transcript, provider, postProcessingMode |
| Hooks | `hooks/useVoiceHotkey.ts` — keyboard hotkey binding; `useVoiceInput.ts` — browser Web Speech API path; `useVoiceTranscription.ts` — MediaRecorder + Whisper Cloud path; `useGlobalVoicePTT.ts` — Tauri event listener for OS-level fn-key PTT; `useTTS.ts` — TTS playback |
| Rust Commands | `sys/commands/voice.rs` — `voice_transcribe_blob`, `voice_configure`, `voice_get_settings`, `voice_check_local_whisper`, `speech_start_recording`, `speech_stop_and_transcribe`, `voice_tts_speak` |
| Rust Commands (Global) | `sys/commands/voice_global.rs` — `voice_start_global_ptt`, `voice_stop_global_ptt`, `voice_inject_text` |
| Rust Core (STT) | `features/speech/deepgram.rs` (Deepgram Nova-2/3 WebSocket), `local_stt.rs` (Whisper via whisper-rs, `#[cfg(feature="local-whisper")]`), `recognition.rs` |
| Rust Core (TTS) | `features/speech/tts.rs` (System/ElevenLabs/OpenAI), `local_tts.rs` (Piper neural TTS) |
| Rust Core (VAD) | `features/speech/vad.rs` (WebRTC VAD, dedicated worker thread, `#[cfg(feature="vad")]`) |
| Rust Core (Wake/PTT) | `features/speech/wake.rs` (wake word), `ptt.rs` (in-app PTT), `barge_in.rs` (TTS interruption) |
| Mobile | `apps/mobile/components/voice/VoiceInputButton.tsx`, `RecordingOverlay.tsx`, `Waveform.tsx`, `VoiceConversationScreen.tsx`, `services/voice.*` |
| Event Channels | `voice:recording:started`, `voice:recording:stopped`, `voice:transcription:complete`, `voice:ptt-start`, `voice:ptt-stop`, `voice:barge_in_detected`, `voice:barge_in_enabled`, `voice:tts_started`, `voice:tts_completed`, `voice:tts_interrupted`, `voice:tts_error`, `voice:whisper_download_progress`, `voice:piper_download_progress`, `voice:piper_binary_download_progress`, `deepgram:transcript`, `deepgram:speech_final` |
| Web API Routes | `apps/web/app/api/voice/transcribe` (Whisper Cloud relay), `apps/web/app/api/voice/health` |
| Database | None (transcripts not persisted; settings in localStorage via Zustand persist) |

## Data Flow

### Path A: Wispr Flow (Push-to-Talk in desktop — primary path)

1. **Hotkey detection** (`useVoiceHotkey.ts:34`): `keydown` detects configured hotkey (Option / Ctrl+Space / Ctrl+Shift+V). Calls `voiceInputStore.startListening()`.

2. **Browser audio capture** (`voiceInputStore.ts:152`): `navigator.mediaDevices.getUserMedia({ audio: true })`. `MediaRecorder` starts with `audio/webm;codecs=opus` or `audio/mp4` fallback. Chunks every 100ms. Mode: `idle → listening`.

3. **Hotkey release** (`useVoiceHotkey.ts:46`): `keyup` fires. Calls `stopListening()`.

4. **Audio assembly** (`voiceInputStore.ts:196`): `MediaRecorder.stop()` awaited. Chunks concatenated into single `Blob`. Mode: `listening → transcribing`.

5. **IPC to Rust** (`voiceInputStore.ts:227`): `invoke('voice_transcribe_blob', { audioData: Uint8Array, format, provider, language })`.

6. **Rust routing** (`voice.rs:231`): Writes to temp file, routes by provider:
   - `local_whisper` → `transcribe_with_local_whisper()` (requires `local-whisper` feature)
   - `openai_whisper` → `transcribe_with_openai_direct()` using BYOK key
   - `deepgram` → warns (streaming-only), falls back to cloud
   - Default → `transcribe_with_managed_cloud()` → `POST {API_BASE_URL}/api/llm/v1/audio/transcriptions`

7. **Result**: Returns `VoiceTranscription { text, language, duration, confidence }`.

8. **Post-processing** (`voiceInputStore.ts:246`): Mode: `transcribing → processing`:
   - AI mode: `llm_send_message` with filler-word removal prompt
   - Basic mode: regex replaces `um|uh|er|like|you know`
   - None mode: raw transcript

9. **Preview + auto-confirm** (`VoiceInputOverlay.tsx:32`): Mode: `processing → preview`. After `PREVIEW_AUTO_CONFIRM_MS=2000ms`, `confirmTranscript()` inserts into composer. Mode: `preview → idle`.

### Path B: Global OS-level PTT (fn-key, works outside app)

1. `invoke('voice_start_global_ptt')` spawns OS thread using `rdev::listen` (blocking)
2. `rdev::Key::Function` press/release emits `voice:ptt-start`/`voice:ptt-stop`
3. Frontend `useGlobalVoicePTT` triggers recording/transcription
4. `invoke('voice_inject_text', { text })` → `Enigo::text()` types into OS-focused window

### Path C: Backend cpal recording

1. `invoke('speech_start_recording')` → cpal opens default input device, dedicated OS thread, samples into `Arc<Mutex<Vec<f32>>>`. Emits `voice:recording:started`.
2. `invoke('speech_stop_and_transcribe')` → sets AtomicBool stop, encodes WAV, routes through same transcription pipeline. Emits `voice:recording:stopped`.

### Path D: Deepgram streaming (real-time)

1. `DeepgramClient::start_streaming()` → WebSocket `wss://api.deepgram.com/v1/listen?model=nova-2`
2. Returns `(audio_tx, transcript_rx)`. Raw PCM → transcript events with `is_final`, `speech_final`.
3. Auto-reconnects up to 5 times with exponential backoff.

### Path E: Mobile (React Native)

1. Tap-to-toggle: `VoiceService.startRecording()` (expo-av), then `transcribe(uri)` → server Whisper
2. Hold >300ms: `Audio.Recording.createAsync(HIGH_QUALITY)`, release → Deepgram Nova-3 or server fallback
3. Long press >600ms: Opens `VoiceConversationScreen` full-screen voice mode

## Component Tree

```
App (mounts useVoiceHotkey globally)
└── VoiceInputOverlay                      ← floating overlay, z-[100]
    ├── [listening]    pulsing red mic circle
    ├── [transcribing] Loader2 spinner
    ├── [processing]   Sparkles icon (AI cleanup)
    └── [preview]      CheckCheck + pendingTranscript → auto-confirms 2s

Mobile: ChatInput
└── VoiceInputButton                       ← tap / hold / long-press
    └── RecordingOverlay → Waveform (animated bars from audioLevel)
```

## IPC Contracts

| Frontend Call | Rust Handler | Params (camelCase) | Returns |
|---|---|---|---|
| `invoke('voice_transcribe_blob', ...)` | `voice_transcribe_blob` | `audioData: number[], format: string, provider?: string, language?: string` | `{ text, language?, duration?, confidence? }` |
| `invoke('voice_configure', ...)` | `voice_configure` | `provider?, model?, language?` | `void` |
| `invoke('voice_get_settings')` | `voice_get_settings` | — | `{ provider, model, language }` |
| `invoke('voice_check_local_whisper')` | `voice_check_local_whisper` | — | `boolean` |
| `invoke('speech_start_recording', ...)` | `speech_start_recording` | `provider: string` | `void` (emits `voice:recording:started`) |
| `invoke('speech_stop_and_transcribe', ...)` | `speech_stop_and_transcribe` | `provider: string, language: string` | `{ text, language?, duration?, confidence? }` |
| `invoke('voice_start_global_ptt')` | `voice_start_global_ptt` | — | `void` |
| `invoke('voice_stop_global_ptt')` | `voice_stop_global_ptt` | — | `void` |
| `invoke('voice_inject_text', ...)` | `voice_inject_text` | `text: string` | `void` |
| `invoke('voice_tts_speak', ...)` | `voice_tts_speak` | `text: string, provider?: string` | `void` |

## Dependencies

- **Requires**: `navigator.mediaDevices.getUserMedia` (mic permission), `cpal` crate (backend recording), `rdev` crate (OS keyboard hook for global PTT), `enigo` crate (text injection), `whisper-rs` (`local-whisper` feature), `webrtc-vad` (`vad` feature), `settingsStore` (BYOK keys), `supabaseAuth` (cloud token)
- **Required by**: Chat composer (reads `voiceInputStore.transcript`), Global PTT (injects into any OS window), Mobile ChatInput

## Known Gaps

1. **`VoiceMicButton` is deprecated** — shows toast "deprecated", still exported from barrel `index.ts`. Should be removed.
2. **Two parallel audio capture paths**: Browser MediaRecorder (primary) and cpal backend exist without auto-selection.
3. **Deepgram streaming not wired to Wispr Flow**: `deepgram.rs` implements full streaming but `voice_transcribe_blob` warns and falls back to cloud for `provider="deepgram"`.
4. **`voice_check_local_whisper` checks system binary** (line 384), not `whisper-rs` model files — returns false even when `local-whisper` models are downloaded.
5. **`useVoiceInput.ts` and `useVoiceTranscription.ts` overlap** with `voiceInputStore` — neither integrated with canonical store.
6. **Wake word requires `vad` feature** — not compiled by default.

## Design Decisions

- **Browser MediaRecorder over cpal for primary path**: Better UX (real-time waveform, mic permission UI, cross-platform audio constraints). cpal exists as fallback.
- **Three-tier post-processing** (ai → basic → none): Graceful degradation. If LLM fails, falls back to regex cleanup.
- **2-second preview auto-confirm**: Balances responsiveness with misrecognition review window.
- **rdev on dedicated thread for global PTT**: `rdev::listen` is blocking, can't integrate with Tokio. `PTT_RUNNING: AtomicBool` safely signals exit.
- **`lock_enigo()` mutex for text injection**: Serializes all synthetic input events app-wide, preventing race with computer-use automation.
