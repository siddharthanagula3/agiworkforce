---
id: "F102-11"
type: "feature"
title: "Live voice sessions"
aliases: ["Live voice sessions", "Realtime audio session service (S102.30)", "live voice", "voice mode (the button label 'Start voice mode')", "voice_live routing slot", "POST /api/voice/live/sessions"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.30"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-voice-and-media", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-memory-projects-and-context", "mode:cloud", "surface:web", "surface:mobile", "table:voice_sessions", "provider:openai", "api:POST /api/voice/live/sessions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-11 Live voice sessions

A live voice chat. The signed-in client sends a WebRTC offer to the server, which checks age, plan and policy, reserves minutes, asks the voice provider to create a session, records it and returns the answer. Web and mobile clients use it. Local Mode stays turn based.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.30](../../10-requirements/capabilities/102-runtime-inventory.md#s10230).

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

**What it does.** The server route POST /api/voice/live/sessions creates a realtime voice session with the provider chosen by the 'voice_live' routing slot, delegating thinking to a plan-dependent backend model, and gives the client the connection answer (apps/web/app/api/voice/live/sessions/route.ts:171-731). Companion routes manage the running session: active (read), close, extend (next minute), settings (voice, language, pace), tools (tool decisions).

**Why it exists.** People want to talk to the assistant like the leaders' voice modes. The decision record fixes the provider's live API for it (doc: docs/decisions/2026-09-27-founder-decisions.md:170-176).

**Who uses it.** Signed-in users on Web, Mobile and Desktop (the desktop shows the hosted web app). The request schema accepts surface web, mobile or desktop (route.ts:151).

**Problems it solves**

- Hands-free conversation with low delay.
- Charging and limiting voice minutes through the same usage budget as chat.
- Keeping voice out of models that may train on the user's data when the user opted out.

**Use cases**

- Tap 'Start voice mode' on the web composer and talk.
- Tap 'Start voice mode' on the phone in a Cloud chat.
- Change the voice or pace mid-call.
- Free-plan user spends a monthly allowance of live voice minutes.

## 2. User experience

**Where to find it**

- Web: composer button 'Start voice mode' (apps/web/features/chat/components/Composer/VoiceEntryButton.tsx:9); exit control 'End voice session' (Voice/VoiceComposer.tsx:16).
- Mobile: composer button 'Start voice mode' (ChatInput.tsx:2293), 'End live voice' (LiveVoiceBar.tsx:746), 'Exit voice mode' (VoiceInlineBar.tsx:190).
- Desktop (Electron): shows the hosted web app, so the same web controls [inferred from AGENTS.md section 5].
- CLI, VS Code, Chrome: no use of this route found (grep of 'voice/live/sessions' found only web and mobile clients).

**Before you start**

- Signed-in account, adult eligibility confirmed, a plan that allows voice (free plan has a monthly allowance), an existing conversation id, a secure connection and, on mobile, a build with the WebRTC native module (liveVoiceAvailability.ts:29-47).
- Cloud mode: in Local Mode live voice is refused with a reason (liveVoiceAvailability.ts:17-27).

**Screens and controls**

- Voice entry button, live bar with mute and end controls, voice and pace settings, tool approval notices.
- Reasoning level choice accepted by the API (route.ts:150-155).

**Journey**

1. 1. Person taps 'Start voice mode'.
2. 2. The client creates a WebRTC offer and POSTs it with the conversation id, voice, language, pace and surface (live-voice-session.ts:528).
3. 3. The server checks CSRF, rate limit, age gate, slot model, managed-compute, organisation, spend and model policy gates (route.ts:171-232).
4. 4. It resolves the plan, confirms voice is allowed, picks the backend model, applies the no-training rule, and reserves one minute or grants free allowance seconds (route.ts:~296-428).
5. 5. It loads context (project, memory, recent turns) and tools, and asks the provider to create the session (route.ts:~430-560).
6. 6. It saves the session record and returns 201 with sessionId, sdp answer, voiceSessionId, settings, tools and the settlement ceiling (route.ts:669-728).
7. 7. The client completes WebRTC and talks; it extends by one-minute blocks and closes the session at the end.

**What the person sees and gets**

- On success: 201 with the SDP answer and settings (route.ts:712-728).
- Errors in plain JSON: invalid_request, voice_conversation_required, live_voice_not_configured (503), live_voice_unpriced (503), billing_unavailable (503), voice_session_not_recorded (503), live_voice_malformed (502), model_may_train (403) (route.ts:236-286, 328, 338, 426-430, 565-640, 700-710).
- Mobile messages such as 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' and 'Sign in to use live voice; this chat stays turn based.' (liveVoiceAvailability.ts:17-20).

**Settings**

- Voice, language, pace, reasoning level, memory on or off (route.ts:144-163; PATCH settings route).
- Account training opt-out and connected-data rules affect whether voice may start (route.ts:324-340).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create route end to end: gates, plan check, reservation or free allowance, provider call, session record, response (route.ts:171-731).
- Session record in table public.voice_sessions with voice, language, pace, tools and last turn pointer (apps/web/db/neon/0260_voice_sessions.sql; voice-session-store.ts:119).
- Companion routes: GET active, POST close, POST extend, PATCH settings, POST tools (route files under sessions/).
- Web and mobile clients with tests (apps/web/features/chat/lib/live-voice-session.ts; apps/mobile/src/features/voice/services/liveVoiceSession.ts).
- The browser is limited to a fixed list of data-channel commands so it cannot swap the backend model or tools (route.ts:133-142).

**Incomplete**

- The provider API key name is fixed in the route (OPENAI_API_KEY, route.ts:129) even though the provider is taken from the routing slot, so a slot that points to another managed provider would still use this key [inferred]; the route only throws if the provider is not managed (route.ts:194-196).

**Present but disconnected or switched off**

- If the key is not set the route returns 503 'live_voice_not_configured' (route.ts:~244-253). Whether production has it set: unknown.

**Not available**

- Local Mode on mobile (liveVoiceAvailability.ts:17-27); builds without the WebRTC native module (same file).
- Typed text or camera frames during a call, and client-set turn detection are not built by decision (doc: docs/decisions/2026-09-27-founder-decisions.md:172-176).

## 4. Required behaviour

**Established requirements**

- A realtime audio session service creates and manages live voice sessions. Platform status: done. (source: S102.30 (brief item))
- The session route runs on Node. (source: S102.30 Should line; route.ts:3)
- An adult-eligibility gate runs first. (source: S102.30 Should line; route.ts:181-188)
- The live model comes from the voice_live routing slot and must be live and from a managed provider, otherwise the route throws. (source: S102.30 Should line; route.ts:189-196)
- Users who opted out of training, or whose stored conversation holds Google user data, are refused with 403, but only when the live or backend model may train on inputs. (source: S102.30 Should line; route.ts:324-340 (condition at 324-326))
- Live voice uses the provider's Live API; typed text and camera frames during a call, and client-set speech or turn detection are not built. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:170-176 (D-2026-09-28-04))
- Voice is available on web, desktop, mobile and CLI and absent in VS Code (as a feature row). (source: doc: docs/product/surface-feature-matrix.md:68)

**Acceptance criteria**

1. A signed-in adult on a voice-enabled plan gets 201 with sessionId, sdp, voiceSessionId and settings.
2. A request without a conversation id returns 400 'voice_conversation_required'.
3. A minor or unconfirmed account is refused before any model lookup.
4. An opted-out user with a model that may train gets 403 'model_may_train'.
5. A plan without voice gets 403 with the not-in-plan code.
6. A provider failure releases the reservation and returns the described failure; nothing is charged.
7. A new session in the same conversation closes the previous one with reason 'superseded' and settles it.
8. Free-plan sessions draw on the monthly allowance and stop when it is used.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The extend call must be refused when the plan budget or allowance is used up (extend route returns 'voice_session_closed' and usage errors) [inferred from extend/route.ts:107-260].
- Clients must end the call when the held minute runs out [inferred from the extend route comment, lines 139-143].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move the provider key name to the provider endpoint table so the slot decides the key, keeping provider agnostic.
- [proposed] Add one test that proves the 403 rules are skipped when both models keep inputs out of training.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Creates the session (171-731). |
| endpoint | GET /api/voice/live/sessions/active | `apps/web/app/api/voice/live/sessions/active/route.ts` | Reads the active session (handler lines 3-85). |
| endpoint | POST /api/voice/live/sessions/[sessionId]/close | `apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts` | Closes and settles a session (165). |
| endpoint | POST /api/voice/live/sessions/[sessionId]/extend | `apps/web/app/api/voice/live/sessions/[sessionId]/extend/route.ts` | Reserves the next one-minute block or allowance second block (76-302). |
| endpoint | PATCH /api/voice/live/sessions/[sessionId]/settings | `apps/web/app/api/voice/live/sessions/[sessionId]/settings/route.ts` | Updates voice, language, pace (94). |
| endpoint | POST /api/voice/live/sessions/[sessionId]/tools | `apps/web/app/api/voice/live/sessions/[sessionId]/tools/route.ts` | Handles tool-call decisions (87). |
| service | Session store | `apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts` | Insert, read, update, close rows in public.voice_sessions (119-257). |
| service | Budget and settlement | `apps/web/app/api/voice/live/sessions/lib/voice-session-budget.ts` | assessVoiceBudget and error shapes; settlement in voice-session-settlement.ts. |
| service | Live voice context | `apps/web/app/api/voice/live/sessions/lib/live-voice-context.ts` | Loads project, memory and recent turns into the instructions. |
| service | Live voice billing | `apps/web/lib/voice/live-voice-billing.ts` | One-minute blocks, 10 minute lease, price per block. |
| service | Free voice allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Monthly allowance seconds from the tier policy (47-51). |
| service | Live voice tools | `apps/web/lib/voice/live-voice-tools.ts` | Delegation and function tools offered to the session. |
| service | Adult eligibility gate | `apps/web/lib/server/adult-eligibility-gate.ts` | Refuses with 403 or 503 when age cannot be confirmed. |
| table | voice_sessions | `apps/web/db/neon/0260_voice_sessions.sql` | One row per voice session bound to one conversation. |
| config | voice_live routing slot and tier policies | `packages/contracts/types/src/model-catalog.ts` | Slots voice_live and voice_live_backend_free; free tier allowVoice true with 10 minutes a month (1233-1257). |
| hook | Web live voice session client | `apps/web/features/chat/lib/live-voice-session.ts` | Endpoint constant (41), create (528), close (330), settings (692), tools (747). |
| service | Mobile live voice authority and availability | `apps/mobile/src/features/voice/services/liveVoiceAuthority.ts` | Account-bound fetch and cleanup; availability reasons in liveVoiceAvailability.ts (17-47). |
| test | Route tests | `apps/web/app/api/voice/live/sessions/route.test.ts` | Create route tests; sibling tests in close, extend, settings, tools, active and lib/__tests__. |
| test | Client tests | `apps/web/features/chat/lib/live-voice-session.test.ts` | Web client; mobile tests live-voice-session.test.ts, live-voice-authority.test.ts, LiveVoiceBar.test.tsx. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The client creates a WebRTC offer and POSTs it with the conversation id and settings. | device | apps/web/features/chat/lib/live-voice-session.ts:528 |
| The server checks CSRF, rate limit 'voice-live-session', sign-in, adult eligibility, slot model, managed-compute, organisation policy, spend limit and model policy. | our servers | route.ts:171-232 |
| The server resolves the plan, checks voice is allowed, picks the backend model by plan, applies the training opt-out rule, then reserves a one-minute block (or grants free allowance seconds). | our servers | route.ts:~296-428; free-voice-allowance.ts:47-51 |
| The server loads conversation context and tools, then POSTs the session request, including the offer, to the provider's live sessions endpoint with the server-held key; 20 second timeout, one retry without function tools if rejected. | outside service | route.ts:533-580, 128-130 |
| The server stores a voice_sessions row and answers 201 with the answer SDP. | our servers | route.ts:669-728; voice-session-store.ts:119 |
| Audio flows directly between the client and the provider over WebRTC; the client sends only the allowed data-channel commands. | outside service | route.ts:133-142, 503-506 [media path inferred from the transport type 'webrtc'] |
| The client extends minute by minute and closes; the server settles the real usage. | our servers | extend/route.ts:139-302; close/route.ts:165 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Voice session record (provider session id, model, surface, voice, language, pace, tools, last turn pointer) | table voice_sessions in the server database | Server-held; other devices can read the active session [from the migration comment] | Deleted with the conversation or user (on delete cascade in the migration) |
| Usage reservation and settlement | Managed usage request records (managed-usage-request-service) | Server | Per billing records; details unknown |
| Audio | Not stored by this route; goes to the provider | Provider | Provider rules: unknown |

**Models and providers.** The live model comes from the routing slot 'voice_live' and the thinking model from a plan-based backend slot (route.ts:189, getVoiceLiveBackendModel at ~292). The provider must be a managed one (route.ts:194-196). The decision record names the provider's Live API (docs/decisions/2026-09-27-founder-decisions.md:170-176); the OpenAI provider folder exists under packages/ai/providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required: getClerkAuthUser and a user-scoped database (route.ts:176, ~258). |
| Permissions | Adult eligibility, organisation policy, model policy, tool approval policy and web domain policy all apply (route.ts:181-232, 405-420). |
| Subscription | Plan must allow voice (getTierPolicy(planTier).allowVoice, route.ts:~314). Free tier allows voice with 10 minutes a month; other tiers list null minutes and draw from the plan's usage budget (packages/contracts/types/src/model-catalog.ts:1233-1257, 1289-1391). |
| Limits and metering | One-minute blocks reserved before use (live-voice-billing.ts), a 10 minute lease for a session that stops checking in, tier unit allowance 'voice_minutes' (route.ts:~392-398), free allowance per month (free-voice-allowance.ts). Prices come from the model catalog; an unpriced model returns 503. |
| Feature flags | Capability 'canUseVoice' through assertCapabilityAvailable (route.ts:~308); managed-compute switch (buildManagedComputeGateResponse). |
| Model compatibility | Live model and backend model must be live in the catalog (route.ts:189-192, ~292-296). |
| Provider restrictions | Managed providers only (route.ts:194-196). If either model may train on inputs, an account with the training opt-out, or a conversation holding Google user data, is refused (route.ts:324-340). |
| Local mode | Not available in Local Mode: the route is a Cloud route needing an account, and the mobile app says 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' (liveVoiceAvailability.ts:17-18). Own-key mode: none found in the code read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Bad request | 400 invalid_request 'A WebRTC offer is required.' | route.ts:233-240 |
| No conversation | 400 voice_conversation_required. | route.ts:~260-268 |
| Not configured | 503 live_voice_not_configured. | route.ts:~244-253 |
| Model unpriced | 503 live_voice_unpriced. | route.ts:~275-286 |
| Billing unavailable | 503 billing_unavailable; no provider spend happened. | route.ts:~418-430 |
| Provider unreachable or rejects | Reservation released as failed; mapped failure returned; function tools dropped and retried once on a 400. | route.ts:533-640 |
| Malformed provider answer | 502 live_voice_malformed. | route.ts:~641-655 |
| Session not recorded | 503 voice_session_not_recorded; nothing charged. | route.ts:~695-710 |
| Second session in one conversation | The earlier session is closed as 'superseded' and settled. | route.ts:~655-690 |
| Session stops checking in | Abandoned sessions are settled at the next start. | route.ts:~640-655; live-voice-billing.ts |
| Mobile without WebRTC module or on insecure server | Stays turn based with a message. | liveVoiceAvailability.ts:29-47 |
| Backgrounded or audio route change (mobile) | Cancel and notice behaviour is covered by tests named LiveVoiceBackgroundCancel and LiveVoiceAudioRouteNotice [inferred from names; code not read]. | apps/mobile/__tests__/LiveVoiceBackgroundCancel.test.tsx; LiveVoiceAudioRouteNotice.test.tsx (file names only) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/voice/live/sessions/route.test.ts`: Create route [inferred from name].
- `apps/web/app/api/voice/live/sessions/[sessionId]/close/route.test.ts`: Close route [inferred from name].
- `apps/web/app/api/voice/live/sessions/[sessionId]/extend/route.test.ts`: Extend route [inferred from name].
- `apps/web/app/api/voice/live/sessions/[sessionId]/settings/__tests__`: Settings route [inferred from folder].
- `apps/web/app/api/voice/live/sessions/[sessionId]/tools/__tests__`: Tools route [inferred from folder].
- `apps/web/app/api/voice/live/sessions/lib/__tests__`: Budget, store, settlement and context helpers [inferred from folder].
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Web client [inferred from name].
- `apps/web/features/chat/hooks/useVoiceSession.test.tsx`: Voice session hook [inferred from name].
- `apps/mobile/__tests__/live-voice-session.test.ts`: Mobile session client [inferred from name].
- `apps/mobile/__tests__/live-voice-authority.test.ts`: Account-bound authority [inferred from name].
- `apps/web/e2e/voice-live-probe.spec.ts`: Browser probe of live voice [inferred from name].

**Test scenarios**

- **Happy path**
  1. Sign in as an adult on a paid plan.
  2. Open a conversation and tap 'Start voice mode'.
  3. Speak and listen, then end the session.
  - Expected: 201 on create, audio works, a voice_sessions row exists and is closed at the end; usage settles.
- **Free allowance**
  1. Use a free account until the monthly minutes are gone.
  2. Start again.
  - Expected: A refusal naming when the allowance resets.
- **Training opt-out**
  1. Turn on the training opt-out and use a route whose model may train.
  2. Start voice.
  - Expected: 403 model_may_train.
- **Local Mode on phone**
  1. Open a Local chat on the phone and tap 'Start voice mode'.
  - Expected: Voice stays turn based with the Local Mode reason.
- **Provider down**
  1. Make the provider return an error.
  - Expected: Failure mapped, reservation released, nothing charged.
- **Superseded**
  1. Start voice twice in one conversation.
  - Expected: First session closed as superseded and settled.

**Where to look when it fails**

- Log events live_voice_not_configured, live_voice_unpriced, live_voice_session_rejected, live_voice_function_tools_rejected, voice_session_not_persisted, voice_superseded_settlement_failed, live_voice_refund_settlement_unrecorded, 'Live voice session created'.
- Table voice_sessions; managed usage request records.
- Response error codes listed under feedback.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief calls this server side only; web and mobile clients exist and mobile has Local Mode and native-module restrictions the brief does not mention.** Affects: Mobile and Web users; brief accuracy.. Evidence: live-voice-session.ts:41; liveVoiceAvailability.ts:17-47.. Work needed: Update the brief item.
- **The provider key name is fixed to one provider's key while the provider comes from the slot.** Affects: Provider-agnostic requirement.. Evidence: route.ts:129, 194-196.. Work needed: Resolve the key by provider through the endpoint table [proposed].
- **No live voice route or client for CLI, VS Code or Chrome found, while the surface matrix lists Voice as present for CLI and Chrome.** Affects: CLI and Chrome users who expect live voice.. Evidence: grep of 'voice/live/sessions' found web and mobile only; surface-feature-matrix.md:68.. Work needed: Clarify whether the matrix row covers turn-based voice only.
- **The 403 rules apply only when a model may train; this condition is not stated in the brief.** Affects: Testers.. Evidence: route.ts:324-326.. Work needed: Add the condition to the brief.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-voice-and-media
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-memory-projects-and-context
- mode:cloud
- surface:web
- surface:mobile
- table:voice_sessions
- provider:openai
- api:POST /api/voice/live/sessions

## Unknown

- Whether the provider key is set in production.
- Provider-side audio retention.
- Exact line numbers of some route steps marked with ~ (the file is 741 lines; some sections were read but not numbered).
- Behaviour of the desktop build beyond showing the hosted web app.
- How CLI and Chrome 'voice' in the matrix relates to this route (none found).
