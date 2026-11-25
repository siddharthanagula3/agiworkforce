---
id: "F051-05"
type: "feature"
title: "Test a draft voice agent"
aliases: ["Test-call interface", "Test a draft voice agent", "S51.10"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.10"]
depends_on: ["F051-01", "F051-02", "F051-03", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-model-catalog-and-routing", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-05 Test a draft voice agent

Intended: a control in the voice-agent builder that lets the owner talk to a draft agent before publishing. Not built. A personal live voice mode and text-agent publish and draft tracking exist as neighbours, but nothing connects a draft voice agent to a call.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.10](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5110).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Intended: lets an owner speak to an unpublished voice agent to check persona, knowledge, tools and guardrails (S51.10). Not built on Web, Desktop or Mobile (audit/ledger/ecosystem-capability-ledger.jsonl: S51.10).

**Why it exists.** Owners must hear a bot before real callers do; the audit lists it as open Wave 4 work.

**Who uses it.** Intended: voice-agent owners on Web, Desktop and Mobile.

**Problems it solves**

- Mistakes are found before publishing.
- Owners can tune instructions and voice by ear.

**Use cases**

- Owner tries a greeting after editing instructions.
- Owner asks a knowledge question to check grounding.
- Owner triggers a transfer to see the fallback.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile: not available. Personal voice mode in chat is separate (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx).

**Before you start**

- A draft voice agent (F051-01) and microphone access.

**Screens and controls**

- None for test calls. Personal voice mode has call time with role timer, a Stop the task button and an Upgrade action (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:21-60, 570-595).

**Journey**

1. Intended: press a test-call control, talk to the draft, end the call.
2. Today: not possible. Whether test calls are metered and who sees transcripts are not specified.

**What the person sees and gets**

- None today.

**Settings**

- None for test calls.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Neighbour: text agents track drafts versus published versions, with a 'hasUnpublishedChanges' flag and a publish action that refuses when nothing changed (packages/contracts/cloud-contracts/src/agents.ts:127-141; apps/web/lib/services/custom-agent-service.ts:449-470).
- Neighbour: personal live voice sessions run on web with microphone, captions and call time (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx).

**Incomplete**

- The live voice session request takes voice, language, pace, reasoning and conversationId but no agent or draft (apps/web/app/api/voice/live/sessions/route.ts:149-162).

**Present but disconnected or switched off**

- none found

**Not available**

- Test-call interface for draft voice agents on Web, Desktop and Mobile (audit/ledger/ecosystem-capability-ledger.jsonl: S51.10 missing; api marked n/a because it is a builder UI).

## 4. Required behaviour

**Established requirements**

- The builder offers a test-call interface to talk to a draft voice agent before publishing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.10)

**Acceptance criteria**

1. A test-call control is visible in the builder for a saved draft.
2. The call uses the draft's instructions, voice, knowledge and guardrails, not the published version.
3. Microphone refusal gives a clear message and a text fallback.
4. Ending the call stops audio and metering.
5. The owner is told whether the test is metered.
6. Test transcripts are visible only to the owner.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A test call should reuse the live voice session start path so gating and budget checks apply once (AGENTS.md section 3).
- [inferred] Test calls must not reach real phone numbers.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a visible 'Draft' label during the test.
- [proposed] Count test minutes inside the same allowance as personal voice unless the owner decides otherwise.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief S51.10 | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | Should line. |
| other | Capability ledger S51.10 | `audit/ledger/ecosystem-capability-ledger.jsonl` | Records missing. |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Neighbour: personal live voice screen. |
| hook | useVoiceSession | `apps/web/features/chat/hooks/use-voice-session.ts` | Neighbour: client session hook for live voice (imported by VoiceModeSurface line 20). |
| store | voice-session-store (client) | `apps/web/features/chat/stores/voice-session-store.ts` | Neighbour: client voice session state. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts:149` | Neighbour: starts a live voice session with the provider. |
| endpoint | POST /api/voice/live/sessions/[sessionId]/close | `apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts` | Neighbour: ends a session. |
| service | voice-session-budget | `apps/web/app/api/voice/live/sessions/lib/voice-session-budget.ts` | Neighbour: metering of minutes. |
| service | free-voice-allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Neighbour: free monthly voice seconds. |
| service | live-voice-billing | `apps/web/lib/voice/live-voice-billing.ts:9` | Neighbour: one-minute blocks and lease. |
| component | VoiceSampleButton | `apps/web/features/chat/components/Voice/VoiceSampleButton.tsx` | Neighbour: plays a sample of a voice. |
| service | publishAgent | `apps/web/lib/services/custom-agent-service.ts:449` | Neighbour: draft versus published separation for text agents. |
| component | AgentPublishPanel | `apps/web/features/agents/components/AgentPublishPanel.tsx` | Neighbour: publish and share UI. |
| schema | ManagedCloudAgentSchema hasUnpublishedChanges | `packages/contracts/cloud-contracts/src/agents.ts:127` | Neighbour: draft flag. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No test-call flow exists. | device | audit/ledger/ecosystem-capability-ledger.jsonl: S51.10 |
| Neighbour: the browser posts a connection offer (sdp) to /api/voice/live/sessions; the route checks consent, limits and plan, reserves usage and calls the provider's live session endpoint. | our servers | apps/web/app/api/voice/live/sessions/route.ts:149, :300-309, :533 |
| Neighbour: audio then flows between the browser and the provider. | outside service | apps/web/app/api/voice/live/sessions/route.ts:533 (provider live/sessions call) [inferred for the direct audio path] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Test-call transcript or recording | Does not exist for voice agents | not applicable | unknown |
| Neighbour live voice usage rows | managed usage and free voice allowance events (apps/web/lib/voice/free-voice-allowance.ts:13-14) | server-held | unknown |

**Models and providers.** Neighbour live voice resolves a voice_live routing slot to a managed provider model and a separate backend slot for delegated reasoning (apps/web/app/api/voice/live/sessions/route.ts). A draft agent's model is undecided.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Neighbour live voice requires sign-in and an adult-eligibility check. |
| Permissions | Not defined for test calls. |
| Subscription | Neighbour: canUseVoice capability by plan and a free monthly voice allowance (apps/web/app/api/voice/live/sessions/route.ts:300-309; apps/web/lib/voice/free-voice-allowance.ts). For voice agents: none found. |
| Limits and metering | Neighbour: one-minute blocks (apps/web/lib/voice/live-voice-billing.ts:20) and a 10-minute lease (line 28). Whether test calls count is not specified. |
| Feature flags | canUseVoice for neighbour live voice; none for test calls. |
| Model compatibility | Unknown for voice agents. |
| Provider restrictions | Neighbour requires a managed provider. |
| Local mode | Not available for test calls. The neighbour live voice route is Cloud; no Local test path found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent | No test control exists. | audit/ledger/ecosystem-capability-ledger.jsonl: S51.10 |
| Neighbour personal voice: reconnecting, audio blocked, timeout, cancel task | The voice screen has text for 'Reconnecting, attempt', 'Tap to hear the assistant', a stop-task button and a timed-out icon. | apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:35-60, 570-595 |
| Metering, transcript visibility for tests | Not specified and not handled in the code. | knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Neighbour personal voice screen.
- `apps/web/features/chat/hooks/useVoiceSession.test.tsx`: Neighbour voice session hook.
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Neighbour live voice session client logic.
- `apps/web/lib/voice/__tests__/live-voice-billing.test.ts`: Neighbour billing blocks.
- `apps/web/app/api/voice/live/sessions/lib/__tests__/voice-session-store.test.ts`: Neighbour server session store.
- `apps/web/features/agents/__tests__/AgentPublishPanel.test.tsx`: Neighbour publish panel.

**Test scenarios**

- **Confirm absence**
  1. Open an agent in /chat/agents.
  2. Look for a call or talk control.
  - Expected: None (today).
- **Draft not published (future)**
  1. Edit instructions without publishing.
  2. Test-call.
  - Expected: Call follows the edited draft.
- **Mic denied (future)**
  1. Block microphone.
  2. Start a test.
  - Expected: Clear message and text fallback.
- **Metering (future)**
  1. Run a one-minute test.
  2. Check usage.
  - Expected: Usage matches the stated rule.

**Where to look when it fails**

- No voice-agent logs. Neighbour: voice session settlement in apps/web/app/api/voice/live/sessions/lib/voice-session-settlement.ts and the voice-session errors from describeLiveSessionFailure (apps/web/lib/voice/live-voice-billing.ts:98).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No test-call control or draft-bound session** Affects: Web, Desktop, Mobile owners. Evidence: ledger S51.10 missing; session request has no agent (route.ts:149-162). Work needed: Extend session creation to accept a draft agent and build the control.
- **Metering and transcript visibility for tests unspecified** Affects: product and billing. Evidence: brief. Work needed: Decide and write requirement.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- F051-01
- F051-02
- F051-03
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-model-catalog-and-routing
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud

## Unknown

- Whether test calls use the same managed route or a cheaper one.
- Whether desktop would test locally.
- Retention of test transcripts.
