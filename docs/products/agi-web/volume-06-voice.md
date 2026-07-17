# AGI Web — Volume 06 — Voice

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon). Grounded in real repo paths: `apps/web/features/chat/pages/WebChatPage.tsx`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`, `apps/web/features/chat/components/Composer/VoiceInputButton.tsx`, `apps/web/features/chat/components/Composer/VoiceRecordingOverlay.tsx`, `apps/web/features/chat/stores/voice-input-store.ts`, `apps/web/features/chat/hooks/use-voice-recording.ts`, `apps/web/features/chat/components/messages/AudioPlayer.tsx`, `apps/web/lib/hooks/useTTS.ts`, `apps/web/app/api/llm/v1/audio/transcriptions/route.ts`, `apps/web/app/api/voice/transcribe/route.ts`, `apps/web/app/api/voice/health/route.ts`, `apps/web/app/settings/voice/page.tsx`, `apps/web/lib/managed-compute-gate.ts`, `apps/web/lib/rate-limit.ts`, `packages/platform/utils/src/voice.ts`, `packages/client/desktop-command-client/src/voice.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume covers voice on **AGI Web**: dictating chat input by microphone, speech-to-text, audio streaming, playback of clips and assistant replies, interruption, and the microphone-permission model.

AGI Web is the **cloud-only** surface — **no Local mode, no BYOK, ever**. That drives every requirement here. Voice on Web has exactly two legal execution paths: (1) **browser-native** speech APIs (`SpeechRecognition`, `speechSynthesis`) that run in the user's browser, and (2) a **Managed Cloud** transcription route proxied through AGI's server with a server-held provider key. The managed path is Clerk-auth-gated, rate-limited, and passes the managed-compute gate like every other cloud feature. A microphone stream is Managed-Cloud data the moment it leaves the browser; it must never be relabeled as "Local" or "BYOK." The `settings/voice` page may point users to BYOK Whisper on **Desktop/CLI**, but the Web surface exposes no key field. Model/engine IDs are read from source, never invented: the managed route pins its own model allow-list (default `whisper-1`, which is also a real entry in `packages/contracts/types/src/models.json`); non-LLM STT/TTS engine names are catalog-exempt but referenced by path.

## Voice Chat

Push-to-talk dictation into the composer is **✅ Built**. AGI Web renders `ChatComposerNew` (`apps/web/features/chat/pages/WebChatPage.tsx` → `ChatComposerNew.tsx`), which mounts `Composer/VoiceInputButton.tsx`. That button drives a `voice-input-store` state machine `idle → listening → transcribing → idle` (`apps/web/features/chat/stores/voice-input-store.ts`), shows a `VoiceRecordingOverlay` (listening timer, waveform, cancel/done), and returns the transcript for the user to review before sending — dictation, not a hands-free agent. Recognized text is post-processed via `cleanupVoiceDictation`/`detectVoiceCommand` from `packages/platform/utils/src/voice.ts`.

A full **conversational voice mode** (continuous listen → respond → speak, ChatGPT-Advanced-Voice style) is **🔭 Planned**. When built: a single session state machine (idle → listening → thinking → speaking), a visible "Managed Cloud" trust label, no auto-send without an explicit setting, and the account's selected model — never a hardcoded ID.

## Speech Recognition

Two recognition paths exist in `voice-input-store.ts`, both **✅ Built**:

- **Path A — browser Web Speech API:** `window.SpeechRecognition`/`webkitSpeechRecognition`, single-shot (`continuous=false`, `interimResults=false`), using a persisted BCP-47 `language` (defaults to `navigator.language`). `isVoiceSupported()` (`packages/platform/utils/src/voice.ts`) gates availability; an unsupported/denied environment hides the mic button. Note: browser-native recognition may route audio to the **browser vendor's** cloud (e.g. Chrome→Google) — outside AGI's boundary, and must be disclosed, not called "local/private."
- **Path B — managed server transcription:** capture via `MediaRecorder` (Opus/WebM preferred), then `POST` to `/api/voice/transcribe`. The route (`apps/web/app/api/voice/transcribe/route.ts` → `apps/web/app/api/llm/v1/audio/transcriptions/route.ts`) requires a Clerk user, runs `buildManagedComputeGateResponse`, rate-limits via the `audio-transcription` bucket (20/min, `failClosed: true` — `apps/web/lib/rate-limit.ts`), enforces a 25 MB cap, validates MIME against an allow-list that **default-rejects** missing/unknown types, **sniffs the first 12 bytes** for a real audio signature, restricts `model` to an in-code allow-list (default `whisper-1`), and forwards to OpenAI Whisper with a 60 s timeout using the server `OPENAI_API_KEY`. `apps/web/app/api/voice/health/route.ts` reports liveness.

A user-facing **language picker** and surfacing of confidence/duration are **🔭 Planned** (the store supports `setLanguage`, but no settings UI exposes it yet).

## Streaming Audio

Audio-level **metering** during capture is **✅ Built**: `apps/web/features/chat/hooks/use-voice-recording.ts` wires `AudioContext → AnalyserNode` and emits ~32 normalized bars via `requestAnimationFrame` for the visualizer (`meteringToAmplitude` in `packages/platform/utils/src/voice.ts`). `MediaRecorder` uses a 100 ms timeslice so chunks accumulate.

Real-time **streaming transcription** (interim partials as the user speaks) is **🔭 Planned** on Web. The managed route is one-shot — it reads the full body, then POSTs the complete file; there is no chunked/WebSocket transcription endpoint under `apps/web`. Deepgram streaming primitives (`DeepgramStreamStatus`, `DeepgramStreamingStats`) live only in the **Desktop** Tauri layer (`packages/client/desktop-command-client/src/voice.ts` — "voice\_\* Tauri commands"), never on Web. When built, Web streaming stays Managed-Cloud with the same auth + gate + rate-limit contract and an outbound-authenticated channel — never a raw provider socket exposed to the browser.

## Playback

Two building blocks exist, neither yet reachable from the primary web chat:

- **Recorded-clip playback — 🟡 Partial:** `apps/web/features/chat/components/messages/AudioPlayer.tsx` renders a decoded waveform, play/pause, click-to-seek, MM:SS, spacebar control, and re-record/discard/send. It is a real, complete component, but it is imported by `EnhancedMessageInput.tsx` rather than the shipping `ChatComposerNew`, so it is not user-reachable in the main web chat today.
- **Read-aloud TTS — 🟡 Partial:** `apps/web/lib/hooks/useTTS.ts` implements `speak/stop/isSpeaking/isSupported` over `window.speechSynthesis`, strips Markdown/code, and cancels on unmount. Gap: not wired into any message component, so no "read aloud" control ships.

Server-side **neural TTS** (a managed `/audio/speech`-style route returning synthesized audio) is **🔭 Planned** — no such route exists under `apps/web/app/api`. When built it is Managed-Cloud, auth-gated, rate-limited, and voice IDs come from a real catalog, never invented.

## Interruptions

Manual cancel primitives are **✅ Built**: `useTTS.stop()` cancels the current utterance and `speak()` toggles off when already speaking; `VoiceRecordingOverlay` **Cancel** force-stops and **discards** the take, **Done** stops and transcribes; the composer's stream stop button aborts an in-flight reply.

Conversational **barge-in** (user speech interrupts assistant playback with auto turn resumption) is **🔭 Planned** on Web — there is no audio-monitoring loop; `BargeInStatus`/`BargeInConfig` exist only in the Desktop Tauri layer (`packages/client/desktop-command-client/src/voice.ts`). Requirement when built: any active playback and any in-flight transcription halt immediately and abort their requests, with no leaked stream or dangling `AbortSignal`.

## Permissions

Microphone consent is **✅ Built** for the capture paths: `use-voice-recording.ts` queries `navigator.permissions.query({ name: 'microphone' })`, subscribes to permission `change` events, and maps `getUserMedia` failures to specific states (`NotAllowedError`/`PermissionDeniedError` → denied, `NotFoundError` → no device); `voice-input-store.ts` mirrors this via `buildMediaError`/`buildErrorMessage`. Streams are torn down (`getTracks().forEach(t => t.stop())`) on stop, cancel, and unmount. Only user preferences (language, server-preference) persist to `localStorage`; raw audio never persists.

Gaps (**🔭 Planned**): an AGI-owned pre-permission explainer, in-app recovery UX when the OS/browser blocks the mic, and a persisted per-account voice preference. Managed-voice **quota/billing** enforcement is **🔭 Planned** — `apps/web/app/settings/voice/page.tsx` hardcodes `hasVoice = false` and shows an honest "coming soon" banner rather than advertising unbilled minute caps.

## Repository map

- `apps/web/features/chat/pages/WebChatPage.tsx`, `components/Composer/ChatComposerNew.tsx` — web chat + active composer.
- `apps/web/features/chat/components/Composer/VoiceInputButton.tsx`, `VoiceRecordingOverlay.tsx` — mic dictation UI.
- `apps/web/features/chat/stores/voice-input-store.ts` — dual-path recognition state machine.
- `apps/web/features/chat/hooks/use-voice-recording.ts` — capture, metering, permissions.
- `apps/web/features/chat/components/messages/AudioPlayer.tsx` — clip playback + waveform.
- `apps/web/lib/hooks/useTTS.ts` — browser SpeechSynthesis playback.
- `apps/web/app/api/llm/v1/audio/transcriptions/route.ts`, `app/api/voice/transcribe/route.ts`, `app/api/voice/health/route.ts` — managed STT + health.
- `apps/web/app/settings/voice/page.tsx` — voice settings (gated "coming soon").
- `apps/web/lib/managed-compute-gate.ts`, `apps/web/lib/rate-limit.ts` — cloud gate + `audio-transcription` limits.
- `packages/platform/utils/src/voice.ts` — shared dictation/metering helpers; `packages/client/desktop-command-client/src/voice.ts` — Desktop (Tauri) voice wrappers (reference only).

## Competitor notes

ChatGPT ships hands-free Advanced Voice with server streaming STT/TTS and barge-in; Claude offers mobile voice; Codex is text-first. AGI Web deliberately diverges: voice is a **cloud-managed, auth-gated, metered** feature here — **never BYOK, never Local** (those live on Desktop/CLI). Browser-native recognition is offered as zero-infra convenience but honestly labeled as leaving AGI's boundary. AGI's multi-provider stance keeps transcription/TTS engines swappable behind the managed gate rather than locked to one vendor, and any voice conversation uses the account's selected model, never a hardcoded default.

## Acceptance / Definition of Done

Production-ready when: dictation inserts reviewable text; managed transcription stays auth-gated, rate-limited, and size/format-validated; playback is user-reachable with a clear stop; permission denial has a recovery path; and every capability carries an accurate Built/Planned state with no faked availability.

- [ ] **Build:** mic button, `voice-input-store`, and the managed route pass `pnpm --filter @agiworkforce/web typecheck` + `test`; no dead voice controls; playback wired into the shipping composer before it is advertised.
- [ ] **Trust:** no BYOK or Local voice affordance on Web; captured audio labeled Managed-Cloud; browser-native recognition disclosed as vendor-cloud.
- [ ] **Security:** transcription requires Clerk auth, passes the managed-compute gate, enforces the 25 MB cap + MIME allow-list + magic-byte sniff + `audio-transcription` fail-closed rate limit; no provider key reaches the browser.

## Anti-patterns

- Adding a BYOK key field or a "Local voice" toggle to any Web voice UI — Web is cloud-only.
- Labeling browser-native or managed transcription as "private/on-device" — it is not on Web.
- Hardcoding or inventing a transcription/TTS/chat model ID; read allow-lists from the route and `packages/contracts/types/src/models.json` (`whisper-1` is a real entry).
- Shipping `settings/voice` as "available" while unbilled/unenforced, or advertising minute caps that do not exist.
- Advertising `AudioPlayer`/`useTTS` as user-facing playback while they remain unwired to the shipping composer.
- Exposing a raw provider socket/key to the client, or skipping the auth gate, rate limit, or size/format validation.
- Referencing Supabase, renaming `proxy.ts` to `middleware.ts`, or surfacing removed tiers (Plus/pro_plus/Hobby), credit top-ups, or invented INR prices.
