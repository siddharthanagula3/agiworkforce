---
id: "AREA-048"
type: "area"
title: "Voice conversation interface"
features: ["F048-01", "F048-02", "F048-03", "F048-04", "F048-05", "F048-06", "F048-07", "F048-08", "F048-09", "F048-10", "F048-11", "F048-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 48. Voice conversation interface

A person talks to the assistant out loud and hears it answer, inside a chat. The spoken turns land in the same transcript as typed turns, so the person can switch between talking and typing. It matters because it is the hands-free way to get work done, and it runs tools and approvals while the person is still talking.

**Who uses it.** Web and mobile live voice is gated by plan. The server checks the plan's allowVoice flag and returns a not-in-plan error otherwise (apps/web/app/api/voice/live/sessions/route.ts:311-317). Plans with a free time allowance use that allowance; other plans use a budget check and a usage reservation (route.ts:346-373). Signed-in users only, since the route needs a user and a conversation (route.ts:246-262). Desktop uses the web code in its cloud window. The CLI has only push-to-talk speech-to-text, not live conversation (apps/cli/src/voice.rs:1-12). Workspace policy is checked through the managed-compute and training-opt-out gates (route.ts:290-340). Not verified: whether admin-only switches exist beyond those gates.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F048-01](F048-01-start-or-resume-a-voice-conversation.md) | Start or resume a voice conversation | built | built | built | built | no | no |
| [F048-02](F048-02-transcript-captions-and-full-screen-layout.md) | Transcript, captions and full-screen layout | built | built | built | built | n/a | n/a |
| [F048-03](F048-03-listening-speaking-and-working-indicators.md) | Listening, speaking and working indicators | built | built | built | built | n/a | n/a |
| [F048-04](F048-04-microphone-and-call-controls.md) | Microphone and call controls | built | built | built | partly | n/a | n/a |
| [F048-05](F048-05-push-to-talk-and-interrupting-the-reply.md) | Push-to-talk and interrupting the reply | partly | partly | partly | built | n/a | n/a |
| [F048-06](F048-06-voice-language-and-voice-preview.md) | Voice, language and voice preview | partly | partly | partly | built | n/a | n/a |
| [F048-07](F048-07-audio-devices-microphone-and-speaker.md) | Audio devices (microphone and speaker) | partly | partly | n/a | no | n/a | n/a |
| [F048-08](F048-08-typing-alongside-voice.md) | Typing alongside voice | built | built | built | built | n/a | n/a |
| [F048-09](F048-09-tool-activity-approvals-and-documents-during-voice.md) | Tool activity, approvals and documents during voice | built | built | partly | built | n/a | n/a |
| [F048-10](F048-10-reconnection-and-usage-limit.md) | Reconnection and usage limit | built | built | built | n/a | n/a | n/a |
| [F048-11](F048-11-camera-screen-images-picture-in-picture-and-backgr.md) | Camera, screen, images, picture-in-picture and background | partly | partly | partly | n/a | n/a | n/a |
| [F048-12](F048-12-remote-coding-session-voice-control.md) | Remote coding session voice control | built | built | no | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/048-voice-conversation-interface.md](../../10-requirements/capabilities/048-voice-conversation-interface.md).

## How this area works in the code

1. **Person starts voice from a chat.** The chat page switches to voice mode when the voice session is active (WebChatPage.tsx:6671, 7201). On mobile the chat input's voice button starts a live session (ChatInput.tsx:1219, per brief). A new chat is created first if none exists (mobile voice.tsx:262-281). (`apps/web/features/chat/pages/WebChatPage.tsx:6671`, `apps/mobile/app/(app)/voice.tsx:262-281`)
2. **Browser opens the microphone and the session.** The web session asks for the microphone with echo cancellation, noise suppression and automatic gain control, then sends a WebRTC offer (a standard way to open a live audio link). Mute state is applied to the microphone track before and after the link opens. (`apps/web/features/chat/lib/live-voice-session.ts:478-486`, `apps/web/features/chat/lib/live-voice-session.ts:513-514`, `apps/web/features/chat/lib/live-voice-session.ts:563-564`, `apps/web/features/chat/lib/live-voice-session.ts:772-786`)
3. **Server gates the request.** The route checks the speech-provider key, the conversation id, the price table, the user's plan, the capability flag, the subscription access, the training opt-out and the Google user-data rule. Any failure returns a clear error code (403, 402, 503). (`apps/web/app/api/voice/live/sessions/route.ts:230-262`, `apps/web/app/api/voice/live/sessions/route.ts:269-280`, `apps/web/app/api/voice/live/sessions/route.ts:289-340`)
4. **Server reserves time or budget.** Plans with a free allowance get seconds from the free allowance. Other plans must fit a budget and a voice-minutes quota, then a usage reservation is made with a lease (ten minutes). (`apps/web/app/api/voice/live/sessions/route.ts:346-383`, `apps/web/lib/voice/free-voice-allowance.ts:47`, `apps/web/lib/voice/live-voice-billing.ts:20`, `apps/web/lib/voice/live-voice-billing.ts:28`)
5. **Server opens the realtime link.** The route sends the offer to the realtime voice provider with the chosen voice, language, pace and reasoning. It blocks the browser from changing the backend model, tools or reasoning. Only mute and unmute are allowed from the browser. (`apps/web/app/api/voice/live/sessions/route.ts:128-140`, `apps/web/app/api/voice/live/sessions/route.ts:154-155`, `apps/web/app/api/voice/live/sessions/route.ts:264-267`, `apps/web/app/api/voice/live/sessions/route.ts:723`)
6. **Voice turns go into the chat and tools.** A finished spoken turn is sent as a normal chat message to the chosen model, and the reply is read back from the chat store. Tool output is trimmed before the voice model reads it. Approvals wait on screen. (`apps/mobile/app/(app)/voice.tsx:262-281`, `apps/web/lib/voice/live-voice-tool-runner.ts:120-132`, `apps/web/features/chat/lib/live-voice-session.ts:418`)
7. **Pause, mute and cancel.** Mute is sent to the realtime link. Pause ends the live link on web. Cancel-task ends pending delegations and tool work and tells the assistant the task stopped. (`apps/web/features/chat/hooks/use-voice-session.ts:942-969`, `apps/web/features/chat/lib/live-voice-session.ts:1187-1196`)
8. **End, close and settle.** Ending closes the session on the server, which settles the usage. On web the session also ends when the page is hidden. On mobile the session ends when the app goes to background. (`apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts:93-120`, `apps/web/features/chat/hooks/use-voice-session.ts:926`, `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:486-490`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/voice/live/sessions/route.ts` | Server route that checks the plan, the budget, the training rules and the usage reservation, then opens the realtime voice link. |
| `apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts` | Server route that closes a voice session and settles its usage. |
| `apps/web/app/api/voice/live/sessions/[sessionId]/settings/route.ts` | Server route that saves the voice, language, pace and reasoning settings for a session. |
| `apps/web/features/chat/lib/live-voice-session.ts` | Browser client for the live voice link: microphone, offer, mute, playback, cancel-task. |
| `apps/web/features/chat/hooks/use-voice-session.ts` | Web state hook for voice: start, pause, resume, mute, end, page-hide handling. |
| `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Web full voice view: orb, status, pause, resume, usage notice, tool activity, approvals. |
| `apps/web/features/chat/components/Voice/VoiceComposer.tsx` | Web voice control bar: mute, captions, output route, end. |
| `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | Mobile voice session hook; ends the session when the app goes to background. |
| `apps/mobile/app/(app)/voice.tsx` | Mobile full voice screen; creates a conversation if needed and sends spoken turns as chat messages. |
| `apps/web/lib/voice/live-voice-tool-runner.ts` | Runs tools for a voice turn and trims their output for the voice model. |
| `apps/web/lib/voice/free-voice-allowance.ts` | Free voice time allowance: grant, read, settle per period. |
| `apps/cli/src/voice.rs` | CLI push-to-talk speech-to-text module; no live conversation. |

## What is stored

- Voice session settings and records (voice, language, pace, reasoning, usage): Written by the voice session store imported at apps/web/app/api/voice/live/sessions/route.ts:118-126 and settings at route.ts:723. Storage engine not traced.
- Usage reservation for a voice session: Managed usage request service, reserveManagedUsageRequest at apps/web/app/api/voice/live/sessions/route.ts:373. Storage engine not traced.
- Free voice seconds used per user and period: Database adapter tables read and written in apps/web/lib/voice/free-voice-allowance.ts:79-153 (lock, readSession, readConsumedSeconds).
- Chat transcript of spoken turns: Chat message store; spoken turns are sent as normal chat messages (apps/mobile/app/(app)/voice.tsx:262-281). Web storage not traced.
- Mobile push-to-talk preference: Device settings store field voicePushToTalk (apps/mobile/stores/settingsStore.ts:54, 132, 153). Persistence layer not traced.
- Web microphone choice (used by dictation, not live voice): Voice input store field microphoneId (apps/web/features/chat/stores/voice-input-store.ts:40, 282, 432). Persistence not traced.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **canUseVoice capability flag**: Blocks voice for a user, workspace, role, plan or surface when off. (apps/web/app/api/voice/live/sessions/route.ts:300-310)
- **allowVoice in plan policy**: Returns not-in-plan (403) when the plan does not allow voice. (apps/web/app/api/voice/live/sessions/route.ts:311-317)
- **Free voice allowance by plan**: Null means use the budget path; a number is the free seconds per period. (apps/web/app/api/voice/live/sessions/route.ts:346; apps/web/lib/voice/free-voice-allowance.ts:47)
- **Voice backend model by plan**: Chooses the live model behind a session; it must be live or the request fails. (apps/web/app/api/voice/live/sessions/route.ts:319-323)
- **Training opt-out and Google user-data rule**: Blocks voice when the model may train on inputs and the user has opted out, or the conversation holds Google user data. (apps/web/app/api/voice/live/sessions/route.ts:324-340)
- **Speech provider key**: Missing key returns 503 live_voice_not_configured. (apps/web/app/api/voice/live/sessions/route.ts:129, 233-244)
- **Voice push-to-talk preference (mobile)**: Off by default; on means hold to record and release to send. (apps/mobile/stores/settingsStore.ts:132; apps/mobile/app/(app)/voice.tsx:195-196)
- **Voice pace range and default**: Clamps the speaking pace requested. (apps/web/app/api/voice/live/sessions/route.ts:118-124, 266)
- **Microphone and voice sample manifest**: Empty sample manifest hides Play sample. (apps/web/public/voice-samples/manifest.json)

## Shared between apps

[{"what": "Server route for live voice, billing, budget, training gates and tool output limits", "where": "Web server route; desktop uses the same web code in its cloud window. Mobile calls the same product API (endpoint not traced)."}, {"what": "Shared voice UI pieces: orb and session state machine", "where": "packages/ui/unified-chat/src/components/VoiceOrb.tsx and packages/ui/unified-chat/src/voice/voice-session-machine.ts (listed in the brief; not opened)."}, {"what": "Shared live-voice contracts and constants", "where": "apps/web/app/api/voice/live/sessions/route.ts:8 imports from @agiworkforce/cloud-contracts; route.ts:70-72 imports voice constants from @features/chat/lib/live-voices."}, {"what": "Separate per app", "where": "Web session client (apps/web/features/chat/lib/live-voice-session.ts), mobile session client (apps/mobile/src/features/voice/services/liveVoiceSession.ts), desktop window policy (apps/desktop/electron/windowPolicy.ts), and CLI speech-to-text (apps/cli/src/voice.rs)."}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says CLI is done for many live-conversation items (start, transcript, listening, working, end, captions, approvals, documents, resume). The CLI voice module is documented as push-to-talk speech-to-text only. (apps/cli/src/voice.rs:1-12; brief cites apps/cli/src/voice.rs:956, which is a WAV writing step at apps/cli/src/voice.rs:950-960)
- Pause ends the live link on web, while the Should says pause keeps the conversation without ending it. The resume path is not fully traced. (apps/web/features/chat/hooks/use-voice-session.ts:942-955)
- No barge-in handling found: no speech-start or interrupt event handling in the web session, the route, or the mobile session. Brief marks barge-in unverified; the code shows no handling. (apps/web/app/api/voice/live/sessions/route.ts:330-339 (the brief cites line 339, which is a training-policy check))
- Brief cites this line for opening a generated document. The line is output trimming for voice tool results. (apps/web/lib/voice/live-voice-tool-runner.ts:120-132 (brief cites line 128))
- Live voice always uses the default microphone. A microphone choice exists for dictation, but the live session does not pass a device id. (apps/web/features/chat/lib/live-voice-session.ts:480-483; apps/web/features/chat/stores/voice-input-store.ts:282)
- Mobile and web end the live session when the app or page goes to the background. This matches the missing background setting, but it means voice cannot continue in background at all. (apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:486-490; apps/web/features/chat/hooks/use-voice-session.ts:926)
- A session cannot start without a conversation id. The Should says a new conversation is created for the control, so the client must create it first. (apps/web/app/api/voice/live/sessions/route.ts:254-262)

## Not established

- Storage engine for voice session records and the usage reservation (not traced past the imports).
- Whether pause fully reopens the link on resume (use-voice-session.ts:950-955 only shows state change and unmute).
- Whether barge-in is handled inside the realtime voice provider's own turn handling; no code in this repo was found for it.
- Mobile voice endpoint: which route the mobile session calls (apps/mobile/src/features/voice/services/liveVoiceSession.ts not traced past the entry points).
- Whether the CLI has a live conversation elsewhere; only apps/cli/src/voice.rs was opened.
- Several brief citations were not opened (apps/web/features/chat/hooks/use-voice-session.ts:380, apps/web/features/chat/stores/voice-session-store.ts:111, the packages/ui unified-chat files, and the remote coding files).
- Admin or workspace settings for voice beyond the managed-compute and training gates.
- Exact free-allowance numbers per plan (only the function at free-voice-allowance.ts:47 was read).
- No tests, builds or servers were run; this was read-only research, so the relayed localhost and one-surface testing instruction was not exercised here.
