---
id: "F048-01"
type: "feature"
title: "Start or resume a voice conversation"
aliases: ["Start voice mode", "Voice entry", "Voice chat", "Live voice", "Voice call", "Voice companion (mobile on-device screen)", "/voice (CLI)", "voice=live (mobile route parameter)", "Rejoin a voice session"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.01", "S48.02", "S48.39"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "SYS-voice-and-media", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-authentication-and-identity", "SYS-memory-projects-and-context", "F048-02", "F048-04", "F048-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-01 Start or resume a voice conversation

A person starts a spoken conversation bound to one chat. On web and desktop the live voice session needs a Cloud model, a signed-in account and a plan that allows voice. On mobile it is live in Cloud mode and turn based on the device otherwise. The CLI only offers push-to-talk dictation.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.01](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4801), [S48.02](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4802), [S48.39](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4839).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Opens a voice conversation tied to a chat. If the chat already has earlier turns, the server loads up to 24 of them as context, so the person continues the same conversation by voice. If the chat is new, a chat is created first. If another device left a session open for the same chat, web offers to continue with that session's voice, language and pace.

**Why it exists.** The leading assistants let a person talk instead of type and then carry on in the same chat. The product requirements say live voice must be separate from dictation and say plainly when it is unavailable (docs/product/requirements.md:996-1004; docs/product/competitive-guidance.md:399-408).

**Who uses it.** Signed-in people on web, desktop and mobile who want hands-free talk; CLI users who want to dictate instead of type.

**Problems it solves**

- Typing is slow or impossible while walking, driving or cooking.
- A spoken exchange would otherwise be lost; here it lands in the chat history and can be reopened.
- People need a clear, non-broken answer when voice is not allowed on their plan or mode.

**Use cases**

- Open an existing chat on web, press the round voice button, and keep talking about the same topic.
- On the mobile new-chat screen press the voice button and a new chat called 'Voice chat' is created and opened in live voice.
- Reopen last week's chat and start voice again so the assistant has the earlier turns as context.
- In the CLI type /voice, hold SPACE and dictate a prompt.

## 2. User experience

**Where to find it**

- Web and Desktop (the Desktop app shows the hosted web app): in the chat composer, when the text field is empty, a round button labelled 'Start voice mode' replaces Send (apps/web/features/chat/components/Composer/VoiceEntryButton.tsx:9; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6955). Both the new-chat landing view and an open chat render it (apps/web/features/chat/pages/WebChatPage.tsx:7672, 7800).
- Mobile: the round composer button with accessibility label 'Start voice mode' and hint 'Opens hands-free voice conversation' (apps/mobile/src/features/chat/components/ChatInput.tsx:2278-2294); a long press on the dictation button also opens it (ChatInput.tsx:2255); the slash command '/voice' (ChatInput.tsx:1563, 1576); the setting 'Start with Voice' opens voice on launch (apps/mobile/src/features/settings/voice/index.tsx:399; apps/mobile/app/(app)/(tabs)/chat.tsx:1128). Settings > Voice has a row 'Open Voice Companion' (settings/voice/index.tsx:515) for the on-device companion screen.
- CLI: the slash command /voice with an optional language, or the --voice-lang flag for the default language (apps/cli/src/repl/mod.rs:296-306; apps/cli/src/lib.rs:354).
- VS Code and Chrome extension: no live voice entry found; both only have speech-to-text dictation files (apps/extension-vscode/src/webview/dictation.ts; apps/extension/src/features/side-panel/dictation-language.ts).

**Before you start**

- Web/Desktop: a signed-in account, a Cloud model selected (not a model on this device, not a chat that holds Local turns), the 'canUseVoice' capability, microphone permission, and a browser with WebRTC (WebChatPage.tsx:5906-5910; ChatComposerNew.tsx:6955; live-voice-session.ts:444-452).
- Adults only: the server applies an adult-eligibility gate named 'voice-live' (apps/web/app/api/voice/live/sessions/route.ts:181-188).
- Mobile live voice: Cloud mode, signed in, the native WebRTC module present, and an https server (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17-44).
- CLI: a build with the 'voice' feature (macOS and Windows release builds only), a working microphone, and a transcription backend (apps/cli/src/lib.rs:77-105; .github/workflows/release-cli.yml:268-279).

**Screens and controls**

- Web: voice surface in the composer slot with a round orb, call timer, composer row (plus button, text field, mic button, 'End voice session'), header label 'Voice' with a 'Voice settings' gear (VoiceModeSurface.tsx; VoiceComposer.tsx:9-16; VoiceHeaderLabel.tsx:12-15).
- Web rejoin dialog titled 'This chat already has an open voice session' with buttons 'Continue that session' and 'Use my settings' (VoiceModeSurface.tsx:57-62, 446).
- Mobile live: LiveVoiceBar with orb, status line, mic, 'End live voice', 'Switch to text for this chat' (LiveVoiceBar.tsx:704, 726, 746). First use shows an onboarding sheet then a voice picker sheet (apps/mobile/app/(app)/chat/[id].tsx:1721-1745).
- Mobile on-device fallback: VoiceInlineBar in the chat, and the full screen voice companion (apps/mobile/app/(app)/voice.tsx).
- CLI: terminal text prompts '[SPACE to record, ESC to exit]' (apps/cli/src/voice.rs:176-190).

**Journey**

1. 1. The person taps 'Start voice mode' (web) or the mobile voice button.
2. 2. Web: the voice session status moves to 'entering' (apps/web/features/chat/stores/voice-session-store.ts:219-222). If the chat is not a Cloud chat the surface shows an unavailable message and 'Continue in text' (use-voice-session.ts:826-834; VoiceModeSurface.tsx:339-352).
3. 3. Web with an existing chat: the app asks the server whether the chat already has an open voice session (GET /api/voice/live/sessions/active) and, if so, shows the rejoin dialog; otherwise it starts (use-voice-session.ts:844-866).
4. 4. If there is no chat yet a new one is created and the address is replaced with it (WebChatPage.tsx:6695-6722).
5. 5. The browser asks for the microphone, builds a WebRTC offer and posts it with the chosen voice, language, pace, reasoning and the chat id (live-voice-session.ts:480-545).
6. 6. The server checks account, plan and budget, loads earlier turns, and asks the voice provider to open the session; the app applies the answer and shows 'Listening' (route.ts:181-731; live-voice-session.ts:1003-1010).
7. 7. Mobile does the same through LiveVoiceSession.start; on a new chat it first creates a chat titled 'Voice chat' and opens it with voice=live (apps/mobile/app/(app)/(tabs)/chat.tsx:1090-1093).
8. 8. To resume, open an older chat and start voice again; its earlier turns are loaded as context (apps/web/app/api/voice/live/sessions/lib/live-voice-context.ts:22-27, 95-131).

**What the person sees and gets**

- Web connecting state is announced as 'Connecting to voice' (voice-announcements.ts:4-12).
- Web microphone refusal: 'Microphone access was denied. Allow the microphone to use voice mode.' and the app retries by itself once the browser permission is granted (live-voice-session.ts:61-77; use-voice-session.ts:880-905).
- Web no plan access: 'Voice needs usage your plan doesn't include. Upgrade to talk with voice, or continue in text.' with Upgrade and Continue in text buttons (voice-session-budget.ts:40-44; VoiceModeSurface.tsx:314-336).
- Mobile reasons shown when live is unavailable: 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' and 'Sign in to use live voice; this chat stays turn based.' (liveVoiceAvailability.ts:17-19).
- CLI prints which backend transcribes, then 'Press SPACE to talk, ESC to exit voice mode.' (voice.rs:105-176).

**Settings**

- Web voice settings are remembered in the browser under the store name agi-web-voice-session (voice-session-store.ts:28, 206-212).
- Mobile: 'Voice Input', 'Auto-listen', 'Start with Voice', 'Speech language', 'Voice' (apps/mobile/src/features/settings/voice/index.tsx:387-422).
- CLI: --voice-lang and the /voice language argument (apps/cli/src/lib.rs:354, 5950-5955).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: entry button, rejoin check, chat creation, WebRTC start and server session creation are all connected (ChatComposerNew.tsx:6955; use-voice-session.ts:539-720; route.ts:731).
- Server refuses with 400 voice_conversation_required when no chat id is sent (route.ts:255-262).
- Server loads up to 24 earlier turns, 700 characters each, plus project, personalization and memory context into the session instructions (live-voice-context.ts:22-27, 95-131; route.ts:494-506).
- Server closes any older open voice session for the same chat as 'superseded' and settles it (route.ts:642-665). 'Continue that session' starts a new session with the old settings; it does not reattach (use-voice-session.ts:868-883).
- A chat created only for voice is deleted again if the session fails to start (use-voice-session.ts:690-700).
- Mobile live start from an open chat and from the new-chat tab, with onboarding, capability check and fallback to on-device turn-based voice (chat/[id].tsx:1697-1745; (tabs)/chat.tsx:1071-1112).
- Desktop (Electron) grants only audio media to the trusted cloud origin, so the web voice code can use the microphone there (apps/desktop/electron/permissionPolicy.ts:49-58).
- CLI /voice runs push-to-talk dictation and sends the confirmed text to the agent session (voice.rs:75-300).

**Incomplete**

- CLI: there is no live conversation; the brief marks start, resume and new voice as done for CLI, but the code is record, transcribe, confirm, send as text (voice.rs:1-12, 176-300). Resuming an earlier CLI voice conversation is not implemented as a voice feature; whether earlier turns of the REPL session count as context is [inferred] from the session object being reused (voice.rs:261-272).
- The 20 second timeout covers only the server's call to the voice provider (route.ts:128, 563); the client has its own 10 second ICE wait (live-voice-session.ts:43) but no overall start timeout was found.
- The brief's line references are out of date (for example route.ts:254-262 is now 255-262 and the 20 second constant is route.ts:128).

**Present but disconnected or switched off**

- Web/Desktop: when the chat model is a model on this device, or the chat holds Local turns, or the model is not a managed route, the voice entry button is not rendered because onEnterVoiceMode is undefined (WebChatPage.tsx:5906-5910, 7672, 7800; test: WebChatPage.local-model-and-voice.test.tsx:464).
- Mobile: Local mode never starts the live session; it uses turn-based on-device voice instead (liveVoiceAvailability.ts:17-25).
- CLI voice is compiled out on Linux release builds; the stand-in returns an error naming the missing feature (release-cli.yml:268-279; apps/cli/src/lib.rs:83-105).

**Not available**

- VS Code extension and Chrome extension: no live voice found; only dictation files exist (apps/extension-vscode/src/webview/dictation.ts; apps/extension/src/features/side-panel/dictation-language.ts).
- Own-key live voice on web: not offered; the server only uses a server-held key and a managed provider (route.ts:189-198, 235).

## 4. Required behaviour

**Established requirements**

- From an open existing chat, a control starts a voice conversation bound to that chat. (source: brief S48.01)
- A control starts a brand-new voice conversation and a new chat is created for it. (source: brief S48.02)
- The user can reopen a previous voice conversation and continue it by voice with its earlier turns as context. (source: brief S48.39)
- Live voice and dictation are different things; if live voice is not available the app says so without broken controls. (source: doc: docs/product/requirements.md:910-921, 996-1004)
- Voice controls include microphone, mute, stop, captions, device selection, voice choice and understandable connection state; audio must not escalate to the cloud without required consent. (source: doc: docs/product/competitive-guidance.md:399-408)
- Nothing may silently route a Local chat, file or session to BYOK or managed cloud. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. On web with a Cloud model and an empty text field, 'Start voice mode' is visible; with a model on this device it is absent.
2. Starting from a chat with earlier messages produces a session whose first reply shows awareness of those messages.
3. Starting from the new-chat screen creates exactly one chat, and a failed start leaves no empty chat behind on web.
4. A request without a conversation id is refused with code voice_conversation_required.
5. Refusing the microphone shows the microphone message, creates no charge, and retries after permission is granted.
6. A plan without voice shows the not-in-plan message with Upgrade and Continue in text.
7. Starting voice twice for the same chat on two devices leaves one open session; the first is closed as superseded.
8. On mobile in Local mode the voice button opens the on-device turn-based voice and says live voice runs in Cloud.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI voice mode should not be described as a live conversation until a live path exists [inferred from voice.rs:1-12].
- The web rejoin dialog should say it starts a new session with the same settings, because the old session is closed [inferred from route.ts:642-665 and use-voice-session.ts:868-883].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer voice on web/desktop for own-key chats only through an explicit, labelled fork with consent, as AGENTS.md section 6 requires.
- [proposed] Add an overall client start timeout with a clear 'could not connect' message.
- [proposed] Mark the CLI row as 'push-to-talk dictation' in the surface matrix instead of 'live'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceEntryButton | `apps/web/features/chat/components/Composer/VoiceEntryButton.tsx` | Round 'Start voice mode' button in the composer. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Shows the entry button when the field is empty and canUseVoice is true (line 6955). |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Decides voiceManaged, passes onEnterVoiceMode, creates or discards the chat for voice (5906-5921, 6695-6735, 7664-7672). |
| hook | useVoiceSession and startLiveVoiceSession | `apps/web/features/chat/hooks/use-voice-session.ts` | Controller: entering state, rejoin check, session start, reconnect, pause, exit. |
| service | LiveVoiceSession | `apps/web/features/chat/lib/live-voice-session.ts` | Browser WebRTC session: microphone, offer, POST to server, data channel events. |
| store | useVoiceSessionStore | `apps/web/features/chat/stores/voice-session-store.ts` | Session status, settings, rejoin offer; persists voice, language, pace, reasoning. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Creates the provider session, checks plan and budget, records the session. |
| endpoint | GET /api/voice/live/sessions/active | `apps/web/app/api/voice/live/sessions/active/route.ts` | Returns the open session for a chat, used for the rejoin offer. |
| service | loadLiveVoiceContext | `apps/web/app/api/voice/live/sessions/lib/live-voice-context.ts` | Loads earlier turns, project, personalization and memory into the instructions. |
| table | voice_sessions | `apps/web/db/neon/0260_voice_sessions.sql` | One row per voice session, bound to one chat. |
| config | permissionPolicy | `apps/desktop/electron/permissionPolicy.ts` | Desktop grants audio-only media to the trusted cloud origin. |
| component | ChatInput voice button | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Mobile 'Start voice mode' button, long press, '/voice' command. |
| screen | Mobile chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | startVoiceMode, onboarding, LiveVoiceComposer and VoiceInlineBar mounts (1685-1745, 2809-2826). |
| screen | Mobile new-chat tab | `apps/mobile/app/(app)/(tabs)/chat.tsx` | Creates a 'Voice chat' chat and opens it with voice=live (1071-1112). |
| service | liveVoiceAvailability | `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts` | Reasons live voice is unavailable (Local mode, signed out, no native module, not https). |
| hook | useLiveVoiceSession (mobile) | `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | Starts, reconnects and ends the mobile live session and saves final turns. |
| service | LiveVoiceSession (mobile) | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | Mobile WebRTC session; posts surface 'mobile'. |
| screen | Voice companion | `apps/mobile/app/(app)/voice.tsx` | On-device turn-based voice screen; creates a 'Voice session' chat on first turn (line 252). |
| command | run_voice_mode and dictate | `apps/cli/src/voice.rs` | CLI push-to-talk dictation loop. |
| config | voice feature gate | `apps/cli/src/lib.rs` | Compiles voice in or out; --voice-lang flag (77-105, 354). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses 'Start voice mode'; the voice store moves to 'entering'. | device | apps/web/features/chat/stores/voice-session-store.ts:219-222 |
| App checks for an already open session for this chat. | device and our servers | apps/web/features/chat/hooks/use-voice-session.ts:844-866; apps/web/app/api/voice/live/sessions/active/route.ts |
| Browser asks for the microphone and creates the WebRTC offer. | device | apps/web/features/chat/lib/live-voice-session.ts:480-545 |
| Server checks CSRF, rate limit, adult gate, managed-compute, organization policy, spend limit, model policy, entitlement, capability flag and plan voice allowance. | our servers | apps/web/app/api/voice/live/sessions/route.ts:174-320 |
| Server reserves one minute of usage (paid plans) or grants one minute of the monthly free allowance (Free). | our servers | route.ts:366-418 |
| Server loads earlier turns, project, personalization and memory, then calls the voice provider to open a session with a delegated reasoning backend. | outside service | route.ts:494-570; apps/web/app/api/voice/live/sessions/lib/live-voice-context.ts:22-131 |
| Server closes older sessions for the chat as superseded, stores a voice_sessions row and returns session id, SDP answer, settings, tool list and a 60 second ceiling. | our servers | route.ts:642-729 |
| Browser applies the answer; audio flows directly between browser and provider; 'session.started' makes the app show Listening. | outside service | live-voice-session.ts:545-570, 1003-1010 |
| Mobile Local mode instead runs on-device speech recognition, the chosen reply model, and on-device speech output. | device | apps/mobile/app/(app)/voice.tsx:82-100; apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:299-330 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| voice_sessions row (user, chat, provider session id, surface, voice, language, pace, active tools, last turn id, status, times) | our database table voice_sessions | Readable from any device through the active-session endpoint | Closed with a reason when the call ends or is superseded; deletion policy unknown |
| Voice, language, pace, reasoning choices (web) | browser local storage key agi-web-voice-session | No, per browser | Reset on logout (voice-session-store.ts:131-147) |
| Spoken turns as chat messages | chat history on our servers (web posts each final turn with skipLlm); mobile chat store | Yes for Cloud chats | Follows chat retention; not a separate audio recording (WebChatPage.tsx:6739-6785; chatMessageStore.ts:1161-1200) |
| Audio | Not stored by this code; streamed to the voice provider | n/a | Provider retention unknown |

**Models and providers.** The live voice model comes from the voice_live routing slot and must be a live, priced model on a managed provider (route.ts:189-198, 253-262). A second, plan-dependent backend model handles reasoning and tools (route.ts:318-323). The server key is read from an environment variable named OPENAI_API_KEY (route.ts:235), so the provider is most likely provider:openai [inferred]. Model identifiers are deliberately not recorded here. See SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web/Desktop and mobile live voice need a signed-in account (route.ts:178; liveVoiceAvailability.ts:19). Mobile on-device voice and the CLI local binary need no account [inferred from voice.rs:105-140 and liveVoiceAvailability.ts:21-25]. |
| Permissions | Microphone permission. Adults only gate 'voice-live' (route.ts:181-188). Organization policy, model policy and spend limit gates (route.ts:199-231). Tool approval policy is applied to what voice tools may do (route.ts:507-515). Mobile asks for cloud-send consent before starting (liveVoiceSession.ts:269; test live-voice-session.test.ts:256). |
| Subscription | Capability canUseVoice is withdrawn when the plan policy has allowVoice false (apps/web/lib/services/capability-handshake-service.ts:118) and checked again on the server (route.ts:300-316). Free plan has a monthly voice allowance set by voiceMinutesPerMonth (packages/contracts/types/src/model-catalog.ts:1255-1256); paid plans fund voice from their usage budget (route.ts:341-372). |
| Limits and metering | One minute blocks (LIVE_VOICE_BLOCK_SECONDS) reserved at start and extended while the call runs; lease 10 minutes (apps/web/lib/voice/live-voice-billing.ts:20-28). Rate limit key 'voice-live-session' (route.ts:176). Earlier-turn context capped at 24 turns, 6000 characters (live-voice-context.ts:22-24). |
| Feature flags | Feature flag capability 'canUseVoice' evaluated per user, workspace, plan and surface (route.ts:300-307). Mobile 'Start with Voice' and 'Voice Input' settings (settings/voice/index.tsx:387-399). |
| Model compatibility | Needs a live, priced voice model in the voice_live slot and a live backend model for the plan; otherwise the route throws or returns 503 live_voice_unpriced (route.ts:189-198, 266-280). |
| Provider restrictions | Managed providers only; a server key is required, else 503 live_voice_not_configured (route.ts:192-197, 232-246). If the model may train on inputs and the user opted out of training, or the chat carries Google user data, voice is refused with 403 model_may_train (route.ts:322-341). |
| Local mode | Web/Desktop: voice entry is not offered for Local chats or models on this device (WebChatPage.tsx:5906-5910). Mobile: Local mode uses turn-based voice with on-device recognition and speech and a reply from the selected model, and shows 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' (liveVoiceAvailability.ts:17-25; voice.tsx:82-100). It needs no paid plan [inferred]; it needs an on-device recognizer (voice.tsx:128-134). CLI: Local privacy mode only uses a local speech binary unless AGIWORKFORCE_VOICE_ALLOW_CLOUD=1 (voice.rs:55-100, 458-510). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connecting | Web shows status 'entering' and announces 'Connecting to voice'; mobile shows 'Connecting live voice...'. | voice-announcements.ts:4-12; LiveVoiceBar.tsx:172-176 |
| Microphone denied or missing | Web raises microphone_denied or microphone_unavailable; these codes never auto-retry the start, but granting permission later triggers a retry. | live-voice-session.ts:290-305; use-voice-session.ts:169-173, 880-905 |
| Plan does not allow voice | 403 or 402 voice_usage_not_in_plan; web shows Upgrade and Continue in text. | route.ts:311-318, 359-364; VoiceModeSurface.tsx:314-336 |
| Provider session create fails or times out | Reservation is released and an error is returned; start failure shows 'The voice connection could not be established.' and a Try again button. | route.ts:448-470, 583-607; VoiceModeSurface.tsx:339-352 |
| Provider rejects function tools | Server retries once with hosted tools only. | route.ts:571-582 |
| Session record cannot be saved | 503 voice_session_not_recorded and the reservation is released; nothing is charged. | route.ts:685-700 |
| Same chat already open elsewhere | Web offers rejoin; server supersedes the old session on the next start. | use-voice-session.ts:856-866; route.ts:642-665 |
| Offline or dropped connection while starting | The start is retried up to 3 times with growing delay when the failure is recoverable; the browser 'online' event retries at once. | use-voice-session.ts:165-170, 229-262, 926-931 |
| Page hidden or closed | Web ends the session on pagehide; mobile ends it when the app goes to the background. | use-voice-session.ts:926-927; useLiveVoiceSession.ts:480-486 |
| Account changes mid-start | The attempt is retired and the session closed. | use-voice-session.ts:800-803; useLiveVoiceSession.ts:455-470 |
| Screen reader | Web has a polite live region for status; mobile iOS announces capture notices; Android announcements not handled in the code seen. | VoiceModeSurface.tsx:~270; voice.tsx:236-239 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/voice/live/sessions/route.test.ts`: Server session creation with delegation and webrtc transport, reasoning by plan, allowed client events, adult eligibility refusals, Free monthly allowance grant.
- `apps/web/app/api/voice/live/sessions/active/__tests__/route.test.ts`: Active-session lookup used for rejoin.
- `apps/web/app/api/voice/live/sessions/lib/__tests__/live-voice-context.test.ts`: Earlier-turn and context loading.
- `apps/web/features/chat/hooks/useVoiceSession.test.tsx`: Chat binding for a new chat, discarding a created chat on failure, refusing Local destinations, retired attempts.
- `apps/web/features/chat/components/Composer/VoiceEntryButton.test.tsx`: The 'Start voice mode' button.
- `apps/web/features/chat/pages/__tests__/WebChatPage.local-model-and-voice.test.tsx`: Voice is offered on the Free default model and not while a model on this device answers.
- `apps/mobile/__tests__/live-voice-session.test.ts`: Mobile session start, consent decline, offer and answer, cancellation.
- `apps/mobile/__tests__/LiveVoiceBackgroundCancel.test.tsx`: Backgrounding during connect ends the call.
- `apps/cli/src/voice.rs`: Inline Rust tests for the cloud-egress gate and recording file handling (about line 1228 onward).

**Test scenarios**

- **Start from an existing chat on web**
  1. Sign in on a plan with voice and pick a Cloud model.
  2. Open a chat with 3 messages.
  3. Click 'Start voice mode' and allow the microphone.
  4. Ask 'what did we just discuss?'
  - Expected: Status goes Connecting then Listening; the answer reflects the earlier messages; a voice_sessions row exists with the chat id.
- **Start from a new chat**
  1. Open the new chat landing.
  2. Click 'Start voice mode'.
  3. End the call.
  - Expected: One chat is created; spoken turns appear in it; if the start fails the empty chat is removed.
- **Local model hides voice**
  1. Select a model on this device in web.
  2. Look at the composer.
  - Expected: No 'Start voice mode' button.
- **Rejoin offer**
  1. Start voice on device A for chat X.
  2. Without ending, open chat X on device B and start voice.
  - Expected: Dialog 'This chat already has an open voice session'; choosing 'Continue that session' uses device A's voice, language, pace; device A's session is closed as superseded.
- **Mobile Local mode**
  1. Switch the app to Local mode.
  2. Tap 'Start voice mode'.
  - Expected: On-device turn-based voice opens with the note that live voice runs in AGI Cloud.
- **Plan without voice**
  1. Use an account whose plan has allowVoice false.
  2. Try to start voice.
  - Expected: Entry is hidden, or the server returns voice_usage_not_in_plan and the Upgrade message shows.

**Where to look when it fails**

- Server log events: live_voice_not_configured, live_voice_unpriced, live_voice_session_rejected, live_voice_function_tools_rejected, voice_session_not_persisted, live_voice_context_failed (route.ts).
- Error codes: voice_conversation_required, voice_usage_not_in_plan, model_may_train, voice_session_not_recorded, live_voice_malformed.
- Table voice_sessions (status, close_reason, started_at); web_messages for transcript rows.
- Browser console prefix '[voice]'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)
- Mobile: [70-qa/test-plans/mobile/048-voice-conversation-interface.md](../../70-qa/test-plans/mobile/048-voice-conversation-interface.md)
- CLI: [70-qa/test-plans/cli/048-voice-conversation-interface.md](../../70-qa/test-plans/cli/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **CLI is not a live voice conversation although the brief marks start and resume as done.** Affects: CLI users; the surface matrix.. Evidence: apps/cli/src/voice.rs:1-12, 176-300; brief S48.01, S48.02, S48.39 cite .github/workflows/release-cli.yml:229 which is a repository checkout step.. Work needed: Correct the brief and matrix, or build a CLI live path.
- **Web and desktop offer no voice for Local or own-key chats.** Affects: Web, Desktop users in Local or own-key modes.. Evidence: WebChatPage.tsx:5906-5910.. Work needed: Decide the product answer: stay Cloud only and explain why, or add a consented fork.
- **The rejoin choice does not reattach to the earlier session.** Affects: Web users with two devices.. Evidence: use-voice-session.ts:868-883; route.ts:642-665.. Work needed: Reword the dialog or reattach.
- **VS Code and Chrome have no live voice.** Affects: VS Code and Chrome users.. Evidence: No live voice file found in apps/extension-vscode or apps/extension.. Work needed: Product decision and build, or mark not planned.
- **Docs drift: experience-contract.md lists web voice as dictation only.** Affects: Anyone reading the contract.. Evidence: docs/product/experience-contract.md:641 versus ChatComposerNew.tsx:6955.. Work needed: Update the historical table or its caption.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- SYS-voice-and-media
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-authentication-and-identity
- SYS-memory-projects-and-context
- F048-02
- F048-04
- F048-06

## Unknown

- Whether the client has an overall timeout for the whole start besides the 20 second server call and 10 second ICE wait.
- How long voice_sessions rows are kept.
- What the voice provider retains of audio.
- Whether mobile supports an own-key mode for live voice (mobile only models 'cloud' and 'local' in the files read).
- Whether an earlier CLI conversation can be resumed by voice in any way beyond the agent session.
- Which plans besides Free and Pro have allowVoice true; only four tiers were seen at model-catalog.ts:1255-1391.
- Mobile VoiceInputButton.tsx and holdToTalk.ts were not opened.
