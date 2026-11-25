---
id: "F049-05"
type: "feature"
title: "Live voice with streaming text"
aliases: ["Live voice", "Voice mode", "Streaming transcription", "Live voice session", "Voice composer", "Live voice bar", "S49.10"]
area: "49 Dictation, transcription, and recording"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S49.10"]
depends_on: ["SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:POST /api/voice/live/sessions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-05 Live voice with streaming text

A spoken, two-way conversation with the assistant. The client opens a live session on the server, streams audio over a peer connection and reads transcript updates as words are spoken. Web, desktop and phone have it. The CLI, Chrome and VS Code do not.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.10](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4910).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Streams the person's speech to a live voice provider through a session created by the server, and shows input and output transcript text as it arrives; the assistant answers by voice. (apps/web/features/chat/lib/live-voice-session.ts:488-540, 996-1020; apps/web/app/api/voice/live/sessions/route.ts:533-565)

**Why it exists.** Brief S49.10 asks for streaming transcription with text during speech. Requirements say live voice is separate from dictation. (doc: docs/product/requirements.md:918, 1003)

**Who uses it.** Signed-in people with a plan that allows voice, or Free users within the monthly allowance.

**Problems it solves**

- Hands-free conversation.
- Natural interruption of the assistant while it speaks.

**Use cases**

- Web user clicks 'Start voice mode', talks, sees the live transcript, ends the session.
- Phone user starts live voice and pauses the call.
- User types a message during voice mode, which is sent as a normal turn.

## 2. User experience

**Where to find it**

- Web and desktop: 'Start voice mode' button in the composer when the field is empty and the capability allows (apps/web/features/chat/components/Composer/VoiceEntryButton.tsx:9; ChatComposerNew.tsx:6951-6955).
- Voice composer with labels 'Turn off microphone' / 'Turn on microphone', 'End voice session', and a typing field 'Type a message to send as a normal turn' (apps/web/features/chat/components/Voice/VoiceComposer.tsx:10-20).
- Phone: live voice bar with pause, mute and call time (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:231-232).

**Before you start**

- Signed in; plan allows voice (getTierPolicy(plan).allowVoice) or Free allowance remains; capability canUseVoice not closed (route.ts:299-322); microphone permission; on phone a first-use disclosure sheet (VoiceOnboardingSheet.tsx VOICE_DISCLOSURE).

**Screens and controls**

- Web: mute toggle (Space when the field is empty), type field with Enter to send, round close control or Escape to end (VoiceComposer.test.tsx cases).
- Phone: status text such as 'Connecting live voice...', 'Listening', 'Muted, tap the mic to talk', 'Speaking, talk any time to interrupt', 'Reconnecting live voice...', 'Live voice stopped' (LiveVoiceBar.tsx:166-182).

**Journey**

1. Person starts voice mode.
2. The client asks the microphone, builds a peer connection, and posts its offer to /api/voice/live/sessions.
3. Server checks entitlement, voice budget or free allowance, builds instructions and tools, calls the live provider, and returns the answer and session id.
4. Audio streams; transcript delta events update the screen.
5. Person talks, types, mutes or ends; the client closes the session through the close endpoint, which settles usage.

**What the person sees and gets**

- Live transcript text and status label; error states with plain messages from describeLiveSessionFailure (route.ts:92).

**Settings**

- Web Settings > Voice: voice carousel, live voice language picker and reasoning level (VoiceSection.tsx:93-100 area).
- Phone Settings > Voice for voice mode and audio route.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server session creation with entitlement, voice budget block reservation, free allowance grant, settlement of abandoned sessions (route.ts:286-420, 533-731; apps/web/app/api/voice/live/sessions/lib/voice-session-settlement.ts).
- Sub-routes: active, [sessionId]/close, extend, settings, tools (apps/web/app/api/voice/live/sessions/).
- Web client: peer connection, data channel, keepalive 15 s, disconnect grace 5 s, transcript deltas (live-voice-session.ts:41-55, 488-540, 996-1020).
- Phone client: same server contract through liveVoiceSession.ts (LIVE_VOICE_SESSION_PATH use at line 343), pause and elapsed timer (LiveVoiceBar.tsx).
- Desktop shows the web app so it shares the web client.

**Incomplete**

- The brief marks the API missing for streaming, but /api/voice/live/sessions exists and works as the streaming session API (apps/web/app/api/voice/live/sessions/route.ts:731).

**Present but disconnected or switched off**

- Voice is blocked when the plan policy has allowVoice false (route.ts:312-322).

**Not available**

- CLI, Chrome and VS Code: no streaming dictation (brief S49.10; CLI voice.rs is batch).

## 4. Required behaviour

**Established requirements**

- Speech is transcribed as it streams, with text arriving during speech. (source: brief S49.10)
- Live voice mode is separate from dictation; if unavailable, the UI labels it unavailable. (source: docs/product/requirements.md:1003)
- Voice privacy is documented: user knows whether audio is local or provider/cloud. The phone discloses that audio streams directly between the device and the voice provider and the transcript is saved to the chat. (source: docs/product/requirements.md:1005; apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx (VOICE_DISCLOSURE.live))
- Voice transcripts are ordinary chat messages, so export and deletion follow the chat. (source: docs/decisions/2026-09-27-founder-decisions.md:250-255 (D-2026-09-28-12))

**Acceptance criteria**

1. Start voice mode on web: session POST returns 201 and transcript text appears while speaking.
2. End the session: close endpoint is called and usage is settled.
3. Free account with the allowance used: session start is refused with an allowance error.
4. Network drop: client reconnects within the grace window or ends with a clear state.
5. Phone: pause stops the call clock and listening.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Transcript text is saved to the conversation [inferred from the phone disclosure and from D-2026-09-28-12].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Document that the brief's API-missing status refers to a provider-facing streaming API, if that was the intent.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Create a live session |
| endpoint | sessions close/extend/settings/tools/active | `apps/web/app/api/voice/live/sessions` | Session lifecycle and tool calls |
| service | voice-session-settlement | `apps/web/app/api/voice/live/sessions/lib/voice-session-settlement.ts` | Settle ended or abandoned sessions |
| service | voice-session-budget | `apps/web/app/api/voice/live/sessions/lib/voice-session-budget.ts` | Budget assessment per block |
| service | live-voice-billing | `apps/web/lib/voice/live-voice-billing.ts` | Block size, lease, charge and failure text |
| service | live-voice-session (web) | `apps/web/features/chat/lib/live-voice-session.ts` | Web peer connection, events, keepalive, close |
| component | VoiceComposer | `apps/web/features/chat/components/Voice/VoiceComposer.tsx` | Voice mode composer UI |
| component | VoiceEntryButton | `apps/web/features/chat/components/Composer/VoiceEntryButton.tsx` | 'Start voice mode' button |
| service | liveVoiceSession (mobile) | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | Phone live session client |
| component | LiveVoiceBar | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | Phone live voice UI with pause and timer |
| component | VoiceOnboardingSheet | `apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx` | Live disclosure text |
| service | free-voice-allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Free plan monthly seconds, use 'live' or 'dictation' |
| config | canUseVoice capability | `apps/web/app/api/voice/live/sessions/route.ts` | assertCapabilityAvailable 'canUseVoice' (line 300) |
| other | live voices | `apps/web/features/chat/lib/live-voices.ts` | Voice list and reasoning levels |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client captures the microphone and creates a WebRTC offer with a data channel. | device | live-voice-session.ts:488-500; liveVoiceSession.ts:304-341 |
| Client posts the offer and settings to /api/voice/live/sessions. | device and our servers | live-voice-session.ts:528; liveVoiceSession.ts:343 |
| Server checks subscription access, canUseVoice, plan voice policy, voice budget or free allowance, privacy rules, then builds instructions and tools. | our servers | route.ts:286-420, 500-530 |
| Server calls the live provider's live/sessions endpoint with the offer and returns the answer description. | outside service | route.ts:533-565, 612-621 |
| Audio flows between the device and the provider; transcript delta events reach the client. | outside service | live-voice-session.ts:996-1014; mobile disclosure 'streams directly between this device and the voice provider' |
| Tool calls the model makes come back to the server through the tools route. | our servers | live-voice-session.ts:747; liveVoiceSession.ts:429 |
| On end, the client calls close; server settles usage; expired sessions are settled by a sweep. | our servers | live-voice-session.ts:330; route.ts (settleAbandonedVoiceSessions import); free-voice-allowance.ts:25-31 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Session record and usage blocks | Voice session store tables (voice-session-store.ts; names not opened) | Server side | unknown |
| Transcript text | Conversation messages (inferred) | Follows chat sync | Follows chat deletion (doc: docs/decisions/2026-09-27-founder-decisions.md:250-255) |
| Audio | Not stored by our code found; streams to provider | No | Provider retention unknown |

**Models and providers.** The live model and a backend model come from the catalog (getVoiceLiveBackendModel, getRoutingSlotModel imports at route.ts:36-41). The provider is resolved in the route (providerApiUrl(provider, 'live/sessions'), route.ts:533). Training opt-out rules are applied (NO_TRAINING_VOICE_MESSAGE import, route.ts:52-55). Which provider folder it resolves to was not established.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in required (getClerkAuthUser in route). |
| Permissions | Microphone; tool approvals follow the user's tool approval policy and workspace web domain policy (route.ts:515-525). |
| Subscription | Plan policy allowVoice; voice budget block funded by plan; voice_minutes unit allowance; Free plan uses monthly free seconds (route.ts:312-380). |
| Limits and metering | Billed in blocks with a lease (LIVE_VOICE_BLOCK_SECONDS, LIVE_VOICE_LEASE_SECONDS in live-voice-billing); extend route renews; allowance shared with dictation ('same voice allowance': use 'live' / 'dictation' in free-voice-allowance.ts:18). |
| Feature flags | Capability canUseVoice through the feature-flag gate (route.ts:299-310). |
| Model compatibility | Backend model must allow the voice tools; reasoning level depends on plan (resolveLiveVoiceReasoning). |
| Provider restrictions | Refused where the provider may train and the user's privacy setting forbids (route.ts:52-55 imports). |
| Local mode | Not available as Local. The session needs the server and an outside provider; phone discloses audio streams to the provider (VoiceOnboardingSheet VOICE_DISCLOSURE). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connecting | 'Connecting live voice...' status | LiveVoiceBar.tsx:174 |
| Reconnecting | Disconnect grace of 5 s then reconnect state or end | live-voice-session.ts:45; LiveVoiceBar.tsx:173 |
| Muted / interrupted / paused | Status texts and clock stops while paused | LiveVoiceBar.tsx:166-182, 209 |
| Keepalive lost | Keepalive every 15 s, timeout 60 s | live-voice-session.ts:46-47 |
| Usage exhausted | 402 with allowance error; voice budget not in plan | route.ts:355-370 |
| Background cancel / audio route change | Phone handles background cancel and route notices (tests) | apps/mobile/__tests__/LiveVoiceBackgroundCancel.test.tsx; LiveVoiceAudioRouteNotice.test.tsx |
| Session abandoned | Settled by sweep | route.ts import settleAbandonedVoiceSessions; transcriptions/route.ts:632-640 |
| Accessibility | VoiceComposer has labelled group and controls; a11y test exists | apps/web/features/chat/components/Voice/__tests__/VoiceComposer.a11y.test.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `test:apps/web/features/chat/lib/live-voice-session.test.ts` (not found): Web session lifecycle, transcript finalisation, microphone release, close with bearer, reasoning level
- `test:apps/web/features/chat/components/Voice/VoiceComposer.test.tsx` (not found): Composer controls and keyboard
- `test:apps/web/features/chat/components/Voice/__tests__/VoiceComposer.a11y.test.tsx` (not found): Accessibility
- `test:apps/web/app/api/voice/live/sessions/route.test.ts` (not found): Session creation route
- `test:apps/web/app/api/voice/live/sessions/lib/__tests__/voice-session-settlement.test.ts` (not found): Settlement
- `test:apps/web/app/api/voice/live/sessions/lib/__tests__/voice-session-budget.test.ts` (not found): Budget
- `test:apps/mobile/__tests__/live-voice-session.test.ts` (not found): Phone live session client
- `test:apps/mobile/__tests__/LiveVoiceBar.test.tsx` (not found): Phone live voice bar
- `test:apps/web/lib/voice/__tests__/free-voice-allowance.test.ts` (not found): Allowance grants

**Test scenarios**

- **Start and end on web**
  1. Sign in on a paid plan
  2. Click Start voice mode
  3. Speak a sentence
  4. Click End voice session
  - Expected: Transcript appears while speaking; close request settles usage.
- **Free allowance exhausted**
  1. Use a Free account after the monthly minutes are spent
  2. Start voice mode
  - Expected: Refusal with an allowance message; no session created.
- **Phone pause**
  1. Start live voice
  2. Tap pause
  - Expected: Call clock stops and status shows paused.
- **Network drop**
  1. Start a session
  2. Disable the network for under 5 s
  - Expected: Session survives; longer drops show a reconnecting or stopped state.
- **CLI absence**
  1. Run /voice in the CLI
  - Expected: Batch push-to-talk only, no streaming text.

**Where to look when it fails**

- Server events live_voice_context_failed, live_voice_context_source_failed (route.ts:495-505), voice_session_expiry_failed.
- Client status 'Live voice stopped'.
- Voice session store tables via voice-session-store.ts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/web/049-dictation-transcription-and-recording.md)
- Desktop: [70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md)
- Mobile: [70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md)

## 10. Gaps and dependencies

- **Brief marks API streaming missing, yet a session API exists.** Affects: Brief accuracy. Evidence: apps/web/app/api/voice/live/sessions/route.ts:731. Work needed: Update the brief or clarify the meaning.
- **No streaming dictation text in CLI, Chrome, VS Code.** Affects: CLI, Chrome, VS Code. Evidence: brief S49.10. Work needed: Product decision; founder decisions say leaders have no interim dictation text (docs/decisions/2026-09-27-founder-decisions.md:128).
- **Live voice is cloud only; no Local or own-key live mode.** Affects: Users in Local or own-key mode. Evidence: route.ts:533 provider call; mobile disclosure. Work needed: Product decision.
- **Which provider and models the live session uses is not documented in the pages read.** Affects: Docs. Evidence: route.ts:36-41. Work needed: Read getVoiceLiveBackendModel to document.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:POST /api/voice/live/sessions

## Unknown

- Which provider folder and model the live session resolves to.
- Exact database tables for voice sessions.
- Whether transcripts are written to the conversation by the client or the server.
- Whether the desktop has any live voice behaviour that differs from web.
- How the brief's API-missing status was decided.
