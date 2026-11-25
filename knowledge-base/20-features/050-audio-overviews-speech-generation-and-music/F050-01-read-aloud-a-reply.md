---
id: "F050-01"
type: "feature"
title: "Read aloud a reply"
aliases: ["Read aloud", "Read message aloud", "Stop reading message", "Stop reading aloud", "Stop reading", "Read-aloud", "Text-to-speech playback", "TTS", "Speak Assistant Replies (desktop auto-speak)", "S50.01", "voice_speech routing slot (server voice)"]
area: "50 Audio overviews, speech generation, and music"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.01"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:local", "mode:cloud", "mode:own-key", "provider:openai", "api:POST /api/voice/speech", "file:apps/web/lib/hooks/useTTS.ts", "file:apps/web/lib/read-aloud-policy.ts", "file:apps/mobile/src/features/voice/services/voiceOutput.ts", "store:localStorage agi:tts-voice-uri", "store:chrome.storage.local agi_read_aloud", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-model-catalog-and-routing", "SYS-local-inference", "F050-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-01 Read aloud a reply

Read aloud plays an assistant reply as speech. Web and mobile use the AGI server voice when signed in to Cloud and fall back to the device voice. Chrome extension, internal Tauri desktop and Local mode use the device voice. CLI and VS Code have none. The brief wrongly lists Chrome as missing.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.01](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5001).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns the text of one assistant reply into sound. It cleans the text, picks a voice engine, plays it, and lets the person stop it. Web and mobile can use a managed server voice (OpenAI-style speech endpoint behind /api/voice/speech) or the voice built into the browser, phone or operating system. (apps/web/lib/hooks/useTTS.ts:411-511; apps/mobile/src/features/voice/services/voiceOutput.ts:124-157)

**Why it exists.** People listen to answers while walking, cooking, driving or when reading is hard. The product guidance lists read aloud as a standard message action next to copy, retry and feedback. (doc: docs/product/experience-contract.md:400-410; doc: docs/product/competitive-guidance.md:286)

**Who uses it.** Any signed-in or local user of Web, the public Desktop (which shows the hosted web app), Mobile, and the Chrome extension side panel. Internal Tauri desktop users also have it.

**Problems it solves**

- Reading long answers on a small screen or while hands and eyes are busy.
- Accessibility for people who prefer to listen.
- Hearing a reply without copying it into another speech tool.

**Use cases**

- On Web, a person opens the More message actions menu on a reply and chooses Read message aloud.
- On Mobile in Cloud mode, a person taps Read aloud under an answer while commuting and hears the server voice.
- In the Chrome side panel, a person clicks the speaker button on an answer to hear it in the browser's own voice.
- On a phone in Local mode, a person hears the answer in the phone's installed voice with no account call.

## 2. User experience

**Where to find it**

- Web chat: the 'More message actions' button (three dots) on an assistant reply opens a menu with a checkbox item 'Read message aloud', which becomes 'Stop reading message' while playing (apps/web/features/chat/components/messages/MessageBubble.tsx:3926-3991). The draft said hover or focus then click; the code puts it inside this menu.
- Web Code surface: a 'Read aloud' button with a speaker icon in the reply action row, 'Stop reading' while playing (apps/web/features/code/components/CodeTranscript.tsx:260-282; apps/web/features/code/code-surface.ts:204-205).
- Public Desktop (Electron): shows the hosted web app, so it is the Web control; no speech code exists in the Electron folder [inferred from grep of apps/desktop/electron finding no speech terms; doc: AGENTS.md section 5].
- Internal Tauri desktop: the shared action bar button with aria-label 'Read message aloud' / 'Stop reading message' (packages/ui/unified-chat/src/components/ActionBar.tsx:256-262), wired in apps/desktop/src/features/chat/useTauriMessageActions.ts:96-108. Also Settings > Voice 'Speak Assistant Replies' (apps/desktop/src/features/settings/VoiceSettings.tsx:674-720).
- Mobile chat: a 'Read aloud' action button under an assistant reply, 'Stop reading aloud' while playing (apps/mobile/src/features/chat/components/MessageBubble.tsx:3167-3174).
- Chrome extension side panel: a speaker button in the reply action row with title 'Read aloud' / 'Stop reading aloud' (apps/extension/src/features/side-panel/bubbles.ts:519-525, 627-629; apps/extension/_locales/en/messages.json:4485-4490).
- CLI and VS Code: no read-aloud control; no speech code found (apps/cli/src/voice.rs is voice input only: apps/cli/src/voice.rs:1-9).

**Before you start**

- Web server voice: a signed-in session, an adult-eligibility pass, managed compute switched on, quota left. Without a session the web uses the browser voice (apps/web/lib/hooks/useTTS.ts:433-437; apps/web/app/api/voice/speech/route.ts:76-91).
- Web: the reply must not be marked Local or own-key (apps/web/lib/read-aloud-policy.ts:16-26).
- Mobile Cloud: a signed-in Cloud account (apps/mobile/src/features/voice/services/voiceOutput.ts:102-105). Mobile Local: a speech voice on the device (Android check only) (apps/mobile/src/features/voice/services/readAloudAvailability.ts:37-38).
- Chrome: a browser with speech synthesis (apps/extension/src/features/read-aloud/index.ts:24-28).

**Screens and controls**

- Web menu checkbox 'Read message aloud' / 'Stop reading message'; disabled with the reason text when the reply is Local or own-key (MessageBubble.tsx:3980-3990).
- Web toast 'Read aloud could not play. Try again.' on failure (apps/web/lib/hooks/useTTS.ts:12, 68-70).
- Mobile action button with Square icon while playing and a toast with the same failure message (MessageBubble.tsx:266, 2024-2029).
- Mobile dimmed button showing a reason: 'Read aloud is getting ready. Try again in a moment.', 'Read aloud is unavailable because the account changed. Reopen this chat.', 'No speech voice is installed on this device.' (readAloudAvailability.ts:6-10).
- Chrome speaker button with aria-pressed state (bubbles.ts:519-525).

**Journey**

1. 1. Person receives a finished assistant reply (the Chrome and web controls show only on non-error, non-streaming replies: bubbles.ts:622-628).
2. 2. Person opens the action (Web: More message actions > Read message aloud; Mobile and Chrome: tap or click the speaker).
3. 3. The app cleans the text (web and Tauri strip Markdown; mobile removes citation markers only).
4. 4. The app picks an engine: server voice or device voice.
5. 5. Audio plays; the control changes to Stop.
6. 6. Person lets it finish or taps Stop; playing another reply stops the first.

**What the person sees and gets**

- Sound output only. No file is shown to the person.
- Control state flips to Stop while speaking (web: isReadingAloud; mobile: isSpeaking; Chrome: aria-pressed).
- Failure shows the toast 'Read aloud could not play. Try again.' on web and mobile.
- Disabled control with a reason when blocked (web policy, mobile owner/voice checks).

**Settings**

- Web: Settings > General rows 'Backup read-aloud voice' and 'Read-aloud speed' (apps/web/features/settings/sections/GeneralSection.tsx:308-312). See F050-02.
- Mobile: Settings > Voice (speed, pitch, voice, speech language). See F050-02.
- Chrome: Options page 'Read aloud' row (apps/extension/src/features/options/read-aloud-row.ts:28-66).
- Desktop Tauri: Settings > Voice 'Speak Assistant Replies' and Voice Persona (VoiceSettings.tsx:674-762).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: reply text is cleaned (fenced code replaced by 'code block omitted.', inline code, headings, bold, quotes, links, images, rules removed) (apps/web/lib/hooks/useTTS.ts:116-139).
- Web: signed-in speech is requested per chunk from POST /api/voice/speech, decoded and played with the Web Audio API; chunks are 3,800 characters (useTTS.ts:11, 27-39, 460-494).
- Web: if the first server chunk fails to fetch or decode, the browser's device voice speaks the whole reply; a later chunk failure shows the toast and stops (useTTS.ts:466-472).
- Web: starting another reply retires the previous operation; asking for the same text again toggles it off (useTTS.ts:262, 426-430).
- Web server route: CSRF, rate limit 30/min fail-closed, adult gate, kill switch, schema (1-4000 chars, optional voice and speed 0.25-4), privacy check, org model policy, idempotency key, entitlement and workspace access, usage reservation, provider call with 60 s timeout, usage settlement (apps/web/app/api/voice/speech/route.ts:48-247; apps/web/lib/rate-limit.ts:404-408).
- Web: Local and own-key replies get a disabled control with 'Read-aloud is unavailable for this reply’s privacy mode.' (apps/web/lib/read-aloud-policy.ts:4-5, 16-26; ChatMessageList.tsx:860).
- Web Code surface: managed sessions can read aloud; local/own-key sessions show the privacy reason; unverified sessions show the unverified reason (read-aloud-policy.ts:40-45; LocalSessionPanel.tsx:1375).
- Mobile Cloud: text goes in 3,800-character chunks to the same /api/voice/speech route, each saved to a temporary cache file, played, then deleted; the next chunk is prefetched (serverSpeech.ts:10-11, 46-63, 65-116, 149-175).
- Mobile: server failure falls back to the device voice for the unfinished chunks (voiceOutput.ts:139-148).
- Mobile Local: only the device voice (expo-speech) is used; a Local owner cannot request the server voice (voiceOutput.ts:102-105; tts.ts:83-103).
- Mobile: citation markers are removed from the spoken text when the answer shows sources (MessageBubble.tsx:2024).
- Chrome: device voice only, with saved voice and rate; one reply at a time (apps/extension/src/features/read-aloud/index.ts:41-65; bubbles.ts:536-565).
- Internal Tauri desktop: strips Markdown, then speaks through the native engine (configured provider or downloaded Piper voice), else the webview voice (apps/desktop/src/hooks/useTTS.ts:39-46, 52-98).

**Incomplete**

- Mobile does not strip Markdown before speaking; it passes message.content (minus citation markers) to speech (MessageBubble.tsx:2024). Whether the device voice reads symbols aloud is unknown.
- Chrome extension does not strip Markdown; it speaks the copy text of the message (bubbles.ts:625-628). What copyText holds is unknown.
- Web 'isSupported' is true whenever a window exists, even if the browser has no speech synthesis, because the server voice does not need it (useTTS.ts:222).

**Present but disconnected or switched off**

- Web speech route accepts a 'voice' field, but the web client never sends it, so the server default voice is always used (route.ts:54, 122; useTTS.ts:58).
- Mobile server speech sends only text and speed; the person's chosen voice, pitch and language do not reach the server voice (serverSpeech.ts:46-51).

**Not available**

- CLI: no speech output (apps/cli/src/voice.rs is input only: apps/cli/src/voice.rs:1-9).
- VS Code extension: no speech code found in apps/extension-vscode (grep of src found nothing).
- Chrome extension is listed as missing in the brief and ledger but exists in code (doc: knowledge-base/data/area-briefs/050-audio-overviews-speech-generation-and-music.md S50.01; apps/extension/src/features/read-aloud/index.ts).
- No separate API app and no public API for speech beyond the web route.

## 4. Required behaviour

**Established requirements**

- An assistant reply can be played aloud as speech. (source: S50.01 Should (brief))
- Read aloud is a standard message action alongside copy, edit, retry, branch, feedback. (source: doc: docs/product/experience-contract.md:400-410)
- Verify read aloud as a message action against the leaders and keep read aloud distinct from dictation and live conversation. (source: doc: docs/product/competitive-guidance.md:286, 401)
- Local, BYOK and Managed Cloud are separate trust boundaries; nothing may silently route a Local chat to cloud. (source: doc: AGENTS.md section 6)
- Speech is a managed side call that must respect the person's privacy setting and workspace policy. (source: apps/web/app/api/voice/speech/route.ts:106-120)

**Acceptance criteria**

1. A finished assistant reply on Web, Mobile and Chrome side panel shows a read-aloud control; CLI and VS Code show none.
2. Activating it plays speech; activating again (or the Stop state) stops it within one interaction.
3. Starting a second reply stops the first on the same surface.
4. Fenced code in a reply is not read aloud on Web (the phrase 'code block omitted.' is spoken instead).
5. On Web, a reply stamped Local or own-key has a disabled control showing the privacy reason, and no request to /api/voice/speech is made.
6. On Mobile in Local mode no call to /api/voice/speech is made; in Cloud mode the call is made and a failure falls back to the device voice.
7. A playback failure shows 'Read aloud could not play. Try again.' on Web and Mobile.
8. Empty or whitespace-only text speaks nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The same Local-mode rule should hold on every app: device voice is free of any subscription and needs no server (follows the product rule that local inference is free). Web currently blocks even the device voice for Local replies [inferred from read-aloud-policy.ts:16-26].
- Read aloud text cleaning should be the same on every app [inferred: Web and Tauri strip Markdown; Mobile and Chrome do not].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Share one text-cleaning function across Web, Tauri, Mobile and Chrome so all remove Markdown the same way.
- [proposed] Allow device-voice read aloud for Local and own-key replies on Web, because no text leaves the device on that path.
- [proposed] Add the read-aloud control to CLI (system speech command) only if the product decides it is wanted.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useTTS (web) | `apps/web/lib/hooks/useTTS.ts` | Cleans text, chooses server or device voice, chunks, plays, retires operations, stores voice choice. |
| endpoint | POST /api/voice/speech | `apps/web/app/api/voice/speech/route.ts` | Managed speech proxy with gates, quota reservation and provider call. |
| config | speech voices list | `apps/web/lib/voice/speech-voices.ts` | Allowed server voice names and the default. |
| config | voice-speech rate limit | `apps/web/lib/rate-limit.ts` | 30 per minute, fail closed, for the speech route (lines 404-408). |
| service | read-aloud policy | `apps/web/lib/read-aloud-policy.ts` | Disables read aloud for Local and own-key replies and code sessions. |
| component | Web MessageBubble menu item | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Renders 'Read message aloud' / 'Stop reading message' (3978-3991). |
| component | ChatMessageList handleReadAloud | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Owns the hook per conversation, re-checks policy, toggles stop (1234, 1773-1793). |
| component | CodeTranscript action row | `apps/web/features/code/components/CodeTranscript.tsx` | Read aloud button for Code replies (235-282). |
| service | managed usage reservation | `apps/web/lib/services/managed-usage-request-service.ts` | Reserves, starts, finalizes usage for each speech request. |
| service | managed compute access | `apps/web/lib/services/managed-compute-access.ts` | Subscription and workspace access check used by the speech route. |
| config | voice_speech routing slot | `packages/ai/model-registry/catalog/routing-policies.json` | Names the model family used by the speech route (line 919-921). |
| component | Mobile MessageBubble action | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Read aloud button and toggle logic (2002-2030, 3167-3174). |
| service | voiceOutput owner | `apps/mobile/src/features/voice/services/voiceOutput.ts` | Account-scoped owner choosing server or device voice with fallback. |
| service | serverSpeech (mobile) | `apps/mobile/src/features/voice/services/serverSpeech.ts` | Calls /api/voice/speech, writes temporary mp3, plays with expo-audio. |
| service | tts (mobile device voice) | `apps/mobile/src/features/voice/services/tts.ts` | expo-speech wrapper with voice, rate, pitch, language. |
| service | readAloudAvailability | `apps/mobile/src/features/voice/services/readAloudAvailability.ts` | Reasons the control is dimmed; Android no-voice probe. |
| hook | useVoiceOutputOwner | `apps/mobile/src/features/voice/hooks/useVoiceOutputOwner.ts` | Creates and disposes the owner per scope and account. |
| service | extension read-aloud | `apps/extension/src/features/read-aloud/index.ts` | Device-voice speak and stop with stored settings. |
| component | extension side-panel button | `apps/extension/src/features/side-panel/bubbles.ts` | Speaker button on assistant replies (517-565, 627-629). |
| hook | useTTS (desktop Tauri) | `apps/desktop/src/hooks/useTTS.ts` | Markdown strip, native engine choice, browser fallback. |
| hook | useTauriMessageActions | `apps/desktop/src/features/chat/useTauriMessageActions.ts` | Wires onReadAloud to the shared action bar (96-108). |
| command | voice_tts_speak_with_barge_in / voice_tts_stop / voice_get_capabilities | `apps/desktop/src-tauri/src/sys/commands/voice.rs` | Tauri commands for native speech and capability probe (742-821, 1361-1400). |
| component | unified-chat ActionBar | `packages/ui/unified-chat/src/components/ActionBar.tsx` | Shared read-aloud button used by the Tauri desktop (256-262). |
| component | Tauri SpokenReplies | `apps/desktop/src/features/voice/SpokenReplies.tsx` | Auto-speaks each finished reply when 'Speak Assistant Replies' is on. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: person chooses Read message aloud; the list re-reads the current message and refuses a Local or own-key one. | device | apps/web/features/chat/components/messages/ChatMessageList.tsx:1773-1793 |
| Web: the hook strips Markdown and checks for a session; with no session or deviceVoice it uses the browser voice. | device | apps/web/lib/hooks/useTTS.ts:424-438 |
| Web: for each 3,800-character chunk the browser posts text and speed to /api/voice/speech with an Idempotency-Key. | device and our servers | apps/web/lib/hooks/useTTS.ts:41-59, 460-462 |
| Server checks CSRF, rate limit, age gate, kill switch, schema, privacy setting, org policy, then reserves usage against the plan. | our servers | apps/web/app/api/voice/speech/route.ts:72-166 |
| Server sends the text to the OpenAI speech endpoint and receives mp3 audio. | outside service | apps/web/app/api/voice/speech/route.ts:196-210 |
| Server settles usage and returns the audio with no-store caching. | our servers | apps/web/app/api/voice/speech/route.ts:226-246 |
| Browser decodes and plays the audio; on first-chunk failure the browser voice speaks instead. | device | apps/web/lib/hooks/useTTS.ts:464-494 |
| Mobile Cloud: the owner sends chunks to the same route, writes each mp3 to the cache folder, plays it with expo-audio and deletes it. | device and our servers | apps/mobile/src/features/voice/services/serverSpeech.ts:46-116 |
| Mobile Local, or Cloud after a server failure: expo-speech speaks 500-character chunks in the phone's engine. | device | apps/mobile/src/features/voice/services/voiceOutput.ts:13, 149-157; tts.ts:83-103 |
| Chrome: the side panel loads saved settings from chrome.storage.local and calls the browser's speechSynthesis. | device | apps/extension/src/features/side-panel/bubbles.ts:551-558; apps/extension/src/features/read-aloud/index.ts:30-65 |
| Tauri desktop: asks the capability probe, then speaks with the configured provider, or a downloaded Piper voice, else the webview voice. | device | apps/desktop/src/hooks/useTTS.ts:39-81; apps/desktop/src-tauri/src/sys/commands/voice.rs:775-821. A configured ElevenLabs or OpenAI provider calls an outside service with a stored key (apps/desktop/src-tauri/src/features/speech/tts.rs:22-27, 682-688); where the key comes from in the Tauri build is unknown. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Reply text sent for speech (web and mobile Cloud server path) | Not stored by the route; sent to the speech provider. Only the length and voice go into the idempotency fingerprint. | No | Provider retention unknown. Response uses Cache-Control no-store (route.ts:160, 245). |
| Usage record for the speech call (operation speech, estimated tokens from characters, cost) | Managed usage request records via managed-usage-request-service | Server side only | Retention unknown; table name not opened (unknown). |
| Temporary mp3 per chunk on mobile | App cache folder (Paths.cache) | No | Deleted when playback ends or is stopped (serverSpeech.ts:66-88). |
| Web voice choice | Browser localStorage key agi:tts-voice-uri (useTTS.ts:100) | No, device-local on purpose (doc: docs/decisions/wire-or-cut.md:425) | Kept until cleared. |
| Chrome voice and rate | chrome.storage.local key agi_read_aloud (apps/extension/src/features/read-aloud/index.ts:1) | No evidence of sync (chrome.storage.local) | Kept until cleared. |

**Models and providers.** The web route needs a live text-to-speech model from the OpenAI provider, resolved from the voice_speech routing slot; it throws if the slot is not a live OpenAI speech model (route.ts:102-105; packages/ai/model-registry/catalog/routing-policies.json:919-921). Speech is not model agnostic or provider agnostic today: one provider is hard-required in the route. The reply's own chat model plays no part. Device voices come from the browser, phone or OS. Desktop Tauri supports System, ElevenLabs, OpenAI and Piper (tts.rs:22-27).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web server voice needs a signed-in account; without a session the web uses the browser voice (useTTS.ts:433-437; route.ts:76). Mobile server voice needs a Cloud account; Local needs none (voiceOutput.ts:102-105). Chrome and Tauri device voice need no account. |
| Permissions | Adult-eligibility gate on the route (route.ts:78-84); workspace policy and spend limit (managed-compute-access.ts:100-176); organization model policy (route.ts:114-120); the person's privacy setting that blocks providers that may train on content (route.ts:106-113). Mobile requires no microphone permission for playback [inferred]. |
| Subscription | Free and no-plan accounts pass the subscription check; paid accounts need an active status (apps/web/lib/services/managed-compute-access.ts:68-75, 80-98). Quota is applied at usage reservation (route.ts:156-166). The settings note says the AGI voice 'uses a few credits per reply' (GeneralSection.tsx:853-856). The mapping to a named plan is unknown. |
| Limits and metering | Text 1-4,000 characters per request; speed 0.25-4; 30 requests per minute per user, fail closed (route.ts:48-56; rate-limit.ts:404-408). Cost is estimated from characters (4 characters per input token, 1.5 output tokens per character) (route.ts:49-50, 123-132). Free-plan numeric limits: unknown. |
| Feature flags | Environment kill switch AGI_MANAGED_COMPUTE_PRIVATE_BETA; when off the route returns 403 public_launch_blocked (apps/web/lib/managed-compute-gate.ts:40, 55-91). |
| Model compatibility | The route requires a live OpenAI text-to-speech model from the voice_speech slot (route.ts:102-105). Any chat model's replies can be read except those tagged Local or own-key on web. |
| Provider restrictions | OpenAI only for the server voice (route.ts:103). Providers that may train on content are refused when the person's privacy setting says so (route.ts:106-113). Own-key (BYOK) replies are blocked on web (read-aloud-policy.ts:19-22). Desktop Tauri can use ElevenLabs or OpenAI with a configured key (tts.rs:22-27). |
| Local mode | Mobile Local: device voice only, no server call, no account, no subscription (voiceOutput.ts:102-105; server-read-aloud tests name this). Web Local replies: the control is disabled and shows the privacy reason, even though a device voice exists (read-aloud-policy.ts:16-26). Chrome: always the device voice. Tauri desktop: downloaded Piper voice runs offline (local_tts.rs:1-5). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web sets speaking true while the first chunk is fetched; the control shows Stop at once. Mobile sets speaking on tap and calls onStart when audio begins. | apps/web/lib/hooks/useTTS.ts:440; apps/mobile/src/features/chat/components/MessageBubble.tsx:2023 |
| Empty text | Nothing is spoken on web, mobile (done at once) and Chrome. | useTTS.ts:425; voiceOutput.ts:129-130; read-aloud/index.ts:47-48 |
| Success | Control returns to Read after playback ends. | useTTS.ts:495; MessageBubble.tsx:2024-2028 |
| Error, first chunk (web) | Silent fall back to browser voice. | useTTS.ts:466-467 |
| Error, later chunk (web) | Toast and stop. | useTTS.ts:468-471; useTTS.test.ts:416 |
| Error (mobile) | Server failure falls back to device voice for the remaining text; a final failure shows the toast. | voiceOutput.ts:143-148; MessageBubble.tsx:2027 |
| Server errors | 429 gives 'Read aloud is busy right now. Try again in a moment.'; 5xx gives 'The speech provider is unavailable. Try again shortly.' The web client discards these texts and treats any non-OK response as failure, so the person sees the fallback or the generic toast. | route.ts:65-69; useTTS.ts:60 |
| Cancel | Stop retires the operation, stops the audio source or utterance, and ignores late callbacks. | useTTS.ts:288-327; voiceOutput.ts:89-100 |
| Timeout | Server aborts the provider call after 60 s; mobile aborts after 60 s. | route.ts:209; serverSpeech.ts:12 |
| Offline | Web server fetch fails and falls back to the device voice (works offline if the voice is local); mobile Cloud likewise falls back. Chrome and Local work offline [inferred]. | useTTS.ts:63-65, 466-467; voiceOutput.ts:143-148 |
| Account change or sign-out | Web retires playing audio on an identity change; mobile stops Cloud speech on account epoch change and dims the button with 'account changed'. | useTTS.ts:209-215; voiceOutput.ts:114-118; readAloudAvailability.ts:25-30 |
| Browser audio locked (iOS web) | An unlock() primes the synthesizer silently; if the audio context cannot resume the device voice is used. | useTTS.ts:388-409, 456-459 |
| Android with no voice (mobile Local) | Control is dimmed with 'No speech voice is installed on this device.' iOS does not probe. | readAloudAvailability.ts:36-38; MessageBubbleReadAloudReason.test.tsx:124-160 |
| Accessibility | Web menu uses checkbox semantics; mobile and Chrome set labels and aria-pressed. Screen-reader behaviour while speech plays: not handled in the code or not found. | MessageBubble.tsx:3979-3983; bubbles.ts:519-525 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/hooks/useTTS.test.ts`: Markdown cleaning, start/stop state, voice selection and enumeration, missing voice, owner lifetimes, anonymous device speech, later-chunk failure toast.
- `apps/web/lib/hooks/useTTS.scope.test.ts`: Which scope each caller passes to the hook.
- `apps/web/lib/read-aloud-policy.test.ts`: Local and own-key refusal, legacy chat unchanged, code session modes.
- `apps/web/app/api/voice/speech/__tests__/route.test.ts`: Session, CSRF, rate limit, age gate, kill switch, schema limits, unknown voice, privacy refusal, org policy, idempotency, quota, provider failure 502, success.
- `apps/mobile/__tests__/server-read-aloud.test.ts`: Server route use, device fallback for unfinished text, stop, account switch, Local stays on device.
- `apps/mobile/__tests__/MessageBubbleReadAloudReason.test.tsx`: Dimmed reasons, Cloud availability, Android voice probe, citation numbers not spoken.
- `apps/extension/__tests__/read-aloud.test.ts`: Settings parsing, support check, speak and stop.
- `apps/desktop/src/features/chat/__tests__/useTauriMessageActions.test.tsx`: Message actions wiring for the Tauri desktop (read-aloud coverage inside it not opened: unknown).

**Test scenarios**

- **Web signed-in server voice**
  1. Sign in on Web with a Cloud reply in the chat.
  2. Open More message actions on the reply and choose Read message aloud.
  3. Watch the network tab.
  - Expected: POST /api/voice/speech returns audio/mpeg; sound plays; menu item reads Stop reading message; choosing it stops sound.
- **Web Local reply blocked**
  1. Send a message with a Local model.
  2. Open More message actions on the answer.
  - Expected: Read item is disabled with 'Read-aloud is unavailable for this reply’s privacy mode.' and no speech request is sent.
- **Web server down fallback**
  1. Block /api/voice/speech in the browser.
  2. Read a reply aloud.
  - Expected: Browser voice speaks the reply; no toast.
- **Mobile Cloud with failure**
  1. Sign in to Cloud mode on the phone.
  2. Tap Read aloud on a long reply.
  3. Force the speech request to fail mid-way.
  - Expected: Remaining text finishes in the device voice; no stuck Stop state.
- **Mobile Local offline**
  1. Switch to Local mode, airplane mode on.
  2. Tap Read aloud.
  - Expected: Device voice speaks; no network call; on Android with no voice the control is dimmed with the no-voice reason.
- **Chrome side panel**
  1. Open the side panel and get a reply.
  2. Click the speaker; click another reply's speaker.
  - Expected: First stops, second plays in the voice chosen in Options.

**Where to look when it fails**

- Server log 'Speech proxy failed' with status and 'Speech failure settlement could not be persisted' (route.ts:189, 216).
- Error code public_launch_blocked or model_may_train in the JSON error body (route.ts:111; managed-compute-gate.ts:85).
- HTTP 400 'Each read-aloud request needs an Idempotency-Key header.' (route.ts:139).
- Mobile console warnings '[voiceOutput] server read aloud failed, using device voice' and '[serverSpeech] playback cleanup failed' (voiceOutput.ts:143; serverSpeech.ts:85).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/050-audio-overviews-speech-generation-and-music.md](../../70-qa/test-plans/web/050-audio-overviews-speech-generation-and-music.md)
- Desktop: [70-qa/test-plans/desktop/050-audio-overviews-speech-generation-and-music.md](../../70-qa/test-plans/desktop/050-audio-overviews-speech-generation-and-music.md)
- Mobile: [70-qa/test-plans/mobile/050-audio-overviews-speech-generation-and-music.md](../../70-qa/test-plans/mobile/050-audio-overviews-speech-generation-and-music.md)
- No hands-on plan yet for Chrome: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Chrome extension read aloud exists but the brief, ledger and draft mark Chrome as missing.** Affects: Documentation, test planning; Chrome users. Evidence: apps/extension/src/features/side-panel/bubbles.ts:627-629; brief S50.01. Work needed: Correct the brief and ledger row for S50.01 Chrome to built (device voice).
- **Web blocks read aloud for Local and own-key replies even though the device voice would keep the text on the device.** Affects: Web and public Desktop users on Local or own-key. Evidence: apps/web/lib/read-aloud-policy.ts:16-26. Work needed: Decide the rule; if wanted, allow device-voice-only read aloud for those replies.
- **Text cleaning differs: Mobile and Chrome do not strip Markdown.** Affects: Mobile, Chrome. Evidence: apps/mobile/src/features/chat/components/MessageBubble.tsx:2024; apps/extension/src/features/side-panel/bubbles.ts:625-628. Work needed: Use one shared cleaner; add tests per app.
- **Server voice is OpenAI only and not selected through the model catalog family path the product requires.** Affects: All server-voice users. Evidence: apps/web/app/api/voice/speech/route.ts:102-105. Work needed: Allow other speech providers behind the voice_speech slot.
- **No read aloud on CLI or VS Code.** Affects: CLI, VS Code users. Evidence: no speech code in apps/cli/src or apps/extension-vscode/src. Work needed: Product decision first; the experience contract does not require it (doc: docs/product/experience-contract.md:641).
- **Decision doc says web read aloud runs entirely on the browser engine; the code now has a server voice.** Affects: Engineers reading docs. Evidence: doc: docs/decisions/wire-or-cut.md:425 versus apps/web/lib/hooks/useTTS.ts:41-66. Work needed: Update the decision text; code wins.
- **Server error messages are never shown on web.** Affects: Web users hitting quota or kill switch. Evidence: useTTS.ts:60 returns null on any non-OK response. Work needed: Surface quota or policy refusals instead of the generic toast or silent fallback.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:local
- mode:cloud
- mode:own-key
- provider:openai
- api:POST /api/voice/speech
- file:apps/web/lib/hooks/useTTS.ts
- file:apps/web/lib/read-aloud-policy.ts
- file:apps/mobile/src/features/voice/services/voiceOutput.ts
- store:localStorage agi:tts-voice-uri
- store:chrome.storage.local agi_read_aloud
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-model-catalog-and-routing
- SYS-local-inference
- F050-02

## Unknown

- Whether the Electron public Desktop has any read-aloud control beyond the hosted web app: not traced beyond a grep.
- Exact label of the read-aloud button in the Tauri desktop beyond the ActionBar aria-label.
- What chat text the Chrome extension copyText returns (raw Markdown or cleaned).
- Free-plan quota values and the table names holding speech usage.
- Where the Tauri desktop gets a configured ElevenLabs or OpenAI TTS key.
- Whether mobile own-key (BYOK) mode exists as a third scope for read aloud; the owner only knows 'local' and 'cloud'.
- No test result is recorded in any file I read; none is claimed.
