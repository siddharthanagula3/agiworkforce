---
id: "F097-99"
type: "feature"
title: "Other items in Media and realtime components"
aliases: ["Media and realtime components", "Managed media pipeline", "Image and video generation jobs", "Live voice session broker", "Dictation, read-aloud and live voice", "S97.01 to S97.30"]
area: "97 Media and realtime components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S97.01", "S97.02", "S97.03", "S97.04", "S97.05", "S97.06", "S97.07", "S97.08", "S97.09", "S97.10", "S97.11", "S97.12", "S97.13", "S97.14", "S97.15", "S97.16", "S97.17", "S97.18", "S97.19", "S97.20", "S97.21", "S97.22", "S97.23", "S97.24", "S97.25", "S97.26", "S97.27", "S97.28", "S97.29", "S97.30"]
depends_on: ["SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-data-model-and-migrations", "surface:web", "surface:mobile", "surface:desktop", "surface:cli", "mode:cloud", "provider:openai", "provider:google", "provider:openrouter", "file:apps/web/app/api/media/image/lib/managed-image-generation.ts", "file:apps/web/app/api/voice/live/sessions/route.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F097-99 Other items in Media and realtime components

The server-side pieces behind AGI Workforce media and realtime voice: durable image and video generation jobs, mask checks, storage, AI-generated marking, speech-to-text, text-to-speech, and the live voice session broker. Several brief items (post-processing, transcoding, thumbnails, music, audio overview, consent store) have no code.

Area: [97. Media and realtime components](README.md). Requirement items: [S97.01](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9701), [S97.02](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9702), [S97.03](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9703), [S97.04](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9704), [S97.05](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9705), [S97.06](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9706), [S97.07](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9707), [S97.08](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9708), [S97.09](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9709), [S97.10](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9710), [S97.11](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9711), [S97.12](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9712), [S97.13](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9713), [S97.14](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9714), [S97.15](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9715), [S97.16](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9716), [S97.17](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9717), [S97.18](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9718), [S97.19](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9719), [S97.20](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9720), [S97.21](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9721), [S97.22](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9722), [S97.23](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9723), [S97.24](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9724), [S97.25](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9725), [S97.26](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9726), [S97.27](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9727), [S97.28](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9728), [S97.29](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9729), [S97.30](../../10-requirements/capabilities/097-media-and-realtime-components.md#s9730).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** This page covers the 30 items of the area that no named feature owns. The built parts are all Cloud (our managed service) code in apps/web. Image generation and editing run as durable queued jobs against the OpenAI, Google and Stability image routes (apps/web/app/api/media/image/lib/image-generation-provider.ts:315-420). Video runs as a provider task (Google, Runway, OpenRouter) that is polled and reconciled until done (apps/web/lib/services/video-provider-output-service.ts:300-310). Finished media is written to private storage and marked as AI-generated (apps/web/app/api/media/image/lib/image-job-executor.ts:766). Audio has three server routes: transcription (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:852), read-aloud speech (apps/web/app/api/voice/speech/route.ts:53) and a live voice session broker over WebRTC (apps/web/app/api/voice/live/sessions/route.ts:555-565).

**Why it exists.** Image and video work outlasts one HTTP request, costs money, and can fail at the provider. A durable job with one billing reservation means a closed tab does not abandon paid work and a retry does not charge twice (apps/web/db/neon/0226_durable_image_generation_jobs.sql:1-15). Voice needs server-held provider keys, per-plan limits and tool approval, so the browser never holds a long-lived key (apps/web/app/api/voice/live/sessions/route.ts:126-148).

**Who uses it.** People using AGI Workforce Cloud on web, mobile, desktop and CLI who generate images or video, dictate, hear replies read aloud or talk live. Engineers and testers maintaining the media and voice pipeline.

**Problems it solves**

- Image or video work lost when the person closes the tab (apps/web/db/neon/0226_durable_image_generation_jobs.sql:1-15).
- Paying twice on retry: one idempotency key and one reservation per job (apps/web/app/api/media/image/lib/managed-image-generation.ts:709-745).
- Masks that do not match the source image are rejected with a plain message before any provider spend (apps/web/app/api/media/image/lib/edit-mask.ts:90-102).
- Generated images carry a machine-readable AI-generated mark (apps/web/lib/server/generated-media-provenance.ts:34-37).

**Use cases**

- A person asks for an image, closes the tab, and finds the finished image in their media library later.
- A person draws a region on an image and asks for an edit; the server checks the mask is a PNG with transparency and the same size.
- A person starts a video; the server polls the provider or accepts a signed provider callback until the file is stored.
- A person talks to the assistant live; the server opens a provider session, bills in one-minute blocks and lets the voice run approved tools.

## 2. User experience

**Where to find it**

- Web: voice call surface VoiceModeSurface in chat (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:38-60); image and video pages at /features/images and /features/video are marketing pages with tests (apps/web/app/features/images/page.test.tsx) [inferred].
- Mobile: voice screen apps/mobile/app/(app)/voice.tsx (doc: docs/product/surface-feature-matrix.md:326); live voice client apps/mobile/src/features/voice/services/liveVoiceSession.ts.
- Desktop: dictation in apps/desktop/electron/voiceDictation.ts; hook useVoiceTranscription posts to /api/voice/transcribe (apps/desktop/src/hooks/useVoiceTranscription.ts:650).
- CLI: apps/cli/src/voice.rs (push-to-talk, three backends) and apps/cli/src/cloud/image.rs (image generation) (apps/cli/src/voice.rs:1-9; apps/cli/src/cloud/image.rs:1,21).
- VS Code: no voice, a webview has no microphone (doc: docs/product/surface-feature-matrix.md:328).
- Chrome extension: voice side panel apps/extension/src/features/side-panel/voice.ts (doc: docs/product/surface-feature-matrix.md:329); it reads results from a browser speech recogniser (apps/extension/src/features/side-panel/voice.ts:218-220).

**Before you start**

- A signed-in account; 18 and over, enforced by an adult-eligibility gate on image and live voice routes (apps/web/app/api/media/image/generate/route.ts:30-40; apps/web/app/api/voice/live/sessions/route.ts:184-193).
- Cloud mode: managed-compute access, organization policy, spend limit and model policy gates pass (apps/web/app/api/media/image/generate/route.ts:44-80).
- Storage and provider keys configured on the server; otherwise availability is reported off (apps/web/lib/server/media-storage.ts:77-93) [inferred].
- Live voice needs microphone permission and WebRTC support in the client (apps/web/features/chat/lib/live-voice-session.ts:447-480).

**Screens and controls**

- Voice call surface labels: 'Share your camera', 'Stop sharing your camera', 'Stop the task', 'Try again', 'Continue in text', 'Upgrade', 'Tap to hear the assistant', 'Do not send that', 'Reconnecting, attempt', 'Continue that session' (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:38-60).
- Image mask drawing: RegionSelector component (apps/web/features/chat/components/RegionSelector.tsx:59).
- Image result card: ImageGenerationCard (apps/web/features/chat/components/ImageGenerationCard.test.tsx names it).

**Journey**

1. Image: the client posts a prompt to /api/media/image/generate with an Idempotency-Key; the server runs gates, reserves credit and returns 202 with a queued job (apps/web/app/api/media/image/lib/managed-image-generation.ts:709-879).
2. The client polls /api/media/image/status; the job is driven by a background queue or by that poll (apps/web/app/api/media/image/lib/image-job-drive-queue.ts:33-55).
3. The finished images appear in the media library with an AI-generated header (apps/web/app/api/media/image/lib/managed-image-generation.ts:961-967).
4. Live voice: the browser creates a WebRTC offer, posts it to /api/voice/live/sessions, receives the provider's answer and talks (apps/web/features/chat/lib/live-voice-session.ts:488-519; apps/web/app/api/voice/live/sessions/route.ts:612-619).
5. The call is billed in one-minute blocks and can be extended or closed through the session routes (apps/web/lib/voice/live-voice-billing.ts:20-28; apps/web/app/api/voice/live/sessions/[sessionId]/extend/route.ts).

**What the person sees and gets**

- Image job statuses: queued then terminal; error text is categorised, for example 'The image provider did not respond before the request deadline. Please try again.' (apps/web/app/api/media/image/lib/image-generation-provider.ts:104-125).
- Mask errors: 'The mask must be a PNG image...', 'The mask needs transparency...', size mismatch text (apps/web/app/api/media/image/lib/edit-mask.ts:90-102).
- Voice: call time, status line, reconnect banner, 'Weekly limit reached' and 'Monthly limit reached' messages (apps/web/features/chat/lib/live-voice-session.ts:261-262).
- Speech route returns audio bytes, or 204 in one branch (apps/web/app/api/voice/speech/route.ts:244-255).

**Settings**

- Voice, language, pace and reasoning level are sent when a live session is created (apps/web/app/api/voice/live/sessions/route.ts:149-166).
- Memory switch for the call: memoryEnabled (apps/web/app/api/voice/live/sessions/route.ts:154).
- Read-aloud device voice is remembered in local browser storage (apps/web/lib/hooks/useTTS.ts:104-110).
- Settings page for voice: apps/web/app/settings/voice/page.test.tsx and apps/web/features/settings/sections/VoiceSection.test.tsx exist.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Image generation and edit adapter for three image providers, with output structure checks for PNG, JPEG and WebP (apps/web/app/api/media/image/lib/image-generation-provider.ts:315-420, 795-830) (S97.01, S97.02).
- Mask validation: PNG, alpha, same size as source (apps/web/app/api/media/image/lib/edit-mask.ts:90-102) (S97.04).
- Durable image jobs with attempts, cancellation, exhaustion and settlement; drive handed to a queue kind 'media-generation.image-attempt' (apps/web/lib/jobs/job-handlers.ts:363; apps/web/app/api/media/image/lib/image-job-drive-queue.ts:33-55) (S97.05).
- Video reconciliation by workflow with 10-second poll, 2-minute provider submission grace, 5 failure limit (apps/web/lib/services/video-job-reconciliation-service.ts:47-51; apps/web/lib/workflows/video-generation-workflow.ts:27-35) (S97.06).
- Completion by signed OpenRouter webhook plus status polling for image and video (apps/web/app/api/media/video/openrouter-webhook/route.ts:40-100; apps/web/app/api/media/video/status/route.ts:75; apps/web/app/api/media/image/status/route.ts) (S97.07).
- Bounded video download: 256 MB cap, mp4, webm and quicktime types (apps/web/lib/services/video-provider-output-service.ts:20-22) (S97.08).
- Private object storage and a media_assets catalogue (apps/web/lib/server/media-storage.ts:248; apps/web/db/neon/0036_media_assets.sql:9) (S97.09).
- AI-generated provenance: claim built per image, embedded in the bytes, stored in asset metadata and sent as response headers (apps/web/lib/compliance/ai-act.ts:58-86; apps/web/app/api/media/image/lib/image-job-executor.ts:755-766; apps/web/lib/server/generated-media-provenance.ts:34-37) (S97.14).
- Transcription: 25 MB cap, MIME and header checks, provider speech-to-text, metered with reserve and settle (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:398-460, 603-810); /api/voice/transcribe wraps it with a dictation kill switch (apps/web/app/api/voice/transcribe/route.ts:29) (S97.16).
- Read-aloud: server speech route (4,000 characters max, metered) and a browser speech fallback in useTTS (apps/web/app/api/voice/speech/route.ts:48-53; apps/web/lib/hooks/useTTS.ts:338-379) (S97.17).
- Live voice broker: posts the browser's WebRTC offer to the provider with instructions, voice, tools and a restricted list of client events, and returns the answer (apps/web/app/api/voice/live/sessions/route.ts:130-148, 555-565) (S97.18, S97.20).
- Voice tools run on the server with approval-policy checks (apps/web/lib/voice/live-voice-tool-runner.ts:100-160) (S97.24).
- Voice sessions persisted in public.voice_sessions with active or closed status, settings and active tools (apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts:119-260; apps/web/db/neon/0260_voice_sessions.sql:27) (S97.28).

**Incomplete**

- Interruption: the client lists a 'response.cancelled' event, but no code in the web or mobile client was found that stops playback on user speech; the provider session may do it itself (apps/web/features/chat/lib/live-voice-session.ts:224). Status stays unverified (S97.23).
- Provenance marking covers images and video bytes; the compliance table itself says audio is unmarked and chat text carries no mark (apps/web/lib/compliance/ai-act.ts:50-56). That table says web ships no audio route, but /api/voice/speech exists (apps/web/app/api/voice/speech/route.ts:196) [inferred: the table text is stale].
- The header of the image job migration says 'NOT YET APPLIED : draft only' (apps/web/db/neon/0226_durable_image_generation_jobs.sql:3); the code uses the table, so the comment may be stale. Applied status: unknown.
- The brief cites generate/route.ts:588 and :703 for edit and mask code, but that file has 128 lines; the logic is in managed-image-generation.ts:534-677 (apps/web/app/api/media/image/generate/route.ts).

**Present but disconnected or switched off**

- Camera frames: VoiceModeSurface has a camera toggle and preview, shown only when an onVisualFrame handler is passed and the host is not the desktop app (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:156, 258, 524). The two VoiceModeSurface uses in WebChatPage.tsx (lines 7665, 7793) showed no such prop in a search, so the control is probably not offered [inferred]. No code was found that sends frames to the live provider session.
- Video generation is Present only on web and the API in the product matrix; desktop, mobile, CLI, vscode and chrome are Absent (doc: docs/product/surface-feature-matrix.md:67).
- Video providers are gated by a release policy (apps/web/app/api/media/video/generate/route.ts:76).

**Not available**

- Image post-processing: resize, upscale, background removal (S97.10); no code found, brief says missing.
- Video transcoding (S97.11) and thumbnails or contact sheets (S97.12): missing.
- Likeness and voice-consent store (S97.15): missing.
- Voice-to-durable-task handoff to AGI Work (S97.25): missing in the brief; the voice runner only has tools and delegation lists.
- Audio and video sync (S97.27), audio overview generator (S97.29), music generation (S97.30): missing.
- Reference-asset manager (S97.03), subtitle generation (S97.13), ephemeral credentials (S97.19), voice activity detection (S97.21), turn-detection coordinator (S97.22): brief says not applicable. For S97.19 the code confirms the design: the server holds the key and relays the SDP answer, so the client gets no key (apps/web/app/api/voice/live/sessions/route.ts:612-619). Turn detection and activity detection are left to the provider session [inferred].

## 4. Required behaviour

**Established requirements**

- A server adapter turns an image prompt into generated images through a real provider and hands them to the media job. (source: S97.01)
- A server adapter edits a source image, with an optional mask, through a provider edit endpoint. (source: S97.02)
- Masks are validated and normalised (size, alpha) before they reach the provider. (source: S97.04)
- Image and video generations run as durable queued jobs that a background worker drives to completion. (source: S97.05)
- Provider-side jobs are polled and reconciled until terminal, with results persisted and failures settled. (source: S97.06)
- Job completion is picked up by provider webhooks and by status polling. (source: S97.07)
- Finished outputs are downloaded (bounded, typed) and written to private object storage catalogued per user. (source: S97.08, S97.09)
- Image outputs are post-processed server side (resize, format, upscale, background removal); videos are transcoded; thumbnails or contact sheets exist. (source: S97.10, S97.11, S97.12)
- Generated media carries provenance metadata (AI-generated, provider, model, time, hash) stored with the asset and served with it. (source: S97.14)
- A store records consent for using a person's likeness or voice. (source: S97.15)
- A server transcription service turns uploaded audio into text, metered per request; a text-to-speech service serves read-aloud and voice replies. (source: S97.16, S97.17)
- A broker creates realtime voice sessions, with live audio over WebRTC; when the user speaks over a reply, playback stops and state stays consistent. (source: S97.18, S97.20, S97.23)
- Voice turns can call product tools under the user's approval policy; a voice request can be handed to a durable task; sessions are persisted so they can be audited and resumed. (source: S97.24, S97.25, S97.28)
- Mic affordance gives dictation or shows exactly why voice is unavailable; if live voice is not v1, the app says unavailable without broken controls. (source: doc: docs/product/requirements.md:910-921)
- Local inference on mobile and desktop is free of any paid subscription; every subscription capability connects to one AGI Subscription system. (source: doc: task product context)

**Acceptance criteria**

1. Posting an image prompt with an Idempotency-Key returns 202 and a queued job; repeating the same key does not create a second job or a second reservation.
2. A mask that is not PNG, has no alpha, or differs in size from the source gets a 422 with code invalid_mask_image and no provider call.
3. A signed webhook with a bad signature gets 401 and a malformed one 400; a good one returns 202 and nudges the video job.
4. A finished image is stored privately, its bytes carry the AI-generated mark, and the file route returns the generated-by headers.
5. An audio file over 25 MB gets 413 and an unsupported type 415.
6. Creating a live voice session for a Free-plan account without allowance, or over a spend cap, returns a refusal and no charge.
7. Closing a live session settles the reserved blocks and sets voice_sessions.status to closed.
8. A voice tool call that needs approval does not run until approved.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local and own-key modes should not call these managed routes; image, video and live voice are Cloud only here [inferred from the managed-compute gates, apps/web/app/api/media/image/generate/route.ts:44-60].
- Interruption handling should be tested on real calls because the code does not show it [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add server post-processing (thumbnail first) so the library does not serve full-size originals as previews.
- [proposed] Mark speech output as AI-generated and fix the stale audio line in the compliance table.
- [proposed] Wire onVisualFrame to a real frame sender or remove the camera control from the surface.
- [proposed] Update the 0226 migration header to say whether it has been applied.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Image provider adapter | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Generate and edit through OpenAI, Google or Stability; error categories; structure checks |
| service | Managed image generation | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Gates, request validation, mask check, reservation, job creation, 202 response |
| service | Image job executor | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Runs an attempt, stores assets, builds provenance, settles or refunds |
| job | Image drive queue | `apps/web/app/api/media/image/lib/image-job-drive-queue.ts` | Enqueues the next attempt with an idempotency key |
| job | Image job drain | `apps/web/app/api/media/image/lib/image-job-drain.ts` | Drives a job from the queue |
| job | Background job handler map | `apps/web/lib/jobs/job-handlers.ts` | Registers media-generation.image-attempt |
| config | drain-background-jobs cron | `vercel.json` | Runs the background job drain every 5 minutes |
| service | Mask validator | `apps/web/app/api/media/image/lib/edit-mask.ts` | PNG, alpha and size checks |
| component | RegionSelector | `apps/web/features/chat/components/RegionSelector.tsx` | Lets the person mark the region to edit |
| endpoint | POST /api/media/image/generate | `apps/web/app/api/media/image/generate/route.ts` | Entry route with csrf, rate limit, age gate and spend gates |
| endpoint | Image status, cancel, retry | `apps/web/app/api/media/image/status/route.ts` | Poll and re-drive a job; sibling cancel and retry routes |
| endpoint | Video generate, status, cancel | `apps/web/app/api/media/video/generate/route.ts` | Starts a video provider task (Google, Runway, OpenRouter) |
| endpoint | OpenRouter video webhook | `apps/web/app/api/media/video/openrouter-webhook/route.ts` | Verifies signature, nudges the job |
| service | Video reconciliation | `apps/web/lib/services/video-job-reconciliation-service.ts` | Poll, store, settle, escalate stalled jobs |
| service | Video provider output | `apps/web/lib/services/video-provider-output-service.ts` | Polls providers and downloads bounded output |
| job | Video workflow | `apps/web/lib/workflows/video-generation-workflow.ts` | Durable workflow loop that sleeps between reconciliations |
| service | Media storage | `apps/web/lib/server/media-storage.ts` | Write, read, stream and delete private media objects |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Per-user catalogue of stored media |
| table | image_generation_jobs and image_generation_job_assets | `apps/web/db/neon/0226_durable_image_generation_jobs.sql` | Durable image jobs and their assets |
| table | video_generation_jobs | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Durable video jobs |
| service | AI-generated provenance | `apps/web/lib/compliance/ai-act.ts` | Claim, header names and serialisation |
| service | Provenance embedding | `apps/web/lib/server/generated-media-provenance.ts` | Embeds claim into image and video bytes |
| endpoint | POST /api/llm/v1/audio/transcriptions and /api/voice/transcribe | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Speech-to-text with metering; transcribe route adds a dictation switch |
| endpoint | POST /api/voice/speech | `apps/web/app/api/voice/speech/route.ts` | Text-to-speech proxy, metered |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Live voice broker; sibling routes close, extend, settings, tools, active |
| store | Voice session store | `apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts` | Reads and writes public.voice_sessions |
| service | Voice tool runner | `apps/web/lib/voice/live-voice-tool-runner.ts` | Runs tools requested by the live voice |
| service | Web live voice client | `apps/web/features/chat/lib/live-voice-session.ts` | WebRTC client, reconnect, error messages |
| hook | useTTS | `apps/web/lib/hooks/useTTS.ts` | Server speech with browser speech fallback |
| service | Mobile live voice client | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | WebRTC client for the phone app |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client posts an image prompt; server checks CSRF, rate limit, sign-in, age gate, managed-compute, organization policy and spend limit. | our servers | apps/web/app/api/media/image/generate/route.ts:30-80 |
| Server validates the source and mask, reserves credit under an idempotency key and writes a queued image job. | our servers | apps/web/app/api/media/image/lib/managed-image-generation.ts:534-879 |
| A queue entry or the client status poll drives the attempt; the provider is called once per attempt. | our servers | apps/web/app/api/media/image/lib/image-job-drive-queue.ts:33-55; apps/web/lib/jobs/job-handlers.ts:363 |
| The image provider generates or edits the image. | outside service | apps/web/app/api/media/image/lib/image-generation-provider.ts:451-470 |
| Server hashes bytes, builds a provenance claim, embeds it, stores the object and settles the reservation. | our servers | apps/web/app/api/media/image/lib/image-job-executor.ts:753-800 |
| Video task is created at the provider; a workflow polls every few seconds or a signed webhook nudges it; output is downloaded and stored. | device and our servers | apps/web/lib/workflows/video-generation-workflow.ts:27-35; apps/web/app/api/media/video/openrouter-webhook/route.ts:85 |
| Audio upload is checked and sent to the transcription provider; the bytes are dropped after, nothing stores them. | our servers | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:467,722 |
| Browser creates a WebRTC offer; server forwards it to the live voice provider with instructions and tools, records a voice_sessions row, returns the answer; audio then flows browser to provider directly. | device and our servers | apps/web/app/api/voice/live/sessions/route.ts:555-731; apps/web/features/chat/lib/live-voice-session.ts:488-519 |
| Voice tool calls come back to our server for approval-checked execution. | our servers | apps/web/lib/voice/live-voice-tool-runner.ts:128; apps/web/app/api/voice/live/sessions/[sessionId]/tools/route.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated images and video bytes | Private object storage, catalogued in media_assets | Served per user through the authenticated file route | Soft delete then purge by the purge-deleted-media cron (vercel.json:82) |
| Image and video job rows | image_generation_jobs, image_generation_job_assets, video_generation_jobs | Server only | unknown |
| Voice session record: voice, language, pace, active tools, status | public.voice_sessions | Server only; web may resume an open session | Closed or superseded; retention unknown |
| Uploaded dictation audio | Not stored | No | Dropped after the provider call (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:467) |
| Provenance claim | Embedded in image bytes and in asset metadata aiAct | Travels with the file | Kept with the asset |

**Models and providers.** The live voice, speech and transcription models are chosen by routing slots, not by the person (apps/web/app/api/voice/live/sessions/route.ts:177-183; apps/web/app/api/voice/speech/route.ts:102). Speech and transcription currently require OpenAI models (apps/web/app/api/voice/speech/route.ts:103; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:500). Image providers are OpenAI, Google and Stability; video providers are Google, Runway and OpenRouter. A backend model is chosen by plan for live voice tool work (apps/web/app/api/voice/live/sessions/route.ts:540-560).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on all routes; image and live voice also need the adult-eligibility gate (apps/web/app/api/media/image/generate/route.ts:30-40; apps/web/app/api/voice/live/sessions/route.ts:184-193). Transcription also accepts an API key with inference:write scope (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:297). |
| Permissions | Workspace policy, web-domain policy for voice fetch, tool approval policy for voice tools (apps/web/app/api/voice/live/sessions/route.ts:62-70, 118-125). Microphone permission on the client. |
| Subscription | Image routes check the canUseImages capability (apps/web/app/api/media/image/generate/route.ts:100-110) and managed compute access. Live voice checks entitlements and tier unit quota (apps/web/app/api/voice/live/sessions/route.ts:50-58). Free plans get a monthly voice-seconds allowance from the tier policy (apps/web/lib/voice/free-voice-allowance.ts:47-52). |
| Limits and metering | Image: reservation per job, rate limit 'image-generation'. Transcription: reserve and settle by tokens or duration, 25 MB cap, rate limit 'audio-transcription'. Speech: 4,000 characters, rate limit 'voice-speech'. Live voice: one-minute billing blocks and a 10-minute lease (apps/web/lib/voice/live-voice-billing.ts:20-28). Values are in code constants; plan numbers come from the tier policy. |
| Feature flags | Dictation kill switch DICTATION_CAPABILITY (apps/web/lib/feature-flags/kill-switches.ts:33); canUseImages capability; video provider release policy (apps/web/lib/server/video-provider-release-policy.ts); OPENROUTER_WEBHOOK_SECRET env var name for the webhook (apps/web/app/api/media/video/openrouter-webhook/route.ts:41). |
| Model compatibility | Speech and transcription slots must resolve to live OpenAI models or the route throws or refuses (apps/web/app/api/voice/speech/route.ts:103; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:500). Live voice slot must resolve to a live managed provider (apps/web/app/api/voice/live/sessions/route.ts:177-183). |
| Provider restrictions | A privacy setting that keeps content away from providers that may train blocks transcription, speech and live voice with a 403 (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:506-516; apps/web/app/api/voice/speech/route.ts:106-111). Only Runway has a verified video cancel operation (apps/web/lib/services/video-provider-output-service.ts:314). Some regions are blocked on transcription with 451 (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:276-285). |
| Local mode | These server routes are Cloud only. In Local mode no image, video or live voice route is used. Browser speech is a no-server fallback for read-aloud (apps/web/lib/hooks/useTTS.ts:338-379); mobile read-aloud uses the device speech engine (apps/mobile/src/features/voice/services/tts.ts:1); the CLI can use a local whisper binary (apps/cli/src/voice.rs:1-9). Whether these need sign-in is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Provider failure on image | Error is categorised into plain text; the job fails and the reservation is released or refunded. | apps/web/app/api/media/image/lib/image-generation-provider.ts:104-125; apps/web/app/api/media/image/lib/image-job-executor.ts:137-160 |
| Cancel | Cancel requested marks the job; a racing settle happens once. | apps/web/app/api/media/image/lib/image-job-executor.ts:210-232 |
| Attempts exhausted | Job is failed and settled as attempts_exhausted. | apps/web/app/api/media/image/lib/image-job-executor.ts:243-267 |
| Queue refuses the handoff | Error is logged; the client status poll re-drives the job. | apps/web/app/api/media/image/lib/image-job-drive-queue.ts:48-54 |
| Webhook before task attached | Logged as not_found; polling still completes the job. | apps/web/app/api/media/video/openrouter-webhook/route.ts:85-100 |
| Provider outcome unknown for video | Job is marked outcome unknown instead of guessed. | apps/web/lib/services/video-job-reconciliation-service.ts:56,710 |
| Live voice connection drops | Client announces 'The voice connection dropped. Reconnecting.' and retries; failure text 'The voice connection could not be restored.' | apps/web/features/chat/lib/live-voice-session.ts:67-68, 908-915 |
| Session not saved | Returns 503, reservation released, nothing charged. | apps/web/app/api/voice/live/sessions/route.ts:700-712 |
| Provider rejects function tools | Retries once with hosted tools only. | apps/web/app/api/voice/live/sessions/route.ts:583-596 |
| Playback blocked by browser | Shows 'Tap to hear the assistant'. | apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:44-45 |
| Offline for dictation or image | not handled in the code found in the server routes; client offline behaviour unknown. | not handled in the code |
| Accessibility | Camera preview and call time have aria-labels. | apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:550,575 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/media/route.test.ts`: Media listing route
- `apps/web/app/api/media/jobs/__tests__/route.test.ts`: Media jobs route
- `apps/web/app/api/media/keep/__tests__/route.test.ts`: Keep route
- `apps/web/app/api/media/availability/route.test.ts`: Media availability
- `apps/web/app/api/media/image/lib/image-generation-provider.workspace-scope.test.ts`: Source image resolution inside workspace scope
- `apps/web/app/api/media/video/openrouter-webhook/route.test.ts`: Webhook verification and dispositions
- `apps/web/lib/services/video-job-reconciliation-service.test.ts`: Video reconciliation
- `apps/web/lib/services/video-provider-output-service.test.ts`: Provider polling and download
- `apps/web/lib/workflows/video-generation-workflow.test.ts`: Video workflow loop
- `apps/web/lib/server/generated-media-provenance.test.ts`: Provenance embedding
- `apps/web/lib/server/media-storage.test.ts`: Media storage
- `apps/web/lib/server/__tests__/media-image-jobs.test.ts`: Image job rows
- `apps/web/app/api/llm/v1/audio/transcriptions/route.test.ts`: Transcription route
- `apps/web/app/api/voice/speech/__tests__/route.test.ts`: Speech route
- `apps/web/app/api/voice/transcribe/__tests__/route.kill-switch.test.ts`: Dictation kill switch
- `apps/web/app/api/voice/live/sessions/route.test.ts`: Live session creation
- `apps/web/app/api/voice/live/sessions/lib/__tests__/voice-session-store.test.ts`: Session store
- `apps/web/lib/voice/__tests__/live-voice-tool-runner.approval-parity.test.ts`: Voice tool approval parity
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Web live voice client
- `apps/web/lib/hooks/useTTS.test.ts`: Read-aloud hook

**Test scenarios**

- **Image edit with a bad mask**
  1. Post an edit request with a JPEG mask
  2. Post again with a PNG without alpha
  3. Post again with a PNG of a different size
  - Expected: Each returns 422 invalid_mask_image with the matching message; no provider call and no charge.
- **Idempotent image job**
  1. Post a prompt with an Idempotency-Key
  2. Post it again with the same key
  3. Poll status until terminal
  - Expected: One job, one reservation; the finished image is stored and has the AI-generated header.
- **Video webhook**
  1. Start a video job on OpenRouter
  2. Send a webhook with a bad signature
  3. Send a good one
  - Expected: 401 then 202; the job reaches terminal and the file is stored.
- **Dictation limits**
  1. Upload 26 MB of audio
  2. Upload a file with a wrong header
  3. Upload valid audio
  - Expected: 413, then 415 or 400, then text returned and usage settled.
- **Live voice call lifecycle**
  1. Start a call on web
  2. Drop the network
  3. Restore it
  4. Close the call
  - Expected: Reconnect message shows, call resumes or fails with the restore message; closing sets voice_sessions.status closed and settles blocks.
- **Barge-in on a real call**
  1. Start a call
  2. Speak while the assistant replies
  - Expected: Playback stops and the reply is cut short. This is the unverified item S97.23; record the result.

**Where to look when it fails**

- Log events live_voice_session_rejected, live_voice_function_tools_rejected, voice_session_not_persisted, voice_session_expiry_failed (apps/web/app/api/voice/live/sessions/route.ts).
- Log 'Image job drive could not be queued' and event image_refund_settlement_unrecorded (apps/web/app/api/media/image/lib/image-job-drive-queue.ts:50; apps/web/app/api/media/image/lib/image-job-executor.ts:158).
- Error name GeneratedMediaProvenanceError (apps/web/lib/server/generated-media-provenance.ts:12).
- Tables image_generation_jobs, video_generation_jobs, media_assets, voice_sessions.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No server post-processing, transcoding, thumbnails or contact sheets** Affects: Web and API users of generated media; originals are served as is. Evidence: Brief S97.10 to S97.12 say missing; no code found. Work needed: Add a media processing step after storage and catalogue renditions.
- **No likeness or voice-consent store** Affects: Any future voice cloning or likeness feature. Evidence: Brief S97.15 says missing. Work needed: Design consent records before such a feature ships.
- **No hand-off from a voice request to a durable AGI Work task** Affects: Web and mobile live voice users. Evidence: Brief S97.25 says missing. Work needed: Add a voice tool that creates a durable task and reports back.
- **Barge-in behaviour unverified; no client code found that stops playback** Affects: Web and mobile live voice. Evidence: apps/web/features/chat/lib/live-voice-session.ts:224; brief S97.23. Work needed: Test on real calls; add client handling if the provider does not do it.
- **Camera frames toggle exists but no sender found and no caller passes the handler** Affects: Web live voice. Evidence: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:156,524; apps/web/features/chat/pages/WebChatPage.tsx:7665. Work needed: Wire frames to the session or remove the control.
- **Speech output is not marked as AI-generated and the compliance table says no audio route exists** Affects: Read-aloud users on web and mobile. Evidence: apps/web/lib/compliance/ai-act.ts:50-56; apps/web/app/api/voice/speech/route.ts:196. Work needed: Mark audio and correct the table.
- **Video generation present only on web and API; other apps absent** Affects: Desktop, mobile, CLI, VS Code, Chrome. Evidence: docs/product/surface-feature-matrix.md:67. Work needed: Decide per app and wire or declare unavailable.
- **Audio overview and music generation do not exist** Affects: All apps. Evidence: Brief S97.29, S97.30. Work needed: Product decision first; then adapters.

**Depends on**

- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-data-model-and-migrations
- surface:web
- surface:mobile
- surface:desktop
- surface:cli
- mode:cloud
- provider:openai
- provider:google
- provider:openrouter
- file:apps/web/app/api/media/image/lib/managed-image-generation.ts
- file:apps/web/app/api/voice/live/sessions/route.ts

## Unknown

- Whether migration 0226 is applied in production; its header says draft only.
- Whether the live voice provider itself stops playback on user speech (S97.23).
- Whether any caller passes onVisualFrame in production, and whether frames reach the provider.
- Retention period for image, video and voice_sessions rows.
- Whether Local mode dictation or read-aloud needs sign-in on mobile and desktop.
- Mobile and desktop use of image and video routes: not checked beyond the product matrix.
- Which video cron or workflow trigger runs reconcileDueVideoGenerationJobs; no cron path for video was found in vercel.json.
