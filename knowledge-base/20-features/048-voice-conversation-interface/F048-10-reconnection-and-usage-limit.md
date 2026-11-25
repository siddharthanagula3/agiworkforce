---
id: "F048-10"
type: "feature"
title: "Reconnection and usage limit"
aliases: ["Reconnection and usage limit", "Reconnecting state (S48.36)", "Usage-limit notice (S48.37)", "voice-reconnecting", "voice-usage-limit", "Voice minutes", "Block extension"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.36", "S48.37"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "provider:openai", "plan:free", "plan:pro", "plan:max", "plan:enterprise", "table:voice_sessions", "table:usage_events", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "SYS-data-model-and-migrations", "SYS-voice-and-media"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-10 Reconnection and usage limit

When the live voice link drops, the app shows 'Reconnecting, attempt N of 3' and retries with growing delays; if that fails it shows an error with 'Try again'. When voice minutes run out it ends the call with a clear limit notice and, on web, 'Upgrade' and 'Continue in text'. Minutes are reserved one minute at a time.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.36](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4836), [S48.37](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4837).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps a call alive through short network drops and stops it cleanly when the plan's voice time or budget is gone, telling the person what happened and what to do next.

**Why it exists.** Networks drop; realtime voice costs money per minute. The product must not silently overspend, keep charging a dead call, or leave the person with a broken screen (apps/web/lib/voice/live-voice-billing.ts:15-28).

**Who uses it.** Everyone using live voice on web, Desktop and iPhone; the plan decides when the limit is reached.

**Problems it solves**

- A flaky network ends the call for good.
- A provider outage re-reserving minutes on every drop (the retry budget is bounded).
- Unclear 'it stopped' with no reason or reset time.
- A dead call still counting against usage.

**Use cases**

- Walk between rooms, lose Wi-Fi briefly, and the call resumes by itself.
- A Free account uses up its monthly 10 minutes mid-call and sees the limit with an upgrade choice.
- A paid account hits a rolling 5-hour limit and sees when it resets.
- Close the laptop; the server closes the stale session after the lease.

## 2. User experience

**Where to find it**

- Web and public Desktop: notice row above the orb in the voice screen (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:303-361).
- iPhone: status line 'Reconnecting live voice...' and an error box with 'Try again' and 'Type a message instead' (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:173, 378-420); a limit that ends the call appears as a notice line above the inline voice bar (apps/mobile/app/(app)/chat/[id].tsx:1771-1777, 2814).

**Before you start**

- A live voice call in progress or starting.

**Screens and controls**

- Web: status text 'Reconnecting, attempt <n> of <max>' (data-testid voice-reconnecting).
- Web error after retries: message and 'Try again' (voice-error).
- Web limit: message, 'Upgrade' (opens the plan dialog) and 'Continue in text' (voice-usage-limit, voice-usage-upgrade).
- Web pause: 'Paused. The call is closed and nothing is being used. Resume to pick up this conversation.' with 'Resume' (VoiceModeSurface.tsx:62-65, 362-376).
- iPhone: no Upgrade control in the voice bar; text only.

**Journey**

1. Drop: 1. The link breaks. 2. The call is settled as 'connection_lost' and a retry is scheduled after 1 second, then 2, then 4 (max 8) (apps/web/features/chat/hooks/use-voice-session.ts:165-168, 241-254, 665-678). 3. The row shows the attempt count. 4. A new session opens; if it stays up 30 seconds the attempt count resets (269-279). 5. After 3 failed attempts the row reads 'The voice connection could not be restored.' with 'Try again'.
2. Limit at start: 1. Start voice. 2. Server refuses; the row shows the server's sentence (with reset time for known limits) plus Upgrade and Continue in text.
3. Limit mid-call: 1. About 15 seconds before the reserved minute ends the app asks for the next minute (apps/web/features/chat/hooks/use-voice-session.ts:60, 394-427). 2. If refused, the call ends at the ceiling with the limit row.

**What the person sees and gets**

- Limit text examples: '5-hour limit reached. <reset>.', 'Weekly limit reached. <reset>.', 'Monthly limit reached. <reset>.' (apps/web/features/chat/lib/live-voice-session.ts:259-269); fallback 'Voice ran out of included minutes on this plan, so the session ended. Nothing was lost from the conversation.' (line 71-72); plan without voice: "Voice needs usage your plan doesn't include. Upgrade to talk with voice, or continue in text." (apps/web/app/api/voice/live/sessions/lib/voice-session-budget.ts:40-44).
- Toast when closing fails: 'This voice session did not close cleanly, so it may keep counting toward your voice usage for a few more minutes.' (use-voice-session.ts:309-312).

**Settings**

- None for reconnect. Limits come from the plan (apps/web/lib/voice/free-voice-allowance.ts:47-51).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web reconnect with bounded attempts, backoff, immediate retry on the browser 'online' event, and manual retry after the budget is spent (apps/web/features/chat/hooks/use-voice-session.ts:165-168, 241-279, 928-929; VoiceModeSurface.tsx:303-313, 346-361).
- Server detection of lost connections: keepalive every 15 seconds, 60 second timeout, 5 second disconnect grace (apps/web/features/chat/lib/live-voice-session.ts:45-47, 856, 878).
- Web block extension: second block requested 15 seconds before the ceiling, retried every 10 seconds on server errors, call ended when refused (use-voice-session.ts:60-62, 394-427).
- Server: one-minute blocks, 10 minute lease, free monthly allowance with grants and settlement, paid plans reserve against the usage budget (apps/web/lib/voice/live-voice-billing.ts:20, 28; apps/web/lib/voice/free-voice-allowance.ts:178-235, 242-269; apps/web/app/api/voice/live/sessions/route.ts:346-413).
- Limit errors carry reset time (apps/web/lib/voice/free-voice-allowance.ts:271-275; apps/web/app/api/voice/live/sessions/lib/voice-session-budget.ts:184-198).
- Abandoned sessions are settled when the same user starts voice again and by a cron job (apps/web/app/api/voice/live/sessions/route.ts:398-403; apps/web/app/api/cron/recover-reservations/route.ts:12).
- iPhone has the same 3 attempt reconnect, the same extension timing, and shows the server sentence at start refusal (apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:66-72, 261-294, 400-428; apps/mobile/src/features/voice/services/liveVoiceSession.ts:158-168, 842-863).

**Incomplete**

- iPhone reads only the message and code of a refusal, not the reset time (apps/mobile/src/features/voice/services/liveVoiceSession.ts:158-168) [inferred: web reads resets_at at apps/web/features/chat/lib/live-voice-session.ts:279-283].
- iPhone voice bar has no Upgrade control (rg found no 'Upgrade' in apps/mobile/src/features/voice/components/LiveVoiceBar.tsx).
- iPhone has no network-online trigger for an immediate retry in the code read (apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts).

**Present but disconnected or switched off**

- none found.

**Not available**

- CLI and VS Code/Chrome: no live voice session to reconnect or meter (CLI uses push-to-talk transcription).
- Background reconnect: web ends the call on page hide and iPhone ends it on background (apps/web/features/chat/hooks/use-voice-session.ts:926; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:486-490).

## 4. Required behaviour

**Established requirements**

- When the connection drops, a reconnecting state is shown and the session reconnects or says it could not. (source: S48.36)
- When voice usage is exhausted the user sees a clear usage-limit notice in voice. (source: S48.37)
- Voice draws on the same usage budget as chat, one minute at a time, settling at what it used. (source: apps/web/lib/voice/live-voice-billing.ts:15-19 (code comment, rank 2))
- Voice must have recoverable states for permission denial, absent microphone and exit. (source: doc: docs/product/experience-contract.md:786 (W13))

**Acceptance criteria**

1. Cutting the network mid-call shows 'Reconnecting, attempt 1 of 3' within about a second and the call resumes when the network returns.
2. After three failed attempts the row shows 'The voice connection could not be restored.' and 'Try again'.
3. A Free account with 10 minutes used in the month is refused at start with a limit notice that includes the reset date and offers Upgrade and Continue in text on web.
4. A call crossing a minute boundary asks for the next minute; when refused the call ends with the limit row and no more usage is recorded.
5. Closing the tab or ending the call settles usage; an unsettled session stops counting after the lease and one block.
6. A microphone refusal does not trigger reconnect attempts.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- iPhone should show the reset time like web [inferred from web behaviour].
- iPhone should link to plans from the limit notice if the platform allows [inferred; store rules for mobile were not read].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an online-event retry on iPhone.
- [proposed] Give the iPhone limit notice the same wording with reset time.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useVoiceSession reconnect and budget | `apps/web/features/chat/hooks/use-voice-session.ts` | Retry scheduling, stable timer, block extension, endSessionAtLimit. |
| component | VoiceModeSurface notice rows | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Reconnecting, limit, unavailable, error, paused rows. |
| service | LiveVoiceSession (web) | `apps/web/features/chat/lib/live-voice-session.ts` | Error mapping, usage codes, reset text, keepalive, extend and settle calls. |
| store | voice-session-store (client) | `apps/web/features/chat/stores/voice-session-store.ts` | usageLimited, providerNotice, paused state. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Admission: plan, capability, free grant or reservation (231-413). |
| endpoint | POST /api/voice/live/sessions/{sessionId}/extend | `apps/web/app/api/voice/live/sessions/[sessionId]/extend/route.ts` | Reserve next minute block (144-247). |
| endpoint | POST /api/voice/live/sessions/{sessionId}/close | `apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts` | Close and settle usage (165). |
| endpoint | GET /api/voice/live/sessions/active | `apps/web/app/api/voice/live/sessions/active/route.ts` | Reports an open session so a second surface can offer to rejoin (85). |
| service | live-voice-billing | `apps/web/lib/voice/live-voice-billing.ts` | Block length, lease, per-minute charge, provider failure mapping. |
| service | free-voice-allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Monthly allowance, grants, settlement, limit error with reset. |
| service | voice-session-budget | `apps/web/app/api/voice/live/sessions/lib/voice-session-budget.ts` | Budget check, 'not in plan' message, error body with reset. |
| service | voice-session-settlement | `apps/web/app/api/voice/live/sessions/lib/voice-session-settlement.ts` | Settles closed and abandoned sessions. |
| table | voice_sessions | `apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts` | Session rows (insert at 119, updates 177-307). |
| table | usage_events | `apps/web/lib/voice/free-voice-allowance.ts` | Free grants and settlements (events free_voice_seconds_granted and _settled). |
| config | plan voice policy | `packages/contracts/types/src/model-catalog.ts` | allowVoice and voiceMinutesPerMonth per plan (1255-1256, 1289-1290). |
| hook | useLiveVoiceSession (mobile) | `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | Reconnect and budget extension. |
| component | LiveVoiceBar (mobile) | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | Status label and error box. |
| job | recover-reservations cron | `apps/web/app/api/cron/recover-reservations/route.ts` | Settles abandoned voice sessions (imported at line 12). |
| test | free-voice-allowance test | `apps/web/lib/voice/__tests__/free-voice-allowance.test.ts` | Allowance grant and settle rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Start: the browser builds a realtime offer and posts it with voice, language and conversation to our server. | device | apps/web/features/chat/lib/live-voice-session.ts:528-544 |
| The server checks sign-in, subscription access, capability flag, plan allows voice, model training rules. | our servers | apps/web/app/api/voice/live/sessions/route.ts:290-345 |
| Free plan: grant the first minute from the monthly allowance. Paid plans: check budget and tier unit allowance and reserve the first minute. | our servers | apps/web/app/api/voice/live/sessions/route.ts:346-413 |
| The server asks the voice provider to create the session and returns the answer and settlement ceiling. | outside service | apps/web/app/api/voice/live/sessions/route.ts:533, 255 |
| The browser extends the call one minute at a time before the ceiling. | device and our servers | apps/web/features/chat/hooks/use-voice-session.ts:394-427; apps/web/app/api/voice/live/sessions/[sessionId]/extend/route.ts:144 |
| On drop the browser settles with reason connection_lost and retries. | device and our servers | apps/web/features/chat/hooks/use-voice-session.ts:665-678 |
| On end the browser posts close with seconds used; the server settles to usage, never above what was granted. | our servers | apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts:165; apps/web/lib/voice/free-voice-allowance.ts:242-269 |
| A lost browser leaves a lease; after 10 minutes the session counts as ended and its reservation is settled by the next start or a cron job. | our servers | apps/web/lib/voice/live-voice-billing.ts:24-28; apps/web/app/api/cron/recover-reservations/route.ts:12 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Voice session record | table:voice_sessions | Server side | Settlement fields updated on close |
| Free allowance grants and settlements | table:usage_events | Server side | Calendar month period, resets at the next month start in UTC (apps/web/lib/voice/free-voice-allowance.ts:60-72) |
| Paid reservations | Managed usage request records (tables not opened) | Server side | Finalized on close with actual cost (route.ts:380-413 area) |

**Models and providers.** The reserved charge is the live model's published per-minute rate plus a backend allowance priced like other managed charges (apps/web/lib/voice/live-voice-billing.ts:49-85); the live model and backend model come from the catalog slot and the plan (apps/web/app/api/voice/live/sessions/route.ts:189-195, 311-318). The provider is OpenAI.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account with a tenant-scoped database session (apps/web/app/api/voice/live/sessions/route.ts:241-247). |
| Permissions | Adult eligibility, managed compute gates and organization policy gates are imported by the route (route.ts:12-22); their exact trigger points for voice were not traced. |
| Subscription | plan allowVoice must be true (route.ts:311). Free: 10 voice minutes a month (packages/contracts/types/src/model-catalog.ts:1255-1256; apps/web/lib/voice/free-voice-allowance.ts:47-51). Pro and Max: voiceMinutesPerMonth null, so voice draws on the plan's usage budget (model-catalog.ts:1289-1290; free-voice-allowance.ts:346 route branch). |
| Limits and metering | Block 60 seconds; lease 10 minutes; unsettled grant counts for lease plus one block; rolling 5-hour, weekly, credits and monthly voice minute limits produce limit codes (apps/web/features/chat/lib/live-voice-session.ts:243-263). Free-plan dictation draws on the same monthly allowance (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-652). |
| Feature flags | canUseVoice capability gate (route.ts:300-306); dictation kill switch DICTATION_CAPABILITY (apps/web/app/api/voice/transcribe/route.ts:23). |
| Model compatibility | If the live model has no published per-minute rate the start is refused with 'Live voice is unavailable right now.' (route.ts:~270-286). |
| Provider restrictions | Managed OpenAI only; provider access errors map to live_voice_access_denied, busy, unavailable or rejected (apps/web/lib/voice/live-voice-billing.ts:98-135). |
| Local mode | Live voice is not offered in Local mode, so no reconnect or limit applies; Local chats on web use the text composer and iPhone shows the Local Mode reason (apps/web/features/chat/pages/WebChatPage.tsx:5907-5911; apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17-18). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Reconnecting | Spinner row with attempt count; orb idle. | apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:303-313 |
| Reconnect spent | Error 'The voice connection could not be restored.' and Try again. | apps/web/features/chat/hooks/use-voice-session.ts:672-677; VoiceModeSurface.tsx:346-361 |
| Microphone denied or unavailable or unsupported | Not retried automatically; retries once permission is granted. | use-voice-session.ts:169-173, 898-922 |
| Network returns while waiting | Retry immediately. | use-voice-session.ts:256-267, 928 |
| Extension server error | Retry every 10 seconds while time remains. | use-voice-session.ts:405-410 |
| Limit during call | Call ends with reason usage_limit and limit row. | use-voice-session.ts:387-392 |
| Remote close reasons expired, content, connection_lost | Shown as 'The voice session ended.' | use-voice-session.ts:59, 640-643 |
| Paused | Session closed, nothing used, Resume reopens. | use-voice-session.ts:942-959; VoiceModeSurface.tsx:362-376 |
| Page hidden | Call ends. | use-voice-session.ts:926 |
| Offline on iPhone | not handled in the code read beyond the drop retries. | apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts |
| Accessibility | Limit row has role alert; reconnect row role status. | VoiceModeSurface.tsx:305, 316 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/hooks/useVoiceSession.test.tsx`: Reconnect backoff and bound, network return, cancel on leave, microphone failures, usage limit marking, close settlement (683-780, 582).
- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Reconnecting row, spent state, limit row with Upgrade, no Upgrade for other errors, forget limit (169-406).
- `apps/web/lib/voice/__tests__/free-voice-allowance.test.ts`: 10 minute allowance, one minute grants, settlement, month rollover, limit error with reset.
- `apps/web/lib/voice/__tests__/live-voice-billing.test.ts`: Billing helpers (case names not read).
- `apps/web/app/api/voice/live/sessions/route.test.ts`: Create route (case names not read).
- `apps/web/app/api/voice/live/sessions/[sessionId]/extend/route.test.ts`: Extend route (case names not read).
- `apps/web/app/api/voice/live/sessions/lib/__tests__/voice-session-settlement.test.ts`: Settlement (case names not read).
- `apps/mobile/__tests__/live-voice-session.test.ts`: Mobile session service (case names not read).
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Connecting and stopped states.
- `apps/web/e2e/voice-live-probe.spec.ts`: Live probe; contents not read.

**Test scenarios**

- **Drop and recover**
  1. Start a call on web.
  2. Disconnect the network for 3 seconds, then reconnect.
  - Expected: 'Reconnecting, attempt 1 of 3' appears, then the call listens again.
- **Exhausted retries**
  1. Block the network for over a minute.
  - Expected: After attempt 3: 'The voice connection could not be restored.' and Try again.
- **Free allowance used**
  1. Use a Free account with its 10 minutes consumed this month.
  2. Start voice mode.
  - Expected: Limit notice with reset date, Upgrade and Continue in text.
- **Limit mid-call**
  1. Use a Free account with under a minute left.
  2. Stay in the call across the minute boundary.
  - Expected: Call ends at the ceiling with the limit row; usage settles at no more than granted.
- **iPhone drop**
  1. Start live voice on iPhone, toggle airplane mode briefly.
  - Expected: 'Reconnecting live voice...' then listening, or an error box with Try again after 3 attempts.
- **Closed tab**
  1. Start a call, kill the tab, wait 11 minutes, start again.
  - Expected: The old session no longer counts against the allowance.

**Where to look when it fails**

- Server log events live_voice_unpriced, live_voice_reservation_failed, voice_session_expiry_failed, live_voice_refund_settlement_unrecorded.
- Client failure reports voice_provider_error and voice_audio_blocked (use-voice-session.ts:654, 662).
- Tables voice_sessions and usage_events (event types free_voice_seconds_granted, free_voice_seconds_settled).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)
- Mobile: [70-qa/test-plans/mobile/048-voice-conversation-interface.md](../../70-qa/test-plans/mobile/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **iPhone shows no reset time and no Upgrade control in the voice limit notice** Affects: iPhone users at a limit. Evidence: apps/mobile/src/features/voice/services/liveVoiceSession.ts:158-168 vs apps/web/features/chat/lib/live-voice-session.ts:265-288. Work needed: Read resets_at and show the same sentence; decide the upgrade path on iPhone.
- **The first draft's mobile citations (LiveVoiceBar.tsx:115, liveVoiceSession.ts:107) do not point at limit or reconnect code** Affects: Documentation. Evidence: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:115 is inside the call clock; reconnect label is at line 173. Work needed: Use the corrected lines in this page.
- **No background continuation: calls end on page hide or app background** Affects: All live voice users who switch away. Evidence: apps/web/features/chat/hooks/use-voice-session.ts:926; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:486-490. Work needed: Covered by F048-11 (background preference).
- **Whether usage counted when a call ends by crash is exact depends on the lease and cron; not verified by a run** Affects: Billing accuracy. Evidence: apps/web/lib/voice/live-voice-billing.ts:24-28. Work needed: Run the abandoned-session scenario and record.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- provider:openai
- plan:free
- plan:pro
- plan:max
- plan:enterprise
- table:voice_sessions
- table:usage_events
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- SYS-data-model-and-migrations
- SYS-voice-and-media

## Unknown

- Exact order and trigger of adult eligibility, managed compute and organization gates for voice.
- Retention of voice_sessions rows.
- Whether the Pro and Max plans' usage budget lines (rolling 5-hour, weekly) are the ones named in limit codes in practice; no run recorded.
- Whether Electron Desktop has any extra reconnect behaviour; none found.
- Whether iPhone should offer plan links given store rules (not read).
- Current values for plan names shown to customers; catalog keys free, pro, max, enterprise used here.
