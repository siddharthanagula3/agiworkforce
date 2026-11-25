---
id: "AREA-050"
type: "area"
title: "Audio overviews, speech generation, and music"
features: ["F050-01", "F050-02", "F050-03", "F050-04", "F050-05", "F050-06", "F050-07", "F050-08", "F050-09", "F050-10", "F050-11", "F050-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 50. Audio overviews, speech generation, and music

A person can have an assistant reply read aloud. Only the read-aloud part exists in code: it is done on web, desktop and mobile, and missing on the CLI, VS Code extension and Chrome extension. Everything else in the brief (audio overviews, music generation, voice cloning) has no feature code in the repository. Read-aloud lets a person listen while doing something else, and makes the app usable for people who cannot easily read the screen.

**Who uses it.** Every signed-in user on web and mobile can use read-aloud on a reply. Server-generated speech runs through a signed-in, managed (Cloud) route that checks age, plan/access and privacy settings (apps/web/app/api/voice/speech/route.ts:78-120). Local and own-key (BYOK) replies cannot be read aloud on web (apps/web/lib/read-aloud-policy.ts:16-30). The brief lists no paid-only rule for speech; the plan rule lives in lib modules I did not open (see not_sure). Workspace admins and developers have no separate speech surface that I found.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F050-01](F050-01-read-aloud-a-reply.md) | Read aloud a reply | built | built | built | no | no | built |
| [F050-02](F050-02-voice-language-and-speed-for-playback.md) | Voice, language and speed for playback | built | built | built | no | no | built |
| [F050-03](F050-03-download-generated-speech.md) | Download generated speech | n/a | n/a | n/a | n/a | n/a | n/a |
| [F050-04](F050-04-audio-overview-from-sources.md) | Audio overview from sources | no | no | no | no | no | no |
| [F050-05](F050-05-overview-transcript-and-source-links.md) | Overview transcript and source links | no | no | no | no | no | no |
| [F050-06](F050-06-interrupt-an-overview.md) | Interrupt an overview | no | no | no | no | no | no |
| [F050-07](F050-07-music-generation-and-style.md) | Music generation and style | no | no | no | no | no | no |
| [F050-08](F050-08-lyrics-song-structure-and-length.md) | Lyrics, song structure and length | no | no | no | no | no | no |
| [F050-09](F050-09-music-templates-and-remix.md) | Music templates and remix | no | no | no | no | no | no |
| [F050-10](F050-10-track-output-cover-art-metadata-playback-sharing.md) | Track output: cover art, metadata, playback, sharing | no | no | no | no | no | no |
| [F050-11](F050-11-music-service-playback.md) | Music-service playback | no | no | no | no | no | no |
| [F050-12](F050-12-custom-voices-and-voice-consent.md) | Custom voices and voice consent | no | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md).

## How this area works in the code

1. **Person taps Read aloud on a reply.** Web: the message list toggles speech for one message and passes a check that the message is still eligible (ChatMessageList.tsx:1785-1791). The web button is disabled for Local or own-key replies (MessageBubble.tsx:3981). Mobile: the handler checks the speech owner, then starts speech with the saved voice settings and server mode for Cloud (apps/mobile/src/features/chat/components/MessageBubble.tsx:2002-2023). (`apps/web/features/chat/components/messages/ChatMessageList.tsx:1234`, `apps/web/features/chat/components/messages/ChatMessageList.tsx:1785-1791`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3981`, `apps/mobile/src/features/chat/components/MessageBubble.tsx:2002-2023`)
2. **Clean the text.** Markdown is stripped so the voice does not read symbols or raw code. Empty text stops here. (`apps/web/lib/hooks/useTTS.ts:116-139`, `apps/web/lib/hooks/useTTS.ts:424-425`)
3. **Split and request audio (web).** Text longer than 3,800 characters is cut at a sentence or line break. Each chunk is posted to the speech route with the speed and an Idempotency-Key header. The request uses the signed-in session; if there is no session, the browser voice is used instead. (`apps/web/lib/hooks/useTTS.ts:10-11`, `apps/web/lib/hooks/useTTS.ts:27-39`, `apps/web/lib/hooks/useTTS.ts:41-66`, `apps/web/lib/hooks/useTTS.ts:433-439`)
4. **Server checks before any provider call.** The route checks, in order: CSRF token, per-user rate limit, age gate, managed-compute gate, request shape (up to 4,000 characters), that the speech model slot is a live speech model, that the privacy setting allows this provider, and the model policy gate. (`apps/web/app/api/voice/speech/route.ts:71-120`, `apps/web/lib/rate-limit.ts:404-408`, `apps/web/app/api/voice/speech/route.ts:52-56`)
5. **Estimate cost and reserve usage.** Cost is estimated from character count and the model's price. The route checks the account's access and reserves usage under the Idempotency-Key, so a retry does not charge twice. A quota or access failure returns an error body. (`apps/web/app/api/voice/speech/route.ts:122-132`, `apps/web/app/api/voice/speech/route.ts:134-165`)
6. **Call the speech provider and settle usage.** The server calls the provider's speech endpoint with the server key and a 60-second timeout. On failure, the reservation is released and an error is returned. On success, usage is finalized, delivery is marked, and the audio is returned as audio/mpeg with no-store caching. (`apps/web/app/api/voice/speech/route.ts:191-212`, `apps/web/app/api/voice/speech/route.ts:213-221`, `apps/web/app/api/voice/speech/route.ts:223-240`)
7. **Decode and play in the browser (web).** The browser resumes its audio context, decodes each chunk, and plays chunks one after another. If the first chunk cannot be fetched or decoded, the device voice speaks the text. If a later chunk fails, the person sees the playback error. (`apps/web/lib/hooks/useTTS.ts:444-494`, `apps/web/lib/hooks/useTTS.ts:466-471`)
8. **Device voice fallback (web).** The browser's own speech engine speaks with the chosen backup voice and speed. Starting a new device utterance cancels only the one this hook owns. (`apps/web/lib/hooks/useTTS.ts:335-386`, `apps/web/lib/hooks/useTTS.ts:355-357`)
9. **Mobile: device or server speech.** In Cloud mode, the text is split into 3,800-character chunks and fetched from the same speech route with a read-aloud Idempotency-Key. Each chunk is saved to a temporary file, played, then deleted. In Local mode, or after a server failure, the phone's voice speaks in 500-character chunks. (`apps/mobile/src/features/voice/services/voiceOutput.ts:114-141`, `apps/mobile/src/features/voice/services/voiceOutput.ts:149-157`, `apps/mobile/src/features/voice/services/serverSpeech.ts:40-63`, `apps/mobile/src/features/voice/services/serverSpeech.ts:65-100`, `apps/mobile/src/features/voice/services/tts.ts:52-118`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/hooks/useTTS.ts` | Web read-aloud hook: strips Markdown, sends text to the speech route, plays chunks, falls back to the browser voice, stores the backup voice choice. |
| `apps/web/app/api/voice/speech/route.ts` | Server speech endpoint: age, plan/access, privacy and rate checks, usage reservation and settlement, and the provider call. |
| `apps/web/shared/stores/web-settings-store.ts` | Defines the three voice speed levels and their rates (lines 41-50) and the voiceSpeed setting. |
| `apps/web/features/settings/sections/GeneralSection.tsx` | Web settings rows for speed and backup voice (VoiceSpeedRow at 733, ReadAloudVoiceRow at 808). |
| `apps/web/lib/read-aloud-policy.ts` | Decides which messages may be read aloud (not Local or own-key replies) and gives the reason text. |
| `apps/web/lib/voice/speech-voices.ts` | The fixed list of server voices and the default voice. |
| `apps/web/lib/rate-limit.ts` | Holds the voice-speech rate limit (30 per minute, fail closed). |
| `apps/mobile/src/features/voice/services/voiceOutput.ts` | Mobile owner of one speech operation: picks Cloud server speech or device speech, with stop and account-change handling. |
| `apps/mobile/src/features/voice/services/serverSpeech.ts` | Mobile client for the speech route: fetches chunks, plays them from a temporary file, deletes the file. |
| `apps/mobile/src/features/voice/services/tts.ts` | Mobile device speech through the expo-speech library, plus the voice list and locale lookup. |
| `apps/mobile/src/features/voice/services/speechSettings.ts` | Reads mobile speech voice, speed, pitch and language for every speaking surface. |
| `apps/desktop/src/hooks/useTTS.ts` | Desktop read-aloud hook using native speech commands (only the header was read). |
| `packages/ai/model-registry/catalog/routing-policies.json` | Routing slot voice_speech (lines 919-921) that names which speech model the route uses; the live model ID is not written here. |

## What is stored

- Backup read-aloud voice ID (web): Browser localStorage, key 'agi:tts-voice-uri' (apps/web/lib/hooks/useTTS.ts:100, 110, 244-247).
- Web speed level (slow/normal/fast): Web settings store (apps/web/shared/stores/web-settings-store.ts:56, 122, 144); synced to the account by apps/web/features/settings/components/CloudSettingsSync.tsx:78, 109.
- Mobile speech voice, speed and pitch: Mobile settings store, read in apps/mobile/src/features/voice/services/speechSettings.ts:48-56; language is kept per trust domain (Local vs Cloud).
- Usage record for each speech request (cost estimate, outcome, idempotency key): Managed usage request service, called from apps/web/app/api/voice/speech/route.ts:155-186. The database table name was not traced.
- Text of the reply: Sent to the speech provider through the route (route.ts:191-212). The route code does not store it; retention on the provider side is not established.
- Audio on mobile: Temporary .mp3 in the app cache folder, deleted after playback (apps/mobile/src/features/voice/services/serverSpeech.ts:66, 79).
- Audio on web: Held in memory only while playing (apps/web/lib/hooks/useTTS.ts:61, 474-483). Response sent with Cache-Control no-store (route.ts end).

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Read-aloud per message (privacy)**: Local and own-key replies cannot be read aloud on web. (apps/web/lib/read-aloud-policy.ts:16-30; used by apps/web/features/chat/components/messages/ChatMessageList.tsx:860.)
- **Voice-speech rate limit**: 30 speech requests per minute per user; blocks when the limit store fails. (apps/web/lib/rate-limit.ts:404-408; applied at apps/web/app/api/voice/speech/route.ts:74.)
- **Age gate for speech**: Blocks speech for users who fail the adult eligibility check. (apps/web/app/api/voice/speech/route.ts:78-84.)
- **Managed compute gate (feature 'audio_speech')**: Blocks managed speech when the plan or access rule says no. (apps/web/app/api/voice/speech/route.ts:86-91 and 144-154. The rule itself is in lib modules not opened.)
- **Training-provider privacy setting**: Blocks speech when the user's privacy setting keeps content from providers that may train on it. (apps/web/app/api/voice/speech/route.ts:106-113.)
- **voice_speech model slot**: Chooses the speech model; the route refuses unless it is a live speech model. (packages/ai/model-registry/catalog/routing-policies.json:919-921; check at apps/web/app/api/voice/speech/route.ts:102-105.)
- **Speed setting (web)**: Changes playback rate of server and device speech. (apps/web/shared/stores/web-settings-store.ts:46-50; read at apps/web/lib/hooks/useTTS.ts:355, 442.)
- **Speed and pitch (mobile)**: Changes the rate and pitch sent to the device or server speech. (apps/mobile/src/features/voice/services/speechSettings.ts:48-56; slider in apps/mobile/src/features/settings/voice/index.tsx:322, 441.)
- **Cloud vs Local speech path (mobile)**: Server speech only in Cloud mode; Local uses the phone voice. (apps/mobile/src/features/chat/components/MessageBubble.tsx:2020 and apps/mobile/src/features/voice/services/voiceOutput.ts:131.)
- **Android voice check (mobile)**: Shows 'No speech voice is installed' when the device has no voice. (apps/mobile/src/features/voice/services/readAloudAvailability.ts:36-38.)

## Shared between apps

Shared across apps: the speech model slot and voice names are in the model catalog (packages/contracts/types/src/model-catalog.ts, voice_speech entries) and the routing catalog. The speech HTTP route exists only in apps/web and is called by web and mobile. Separate per app: web playback hook (apps/web/lib/hooks/useTTS.ts), desktop playback hook (apps/desktop/src/hooks/useTTS.ts, native commands via apps/desktop/src/api/voice.ts), mobile playback (apps/mobile/src/features/voice/services/*), each with its own settings UI. Duplicated code: the Markdown stripping function appears in both apps/web/lib/hooks/useTTS.ts:116-139 and apps/desktop/src/hooks/useTTS.ts:12-30. No speech code was found in apps/cli or apps/extension-vscode.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief's web code references point to the wrong lines. MessageBubble.tsx:3049 is an attachment button, not read-aloud (read-aloud control is at :3981). ChatMessageList.tsx:1596 is scroll code (read-aloud hook is at :1234). (apps/web/features/chat/components/messages/MessageBubble.tsx:3049; apps/web/features/chat/components/messages/ChatMessageList.tsx:1596)
- Brief's settings references are stale. GeneralSection.tsx:1349 and :1266 are not the voice rows; the voice rows are at :733 and :808. Mobile voice-language index.tsx:168 is a press target inside a list, not the language chooser. (apps/web/features/settings/sections/GeneralSection.tsx:733, 808; apps/mobile/src/features/settings/voice-language/index.tsx:168)
- Brief S50.02 says the user can choose the voice used for playback. On web the client sends only text and speed, so the server voice is never chosen by the person; the server accepts a voice but the client never sends one. The web picker only sets a backup device voice. (apps/web/lib/hooks/useTTS.ts:48-59; apps/web/app/api/voice/speech/route.ts:54, 122; apps/web/features/settings/sections/GeneralSection.tsx:823-828)
- Web has no language choice for playback; language follows the picked device voice. (apps/web/lib/hooks/useTTS.ts:360-362)
- Brief says an assistant reply can be played aloud. On web, Local and own-key replies are blocked by policy, and the button is disabled with a reason. (apps/web/lib/read-aloud-policy.ts:16-30; apps/web/features/chat/components/messages/MessageBubble.tsx:3981)
- If the speech model is not live, the route throws a plain Error instead of returning a JSON error body, so the client sees a server error. (apps/web/app/api/voice/speech/route.ts:102-105)
- The desktop and web hooks duplicate the same Markdown stripping code. (apps/web/lib/hooks/useTTS.ts:116-139; apps/desktop/src/hooks/useTTS.ts:12-30)
- Brief lists the API as missing for S50.01-S50.03 and S50.05-S50.32, but there is no separate API app in apps/; the speech route is the only server surface and its status is not stated in the brief. (apps/web/app/api/voice/speech/route.ts)

## Not established

- Desktop read-aloud behaviour was not traced past the first 30 lines of apps/desktop/src/hooks/useTTS.ts and apps/desktop/src/features/settings/VoiceSettings.tsx; the brief's 'done' status is taken as given.
- The plan or subscription rule behind the 'audio_speech' managed-compute gate (lib/services/managed-compute-access, lib/managed-compute-gate) was not opened, so I cannot say which plans may use read-aloud.
- Route line numbers after route.ts:150 were counted by hand from a sed output; check them before relying on exact lines.
- The Chrome extension was not searched: my search path for it (apps/extension-chrome) does not exist; the real folder is apps/extension and was not checked for speech code.
- Overview, music, voice-cloning and transcript features: a keyword search of apps, packages and services found only unrelated matches (library, connectors, prompts). Not every match was opened.
- Database table names and retention for managed usage records were not traced.
- Mobile speech language and pitch screens (apps/mobile/src/features/settings/voice/index.tsx) were not read in full; only the speed slider lines were checked.
- I did not run anything (builds, tests or servers), per the task's read-only rule, so no behaviour was observed live. All statements come from reading the code.
