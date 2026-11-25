---
id: "F051-03"
type: "feature"
title: "Guardrails, business hours and fallback"
aliases: ["Guardrail configuration", "Business-hours configuration", "Escalation and fallback behavior", "S51.08", "S51.24", "S51.25"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.08", "S51.24", "S51.25"]
depends_on: ["F051-01", "F051-04", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-03 Guardrails, business hours and fallback

Intended: per-agent limits for a voice bot, namely topics to avoid, disclosures, business hours that change behaviour, and a fallback to voicemail, callback or a human. Not built. Only text-agent website allow and block lists and daily turn limits exist as neighbours.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.08](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5108), [S51.24](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5124), [S51.25](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5125).

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

**What it does.** Intended: keeps a voice agent inside owner-set bounds, switches behaviour outside business hours and runs an escalation when it cannot help (S51.08, S51.24, S51.25). Nothing exists for voice agents (audit/missing/051-voice-agent-builder-and-telephony-extensions.md).

**Why it exists.** A public phone bot must not discuss forbidden topics, must state required disclosures and must not strand a caller; the audit lists all three as open.

**Who uses it.** Intended: owners of voice agents on Web, Desktop and Mobile.

**Problems it solves**

- Prevents the bot from drifting off-topic or giving advice it should not.
- Handles after-hours calls sensibly.
- Gives callers a way out when the bot fails.

**Use cases**

- A clinic forbids medical advice and requires a recorded-line notice.
- A shop sets 9 to 5 hours; after that the bot takes a message.
- A support line hands unresolved calls to a person or offers voicemail.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile: not available (audit/ledger/ecosystem-capability-ledger.jsonl: S51.08, S51.24, S51.25). Neighbour text-agent editor has website 'Only reads' and 'Never reads' lists (apps/web/features/agents/components/AgentConfigForm.tsx:273,284).

**Before you start**

- A voice agent (F051-01) that does not exist.

**Screens and controls**

- None for voice agents.

**Journey**

1. Intended: open settings, list topics to avoid, write a disclosure, set hours and a fallback, save.
2. Today: not possible. What the caller hears and what happens if the fallback fails are not specified.

**What the person sees and gets**

- None today.

**Settings**

- None for voice agents. Neighbour text agents: dailyTurnLimit, monthlyCreditLimit, allowed and blocked web domains (packages/contracts/cloud-contracts/src/agents.ts:89-115).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Neighbour text agents enforce website allow and block lists and turn or credit limits as settings fields (packages/contracts/cloud-contracts/src/agents.ts:89-115).
- Neighbour personal live voice applies site rules and a notice (apps/web/lib/voice/live-voice-tools.ts:431) and an adult-eligibility gate (apps/web/app/api/voice/live/sessions/route.ts, handleCreateLiveSession).

**Incomplete**

- No time or hours concept exists in the text-agent schema (packages/contracts/cloud-contracts/src/agents.ts:89-115).

**Present but disconnected or switched off**

- none found

**Not available**

- Guardrails, business hours and escalation or fallback for voice agents on Web, Desktop, Mobile and API (audit/ledger/ecosystem-capability-ledger.jsonl: S51.08, S51.24, S51.25 missing).

## 4. Required behaviour

**Established requirements**

- Guardrails (topics to avoid, disclosures, limits) can be configured per voice agent. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.08)
- A voice agent can be given business hours that change its behaviour outside them. (source: S51.24)
- A voice agent has configured escalation and fallback behaviour (voicemail, callback, human) when it cannot help. (source: S51.25)

**Acceptance criteria**

1. An owner can add topics to avoid and a disclosure and see them saved.
2. On a test call the disclosure is spoken first.
3. A forbidden topic is declined politely.
4. A call outside set hours follows the out-of-hours behaviour and a call inside hours does not.
5. When the agent cannot help, the configured fallback runs.
6. If the fallback fails, the caller hears a clear closing message and the failure is recorded.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Hours need a time zone per agent, because a number can be called from anywhere.
- [inferred] Guardrails must be enforced outside the model prompt as well, because AGENTS.md section 9 forbids weakening guards; prompt-only rules are weaker.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store hours with a time zone and holiday overrides.
- [proposed] Record every guardrail trigger for review.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | Should lines for S51.08, S51.24, S51.25. |
| other | Capability ledger | `audit/ledger/ecosystem-capability-ledger.jsonl` | Status missing for the three items. |
| other | Missing-work file | `audit/missing/051-voice-agent-builder-and-telephony-extensions.md` | Lists them as open Wave 4 work. |
| schema | AgentConfigSchema limits and domains | `packages/contracts/cloud-contracts/src/agents.ts:89` | Neighbour fields for domain lists and turn or credit limits. |
| component | AgentConfigForm domain lists | `apps/web/features/agents/components/AgentConfigForm.tsx:273` | Neighbour UI for 'Only reads' and 'Never reads' site lists. |
| service | custom-agent-service | `apps/web/lib/services/custom-agent-service.ts` | Neighbour: stores allowed_web_domains and limits on user_agents. |
| service | live-voice-prompts | `apps/web/lib/voice/live-voice-prompts.ts` | Neighbour: fixed instructions for personal live voice. |
| service | live-voice-tools site rules | `apps/web/lib/voice/live-voice-tools.ts:431` | Neighbour: notice when site rules limit tools. |
| service | Adult eligibility gate | `apps/web/lib/server/adult-eligibility-gate.ts` | Neighbour: age gate on live voice start. |
| service | Voice session budget | `apps/web/app/api/voice/live/sessions/lib/voice-session-budget.ts` | Neighbour: spend and allowance limits that end or refuse sessions. |
| service | Tool approval policy | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Neighbour: tool permission rules reused by live voice. |
| config | Connector trust copy | `packages/contracts/cloud-contracts/src/connector-trust-copy.ts:119` | Marks Twilio high-impact. |
| component | Privacy and voice disclosure test page | `apps/web/app/privacy/__tests__/VoiceAndIncidentDisclosure.test.tsx` | Neighbour: tests privacy copy about voice. |
| service | Workspace web-domain policy | `apps/web/lib/services/connector-policy-service.ts` | Neighbour: workspace domain policy read for live voice. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No guardrail, hours or fallback logic exists for voice agents. | our servers | audit/ledger/ecosystem-capability-ledger.jsonl: S51.08, S51.24, S51.25 |
| Neighbour: personal live voice start applies the age gate, plan gate, budget checks and workspace web-domain policy before opening a provider session. | our servers | apps/web/app/api/voice/live/sessions/route.ts:149-309 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Guardrail text, hours, fallback target | Does not exist | not applicable | unknown |

**Models and providers.** Guardrail enforcement through a model prompt versus code is undecided. Neighbour live voice composes fixed instructions from apps/web/lib/voice/live-voice-prompts.ts.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not defined for voice agents. |
| Permissions | Not defined. |
| Subscription | None found for voice agents. |
| Limits and metering | None found for voice agents. |
| Feature flags | None found for voice agents. |
| Model compatibility | Unknown. |
| Provider restrictions | Unknown. |
| Local mode | Not available; nothing runs in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent | No controls on any app. | audit/ledger/ecosystem-capability-ledger.jsonl: S51.08 |
| What the caller hears; fallback failure | Not specified in the brief and not handled in the code. | knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md |
| Time zone, holidays, offline | not handled in the code. | No hours field in packages/contracts/cloud-contracts/src/agents.ts:89-115 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/privacy/__tests__/VoiceAndIncidentDisclosure.test.tsx`: Neighbour privacy page voice disclosure.
- `apps/web/app/api/voice/live/sessions/lib/__tests__/voice-session-budget.test.ts`: Neighbour live voice limits.
- `apps/web/lib/voice/__tests__/live-voice-tools.test.ts`: Neighbour tool rules for live voice.

**Test scenarios**

- **Confirm absence**
  1. Open /chat/agents and an agent's settings.
  2. Look for topics, hours or fallback fields.
  - Expected: None exist for voice (today).
- **Disclosure first (future)**
  1. Set a disclosure.
  2. Start a test call.
  - Expected: The disclosure is spoken before anything else.
- **After hours (future)**
  1. Set hours that exclude now.
  2. Call.
  - Expected: Out-of-hours behaviour runs.
- **Fallback fails (future)**
  1. Set a fallback to an unreachable number.
  2. Trigger escalation.
  - Expected: Caller hears a closing message; failure recorded.

**Where to look when it fails**

- No voice-agent logs exist. Neighbour: voice session settlement and budget errors in apps/web/app/api/voice/live/sessions/lib/.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No guardrail configuration** Affects: Web, Desktop, Mobile owners. Evidence: ledger S51.08 missing. Work needed: Fields, enforcement and tests.
- **No business hours** Affects: same. Evidence: ledger S51.24 missing. Work needed: Schedule model with time zone and out-of-hours behaviour.
- **No escalation or fallback** Affects: same. Evidence: ledger S51.25 missing. Work needed: Fallback targets (voicemail, callback, human) and failure handling; depends on F051-04.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- F051-01
- F051-04
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud

## Unknown

- Whether guardrails are prompt text, code checks or both.
- Which disclosures the law requires per region; owned by docs/compliance, not read here.
- How hours interact with transfer targets.
