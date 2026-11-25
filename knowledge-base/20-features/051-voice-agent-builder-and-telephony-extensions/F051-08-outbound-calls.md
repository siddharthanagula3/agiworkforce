---
id: "F051-08"
type: "feature"
title: "Outbound calls"
aliases: ["Outbound calls", "S51.16 Outbound calling, only where offered and authorized", "authorized outbound calling"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.16"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "F051-07", "F051-09", "F051-10", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-execution-boundaries", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-08 Outbound calls

A planned feature that would let a voice agent place phone calls, only where the product offers it and the owner is authorised. It is not built on web, desktop, mobile or the API. The Twilio chat connector advertises voice calls, but no calling code exists.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.16](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5116).

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

**What it does.** Would let a voice agent start a phone call to a person, for example a reminder or a follow-up, under authorisation and consent rules. Today nothing places a call (audit/ledger/ecosystem-capability-ledger.jsonl:1676).

**Why it exists.** The brief lists outbound calling as a part of the voice-agent builder, limited to where it is offered and authorised (S51.16 in data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md). The 'only where offered and authorised' wording points at legal and consent limits on automated calls [inferred].

**Who uses it.** Business owners who run a voice agent and are allowed to call out. Not the CLI, VS Code or Chrome apps (ledger n/a).

**Problems it solves**

- Agents can only answer calls, never start them [inferred].
- Follow-ups and reminders need a person to dial by hand [inferred].

**Use cases**

- An appointment agent calls a client to confirm a booking [proposed].
- A collections or survey agent calls a list of consenting contacts [proposed].
- A support agent calls back a customer who left a voicemail [proposed].

## 2. User experience

**Where to find it**

- Web: not present (audit/ledger/ecosystem-capability-ledger.jsonl:1676).
- Desktop: not present. Desktop shows the hosted web app (AGENTS.md section 5).
- Mobile: not present.
- CLI, VS Code, Chrome: not applicable.

**Before you start**

- None can be met today.
- Intended [proposed]: a voice agent, an authorised caller number (see F051-07), consent for each contact, and an entitlement.

**Screens and controls**

- No screen or control exists in the code.
- Intended [proposed]: a Call button or campaign on a voice agent, a list of authorised numbers, and a stop control.

**Journey**

1. Today: not possible.
2. Intended [proposed]: 1 pick an agent; 2 pick an authorised number to call from; 3 enter who to call; 4 the product checks authorisation and calling limits; 5 the call starts; 6 the result lands in call records (F051-09).

**What the person sees and gets**

- Nothing today.
- Intended [proposed]: call status (ringing, connected, failed), a refusal message when authorisation or consent is missing.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The Twilio connector card says 'SMS, WhatsApp messages, and voice calls' (apps/web/features/connectors/data/connectors.ts:659).

**Incomplete**

- That card is the only mention of calls and the audit found it contradicted by behaviour (audit/doc-corrections/contradictions-register.md:80-86).

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Outbound calling is missing on web, desktop, mobile and the API (audit/ledger/ecosystem-capability-ledger.jsonl:1676).
- CLI, VS Code, Chrome: not applicable (same row).

## 4. Required behaviour

**Established requirements**

- A voice agent can place authorized outbound phone calls, only where offered. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.16)
- Connector copy must not claim voice calls while no telephony exists. (source: audit/doc-corrections/contradictions-register.md:86)
- An action a user cannot undo asks first and names the consequence; a placed call cannot be undone. (source: AGENTS.md section 9)
- Nothing may silently route a Local chat, file or session to BYOK or managed cloud. (source: AGENTS.md section 6)

**Acceptance criteria**

1. An outbound call can only start from a number the owner is authorised to use.
2. A call to a contact without recorded consent is refused with a plain message.
3. The owner confirms a call with a prompt naming the cost and effect before it starts.
4. Calling limits per owner and per contact apply and are configuration, not constants (AGENTS.md section 8).
5. Each outbound call appears in call records with an outcome (F051-09).
6. Outbound calling is hidden or refused where the product does not offer it (plan, region or app).
7. Minutes used are metered to the subscription system (F051-10).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Authorisation, consent and calling-time rules vary by country and need legal review before launch [inferred; no document in docs/compliance was found for calls].
- Because a call goes through a carrier, it cannot be a Local-only feature [inferred].

**Proposed improvements** (suggestions, not requirements)

- Require a consent record per contact and an owner confirmation before every campaign [proposed].
- Start with single test calls to the owner's own verified number [proposed].
- Define rate limits and quiet hours as configuration [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | S51.16 with status missing on web, desktop, mobile and API. |
| other | Capability ledger row | `audit/ledger/ecosystem-capability-ledger.jsonl` | Line 1676 holds S51.16 and the n/a reasons for CLI, VS Code, Chrome. |
| other | Missing-work list | `audit/missing/051-voice-agent-builder-and-telephony-extensions.md` | Lists S51.16 as open, wave 4, build on web, desktop, mobile, api. |
| config | Twilio connector card | `apps/web/features/connectors/data/connectors.ts` | Lines 657-666; the only place that mentions voice calls. |
| config | Connector registration | `apps/web/lib/connectors/catalog.ts` | Line 228: twilio as MCP connector, api-key. |
| config | Connector trust level | `packages/contracts/cloud-contracts/src/connector-trust-copy.ts` | Line 119: twilio is high-impact, so approval prompts apply to its chat tools. |
| config | Vendor directory record | `apps/web/lib/connectors/directory/sources/vendor-directory.json` | Lines 7283-7296: documentation MCP, read capability only. |
| other | Contradiction CR-005 | `audit/doc-corrections/contradictions-register.md` | Logs the misleading 'voice calls' copy. |
| service | Live voice session billing | `apps/web/lib/voice/live-voice-billing.ts` | Adjacent: reserves and settles in-app live voice by the minute; a pattern for call minutes [inferred]. |
| endpoint | Live voice sessions route | `apps/web/app/api/voice/live/sessions/route.ts` | Adjacent: shows how a voice session checks plan and budget before starting. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No outbound call step exists in the code. | our servers | audit/ledger/ecosystem-capability-ledger.jsonl:1676 |
| Intended [proposed]: our servers check authorisation, consent and limits, reserve call minutes, ask a carrier to dial, bridge audio to a speech and model route, then settle minutes when the call ends. The in-app live voice session works this way for minutes (reserve then settle) but not for phone lines. | our servers | apps/web/lib/voice/live-voice-billing.ts:1-30 |
| The carrier connects the call over the phone network. | outside service | none; proposed, no code |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Call attempt, consent record, calling limits | none found in the code; no table exists | not applicable | not applicable |

**Models and providers.** No model or provider takes part today. A future call would need speech in, a model, and speech out; the in-app live voice uses a plan-chosen backend model resolved from the catalog (apps/web/app/api/voice/live/sessions/route.ts:319). Whether phone calls reuse that route is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code for calling. Intended authorisation is unspecified in the brief. |
| Subscription | none found in the code for calling. In-app live voice is gated by getTierPolicy(planTier).allowVoice (apps/web/app/api/voice/live/sessions/route.ts:311). |
| Limits and metering | none found in the code for calls. Live voice meters by the minute in blocks (apps/web/lib/voice/live-voice-billing.ts:21-27). |
| Feature flags | none found in the code. |
| Model compatibility | not applicable today. |
| Provider restrictions | unknown; no carrier chosen. |
| Local mode | Not available; the feature does not exist and a phone call needs a carrier [inferred]. No Local call path exists in any app. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent | No loading, error, retry, cancel, timeout, offline or reconnect states exist. | audit/ledger/ecosystem-capability-ledger.jsonl:1676 |
| Connector copy mismatch | Card promises voice calls that do not exist. | apps/web/features/connectors/data/connectors.ts:659 |
| Consent missing, over limit, called party hangs up, call fails | not handled in the code; no code exists. | searched repository, no telephony source files |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/voice/__tests__/live-voice-billing.test.ts`: Minute-based billing of in-app live voice. Adjacent; no outbound-call test exists.

**Test scenarios**

- **Confirm absence**
  1. Search the web app for a Call or Dial control on a voice agent.
  2. Search apps/web/app/api for call routes.
  - Expected: None found.
- **When built: authorised call**
  1. Pick an agent and an authorised number.
  2. Call the owner's own verified phone.
  - Expected: Phone rings, agent speaks, record appears with an outcome.
- **When built: unauthorised call**
  1. Try to call from a number the account does not own.
  - Expected: Refused with a clear message; nothing dialled.
- **When built: no consent**
  1. Call a contact flagged as not consenting.
  - Expected: Refused.
- **When built: limit reached**
  1. Place calls until the configured limit is hit.
  - Expected: Next call is refused with the limit and reset time.

**Where to look when it fails**

- Check ledger row S51.16 for status.
- Nothing was run for this page; no result is claimed.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No outbound calling exists.** Affects: Owners on web, desktop, mobile and API. Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1676. Work needed: Carrier integration, authorisation model, consent store, limits, metering, UI.
- **Authorisation check, calling limits and consent rules are not specified.** Affects: All future callers. Evidence: S51.16 gives only the one-line Should. Work needed: Write the rules in docs/product and docs/compliance before building.
- **Misleading connector copy.** Affects: Web connector users. Evidence: audit/doc-corrections/contradictions-register.md:86. Work needed: Reword.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- F051-07
- F051-09
- F051-10
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-execution-boundaries
- mode:cloud

## Unknown

- The authorisation model for outbound calls.
- Calling limits and consent rules.
- Which regions and plans would be offered outbound calling.
- Whether the Twilio MCP tools in chat can dial.
- Whether phone calls reuse the in-app live voice backend.
