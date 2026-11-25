# Area 97. Media and realtime components

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S97.01 Image-generation adapter.
- Should: A server adapter turns an image prompt into generated images through a real provider and hands them to the media job.
- Status: platform done
- Code: apps/web/app/api/media/image/lib/image-generation-provider.ts:811; apps/web/app/api/media/image/lib/image-job-executor.ts:582; apps/web/db/neon/0226_durable_image_generation_jobs.sql:32

## S97.02 Image-editing adapter.
- Should: A server adapter edits a source image (with an optional mask) through a provider edit endpoint.
- Status: platform done
- Code: apps/web/app/api/media/image/lib/image-generation-provider.ts:455; apps/web/app/api/media/image/generate/route.ts:588

## S97.03 Reference-asset manager.
- Should: Reference assets (library images) are stored, listed and resolved as inputs that guide new generations.
- Status: not applicable anywhere

## S97.04 Mask-processing service.
- Should: Masks for inpaint/outpaint are validated and normalised (size, alpha) before they reach the provider.
- Status: platform done
- Code: apps/web/app/api/media/image/generate/route.ts:703; apps/web/app/api/media/image/lib/edit-mask.ts:90; apps/web/features/chat/components/RegionSelector.tsx:59

## S97.05 Media-job queue.
- Should: Image and video generations run as durable queued jobs that a background worker drives to completion.
- Status: platform done
- Code: apps/web/app/api/media/image/lib/image-job-drive-queue.ts:33; apps/web/lib/jobs/job-handlers.ts:172; vercel.json:109; apps/web/db/neon/0105_durable_video_generation_jobs.sql:74

## S97.06 Provider-job reconciliation.
- Should: Provider-side jobs are polled and reconciled until terminal, with results persisted and failures settled.
- Status: platform done
- Code: apps/web/lib/services/video-job-reconciliation-service.ts:470; apps/web/lib/workflows/video-generation-workflow.ts:27; apps/web/db/neon/0105_durable_video_generation_jobs.sql:74

## S97.07 Polling/webhook completion handler.
- Should: Job completion is picked up by provider webhooks and by status polling.
- Status: platform done
- Code: apps/web/app/api/media/video/openrouter-webhook/route.ts:85; apps/web/app/api/media/video/status/route.ts:301; apps/web/app/api/media/image/status/route.ts:79

## S97.08 Generated-asset downloader.
- Should: Finished provider outputs are downloaded (bounded, typed) and staged for storage.
- Status: platform done
- Code: apps/web/lib/services/video-provider-output-service.ts:522; apps/web/lib/services/video-job-reconciliation-service.ts:215

## S97.09 Media object storage.
- Should: Generated media bytes are written to private object storage and catalogued per user.
- Status: platform done
- Code: apps/web/lib/server/media-storage.ts:238; apps/web/app/api/media/image/lib/image-job-executor.ts:421; apps/web/db/neon/0036_media_assets.sql:9

## S97.10 Image postprocessing.
- Should: Generated images are post-processed on the server (resize, format/compression, upscale, background removal).
- Status: platform missing

## S97.11 Video transcoding.
- Should: Videos are transcoded server-side into standard formats/renditions.
- Status: platform missing

## S97.12 Thumbnail/contact-sheet generation.
- Should: Thumbnails or contact sheets are generated for images and videos.
- Status: platform missing

## S97.13 Subtitle/transcript generation.
- Should: Media gets a generated transcript or timed subtitles (SRT/VTT).
- Status: not applicable anywhere

## S97.14 Provenance metadata service.
- Should: Generated media carries provenance metadata (AI-generated, provider, model, time, hash) stored with the asset and served with it.
- Status: platform done
- Code: apps/web/lib/compliance/ai-act.ts:58; apps/web/app/api/media/image/lib/image-job-executor.ts:696; apps/web/app/api/media/image/lib/image-job-executor.ts:435; apps/web/app/api/files/[id]/route.ts:115

## S97.15 Likeness/voice-consent store.
- Should: A store records consent for using a person's likeness or voice (e.g. voice cloning).
- Status: platform missing

## S97.16 Audio transcription service.
- Should: A server transcription service turns uploaded audio into text through a provider speech-to-text model, metered per request.
- Status: platform done
- Code: apps/web/app/api/llm/v1/audio/transcriptions/route.ts:588; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:693; apps/web/app/api/voice/transcribe/route.ts:29

## S97.17 Text-to-speech service.
- Should: A text-to-speech service turns text into spoken audio for read-aloud and voice replies.
- Status: platform done
- Code: apps/web/lib/hooks/useTTS.ts:50; apps/web/lib/hooks/useTTS.ts:326; apps/web/app/api/voice/speech/route.ts:53

## S97.18 Realtime session broker.
- Should: A server broker creates realtime voice sessions with the provider, applies instructions/tools/voice, and returns the session to the client.
- Status: platform done
- Code: apps/web/app/api/voice/live/sessions/route.ts:330; apps/web/app/api/voice/live/sessions/route.ts:482; apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts:133

## S97.19 Ephemeral credential service.
- Should: Clients receive short-lived credentials to connect to realtime providers without holding a long-lived key.
- Status: not applicable anywhere

## S97.20 Audio transport.
- Should: Live audio flows between the user device and the realtime model over a media transport (WebRTC).
- Status: platform done
- Code: apps/web/features/chat/lib/live-voice-session.ts:277; apps/web/app/api/voice/live/sessions/route.ts:355; apps/mobile/src/features/voice/services/liveVoiceSession.ts:187

## S97.21 Voice activity detection.
- Should: Voice activity (speech start and end) is detected, with tunable sensitivity where needed.
- Status: not applicable anywhere

## S97.22 Turn-detection coordinator.
- Should: A coordinator decides when the user's turn ends and the assistant's begins, and records the turns.
- Status: not applicable anywhere

## S97.23 Playback/interruption coordinator.
- Should: When the user speaks over a reply, playback stops and the reply is cut short, with state kept consistent.
- Status: platform unverified

## S97.24 Voice-to-tool bridge.
- Should: Voice turns can call product tools and return the results into the spoken conversation, under the user's approval policy.
- Status: platform done
- Code: apps/web/lib/voice/live-voice-tool-runner.ts:128

## S97.25 Voice-to-durable-task handoff.
- Should: A voice request can be handed off to a durable background task (AGI Work) that continues after the call.
- Status: platform missing

## S97.26 Visual-frame ingestion.
- Should: Camera or screen frames are captured and delivered to the realtime model during a voice session.
- Status: not applicable anywhere

## S97.27 Audio/video synchronization.
- Should: Audio and video streams are kept in sync (muxing, offset correction, lip sync).
- Status: platform missing

## S97.28 Voice session persistence.
- Should: Voice sessions are persisted with their settings and status so they can be audited and resumed.
- Status: platform done
- Code: apps/web/features/chat/hooks/use-voice-session.ts:210; apps/web/features/chat/hooks/use-voice-session.ts:566; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:287

## S97.29 Audio overview generator.
- Should: A generator turns sources into a spoken audio overview (podcast-style).
- Status: platform missing

## S97.30 Music-generation adapter.
- Should: An adapter generates music through a provider.
- Status: platform missing
