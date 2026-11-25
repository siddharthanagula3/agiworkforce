---
id: "F104-04"
type: "feature"
title: "Live updates, live voice and co-editing (not built)"
aliases: ["SSE streaming", "server-sent events heartbeat", "live voice", "WebRTC voice session", "voice/live sessions", "pairing signaling", "co-editing", "CRDT"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.17", "S104.18"]
depends_on: ["SYS-voice-and-media", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "surface:web", "surface:mobile", "mode:cloud", "table:voice_sessions", "api:POST /api/voice/live/sessions", "api:POST /api/pair/claim"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-04 Live updates, live voice and co-editing (not built)

Chat answers stream from the server over server-sent events with a 2-second keepalive. Live voice on web and mobile uses a WebRTC peer connection to a server-created Cloud session. Remote-control pairing returns a signaling address. Several people editing one document at once is not built; no CRDT code exists.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.17](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10417), [S104.18](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10418).

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

**What it does.** Streams model output as it is produced, runs a spoken two-way conversation over WebRTC, and hands a paired phone the signaling address of the relay. (apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:29-80; apps/web/features/chat/lib/live-voice-session.ts:36-58,447; apps/web/app/api/pair/claim/route.ts:100-140)

**Why it exists.** Long answers feel faster when they stream, proxies drop idle connections, and voice needs real-time audio.

**Who uses it.** Everyone who chats; people who talk to the assistant; people pairing a phone with a desktop.

**Problems it solves**

- Idle stream closed by a proxy (heartbeat comment line every 2 s).
- Silent loss of a voice session (reconnect and keepalive constants).
- A scanned QR joining a stranger's desktop (account check at pairing claim).

**Use cases**

- Watch an answer type out.
- Talk with the assistant hands free.
- Pair the phone to a desktop for remote control (hidden in v1 per owner decision in memory; the code is present).

## 2. User experience

**Where to find it**

- Streaming: any chat on web, desktop (hosted web), mobile, CLI, Chrome, VS Code.
- Live voice: web composer voice mode (VoiceModeSurface.tsx) and mobile live voice bar (LiveVoiceBar tests).

**Before you start**

- Live voice: Cloud mode, signed in, adult eligibility, microphone permission, a plan that allows voice, a secure server URL on mobile (route.ts:175-300; liveVoiceAvailability.ts:25-50).

**Screens and controls**

- Web messages: 'Microphone access was denied. Allow the microphone to use voice mode.', 'No microphone is available in this browser.', 'This browser cannot open a voice connection.' (live-voice-session.ts:61-74).
- Mobile: 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' and 'Sign in to use live voice; this chat stays turn based.' (liveVoiceAvailability.ts:22-23).

**Journey**

1. Press the voice control.
2. Browser asks for the microphone.
3. The client builds a peer connection, waits up to 10 s for ICE candidates and posts its offer to /api/voice/live/sessions.
4. The server checks account, age, plan, quota, then asks the provider for a session and returns the answer.
5. Talk; transcript and tool outputs show; end the session to settle minutes.

**What the person sees and gets**

- 'The voice connection dropped. Reconnecting.' then 'could not be restored' (live-voice-session.ts:66-68).
- 'Voice ran out of included minutes on this plan, so the session ended. Nothing was lost from the conversation.' (line 71-72).
- Limit notices '5-hour limit reached', 'Weekly limit reached', 'Monthly limit reached' with reset time (lines 258-268).

**Settings**

- Voice choice, language, pace and reasoning are sent to the server (live-voice-session.ts imports live-voices); control locations unknown.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- SSE with comment keepalives every 2 s, disconnect logging and metric (sse-heartbeat.ts:9,27-80).
- Heartbeat wrapper used by the chat completions route, resume routes and approval route (grep of withSseHeartbeat).
- Web WebRTC voice with data channel, ICE wait, disconnect grace 5 s, keepalive 15 s and timeout 60 s (live-voice-session.ts:36-58).
- Mobile WebRTC voice in the native build (liveVoiceSession.ts:1-30,170-200).
- Server session creation with CSRF, rate limit, age gate, routing slot, org policy, entitlement, capability flag 'canUseVoice', plan check, budget or free allowance and reservation (sessions/route.ts:175-420).
- Pairing claim checks account with the relay (pair/claim/route.ts).

**Incomplete**

- Pair claim is a one-time exchange with a relay; the WebSocket itself is run by a separate signaling service whose code is outside the files read (services/ folder unread).

**Present but disconnected or switched off**

- Remote control is hidden in v1 by owner decision (memory: owner-product-decisions); the claim route also runs 'remoteControlStandingRefusal' (claim/route.ts:~66).

**Not available**

- Co-editing: no Yjs or other CRDT dependency in any apps or packages package.json and no import of yjs found.
- Live voice in Local mode on mobile: not available, stays turn based (liveVoiceAvailability.ts:22-31).

## 4. Required behaviour

**Established requirements**

- S104.17: live updates reach clients over SSE streams and a WebSocket signaling server. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.17)
- S104.18: live voice uses WebRTC media with a server-created realtime session. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.18)
- T05: documents can be co-edited live through a CRDT engine. Status: platform missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.17, S104.18)
- Live voice mode is separate from dictation; if unavailable, the UI labels it unavailable. (source: (doc: docs/product/requirements.md M-VOICE-004))
- Voice privacy: the user knows whether audio is local or provider/cloud. (source: (doc: docs/product/requirements.md M-VOICE-005))

**Acceptance criteria**

1. A slow tool run still delivers ': keepalive' lines at least every 2 seconds.
2. Denying microphone permission shows the denied message and no session is billed.
3. A Free-plan user without voice allowance gets a clear refusal, not a broken control.
4. A dropped network triggers the reconnect message and either restores or ends with the failure message.
5. Mobile Local mode shows the turn-based reason.
6. Closing a voice session settles the minutes used.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Live voice is Cloud only because the session is created by a managed provider on the server [inferred from sessions/route.ts:200-215,533].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether co-editing is in scope; if so choose a CRDT library and add a presence indicator.
- [proposed] Show a plain label stating that live voice audio goes to the provider.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | withSseHeartbeat | `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts` | Keepalive and disconnect reporting. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Streaming chat endpoint using the heartbeat. |
| service | stream-transform | `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` | Wraps streams with the heartbeat. |
| service | LiveVoiceSession (web) | `apps/web/features/chat/lib/live-voice-session.ts` | Peer connection, ICE wait, data channel, reconnect, tools. |
| service | LiveVoiceSession (mobile) | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | react-native WebRTC session. |
| service | liveVoiceAvailability | `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts` | Reasons live voice is unavailable. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Creates the session after gates and reservation. |
| endpoint | /api/voice/live/sessions/[sessionId]/close/extend/settings/tools | `apps/web/app/api/voice/live/sessions/[sessionId]` | Lifecycle and tool calls. |
| endpoint | GET /api/voice/live/sessions/active | `apps/web/app/api/voice/live/sessions/active/route.ts` | Active session lookup. |
| service | voice-session-budget | `apps/web/app/api/voice/live/sessions/lib/voice-session-budget.ts` | Budget assessment. |
| service | voice-session-settlement | `apps/web/app/api/voice/live/sessions/lib/voice-session-settlement.ts` | Settle minutes and abandoned sessions. |
| service | free-voice-allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Free voice seconds. |
| table | voice_sessions | `apps/web/db/neon/0260_voice_sessions.sql` | Voice session records (create at line 27). |
| endpoint | POST /api/pair/claim | `apps/web/app/api/pair/claim/route.ts` | Claims a pairing with the relay and returns its payload. |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Voice UI. |
| config | voice_live routing slot | `apps/web/app/api/voice/live/sessions/route.ts` | Model chosen by slot, not literal (lines 183-195). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chat request opens a streaming response; heartbeat comments are added when idle. | our servers | sse-heartbeat.ts:44-75 |
| Client reads the stream and updates the message list. | device | useChatStream.ts (web); not read in detail |
| Voice: client captures microphone, builds an SDP offer after ICE gathering. | device | live-voice-session.ts:304-330,447 |
| Server verifies CSRF, rate limit, age, plan, quota; reserves usage. | our servers | sessions/route.ts:175-420 |
| Server posts the offer to the managed provider and returns its answer. | outside service | sessions/route.ts:533,561,612-621 |
| Audio flows peer to provider; tool calls come back through our tools endpoint. | outside service | live-voice-session.ts:20-31 (LiveVoiceToolBridge) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Voice session record and usage reservation | table voice_sessions and usage tables | server | abandoned sessions settled on next start (sessions/route.ts:~397) |
| Audio and transcript | Not stored by this route as far as read; transcript in chat when kept | unknown | unknown |
| Pairing record | Relay service; audit event remote_pairing_claimed in workspace audit | server | unknown |

**Models and providers.** The live voice model comes from the 'voice_live' routing slot and must be a managed provider (sessions/route.ts:183-195); a reasoning backend model is chosen by plan (route.ts:~343). Streaming works with any model route.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; adult eligibility gate for voice (sessions/route.ts:180-186). |
| Permissions | Microphone permission; capability 'canUseVoice' must be on (route.ts:300-310). |
| Subscription | Plan must allow voice (getTierPolicy allowVoice); non-Free plans reserve usage blocks and check voice_minutes allowance; Free plans use a seconds allowance (route.ts:312-420). |
| Limits and metering | Voice billed in blocks (LIVE_VOICE_BLOCK_SECONDS), 5-hour, weekly and monthly limits reported with reset times (live-voice-session.ts:258-268). |
| Feature flags | canUseVoice capability flag; remote-control standing refusal for pairing. |
| Model compatibility | voice_live slot must resolve to a live model. |
| Provider restrictions | Managed provider ids only (isManagedProviderId). |
| Local mode | Streaming is network-based in Cloud and own-key; Local on-device streams are in-process (F104-06). Live voice is not available in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Microphone denied or missing | Named errors. | live-voice-session.ts:276-290 |
| Browser unsupported | 'This browser cannot open a voice connection.' | live-voice-session.ts:447-450 |
| ICE slow | Proceeds after 10 s. | live-voice-session.ts:36,296-312 |
| Disconnect | 5 s grace then reconnect message. | live-voice-session.ts:38,66-68 |
| Usage exhausted | Message with reset time; HTTP 402 not in plan. | live-voice-session.ts:240-268; sessions/route.ts:355 |
| Stream client drops | Logged 'sse_stream_disconnected' and failure metric. | sse-heartbeat.ts:23-26 |
| Pairing code wrong or used | 404, 409, 403 mapped to named errors. | pair/claim/route.ts:118-135 |
| Voice permission and failure messages beyond these | not verified. | brief |
| Co-editing conflicts | not handled in the code; no feature. | no CRDT dependency |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.test.ts`: Heartbeat.
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Web voice session.
- `apps/web/app/api/voice/live/sessions/route.test.ts`: Session creation.
- `apps/web/app/api/voice/live/sessions/lib/__tests__/voice-session-budget.test.ts`: Budget.
- `apps/web/app/api/voice/live/sessions/lib/__tests__/voice-session-settlement.test.ts`: Settlement.
- `apps/web/app/api/pair/claim/__tests__/route.test.ts`: Pairing claim.
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Mobile live voice bar.
- `apps/mobile/__tests__/LiveVoiceBackgroundCancel.test.tsx`: Cancel when backgrounded.

**Test scenarios**

- **Keepalive**
  1. Start a chat with a slow tool.
  2. Watch the raw stream.
  - Expected: ': keepalive' appears while idle.
- **Mic denied**
  1. Deny the microphone, press voice.
  - Expected: Denied message; no usage reserved.
- **Free voice**
  1. As a Free user start live voice twice past the allowance.
  - Expected: Refusal with reset time.
- **Network drop**
  1. During a voice session disable the network for 10 s.
  - Expected: Reconnecting message, then restore or failure.
- **Mobile Local**
  1. Switch mobile chat to Local, open voice.
  - Expected: Turn-based reason text.
- **Co-edit**
  1. Open one artifact in two accounts.
  - Expected: No live shared cursor; feature absent.

**Where to look when it fails**

- Log event sse_stream_disconnected.
- Log event voice_session_expiry_failed.
- Table voice_sessions.
- Error codes microphone_denied, usage_exhausted, http_<status>.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Co-editing not built.** Affects: All apps. Evidence: no CRDT import; brief T05 missing. Work needed: Decide scope, choose engine, add server relay.
- **Brief says pair/claim returns a WebSocket address; the route returns the relay's payload (shape in signalingClaimSchema) and the WebSocket service is outside the files read.** Affects: Remote control. Evidence: claim/route.ts:140-165. Work needed: Read the relay service and update the brief.
- **Voice failure and permission messages beyond the named ones not verified.** Affects: Web, mobile. Evidence: brief. Work needed: Test.
- **Desktop, Chrome, VS Code live voice not read.** Affects: Those apps. Evidence: not opened. Work needed: Read and record.

**Depends on**

- SYS-voice-and-media
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- surface:web
- surface:mobile
- mode:cloud
- table:voice_sessions
- api:POST /api/voice/live/sessions
- api:POST /api/pair/claim

## Unknown

- Who hosts the signaling WebSocket and its code location.
- Whether audio or transcripts are stored.
- Desktop, Chrome, VS Code and CLI live voice.
- How clients resume a broken stream (resume routes exist: runs/[runId]/resume, not read).
