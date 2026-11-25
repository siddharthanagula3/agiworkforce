---
id: "F051-04"
type: "feature"
title: "Transfer a live call to a human"
aliases: ["Human-transfer action", "Warm transfer", "Cold transfer", "S51.09"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.09"]
depends_on: ["F051-01", "F051-03", "SYS-voice-and-media", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "surface:web", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-04 Transfer a live call to a human

Intended: a voice agent moves a live call to a person, warm (introduced first) or cold (handed over directly). Not built on any app and no telephony code exists. Do not confuse it with the existing agent ownership transfer, which only changes who owns a text agent.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.09](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5109).

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

**What it does.** Intended: during a call the agent hands the caller to a human, either with an introduction or directly (S51.09). Nothing exists (audit/missing/051-voice-agent-builder-and-telephony-extensions.md).

**Why it exists.** Some callers need a person; it is the main safety exit for a phone bot and the 'human' option of fallback (S51.25).

**Who uses it.** Intended: owners who configure targets, and callers who are transferred.

**Problems it solves**

- Callers are not stuck with a bot that cannot help.
- Humans receive context before taking over (warm).

**Use cases**

- Billing question goes to the accounts desk with a spoken summary.
- Caller says 'agent' and is connected at once (cold).
- After-hours call goes to an on-call mobile number [proposed].

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile: not available (audit/ledger/ecosystem-capability-ledger.jsonl: S51.09 missing).
- The custom agent 'transfer' route at /api/custom-agents/[id]/transfer changes ownership of a text agent; it is not a call transfer (apps/web/app/api/custom-agents/[id]/transfer/route.ts:20-28).

**Before you start**

- A voice agent, a phone or web call path and a transfer target, none of which exist.

**Screens and controls**

- None.

**Journey**

1. Intended: owner sets a target and mode; during a call the agent decides or the caller asks; the call moves.
2. Today: not possible. Who may be a target and what happens when no human answers are not specified.

**What the person sees and gets**

- None.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for call transfer. Neighbour only: ownership transfer of a text agent with an audit event (apps/web/app/api/custom-agents/[id]/transfer/route.ts:20-28).

**Incomplete**

- none found

**Present but disconnected or switched off**

- Twilio appears only as a chat connector with capability 'SMS, WhatsApp messages, and voice calls' (apps/web/features/connectors/data/connectors.ts:657-660) and a high-impact trust label (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:119); no transfer code uses it.

**Not available**

- Call transfer on Web, Desktop, Mobile and API (audit/ledger/ecosystem-capability-ledger.jsonl: S51.09 missing). No telephony code in the CLI, VS Code or Chrome (ledger S51.01 notes).

## 4. Required behaviour

**Established requirements**

- A voice agent can transfer a live call to a human (warm or cold transfer). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.09)

**Acceptance criteria**

1. An owner can set one or more human targets and a transfer mode per agent.
2. On a cold transfer the caller is connected without an introduction.
3. On a warm transfer the human hears a summary before the caller joins.
4. If nobody answers, the agent returns to the caller and offers voicemail or callback.
5. The transfer and its outcome are recorded with the call.
6. Transfers need explicit owner consent for each target.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A transfer places a call to a third party, which Twilio-class connectors rate high-impact (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:119), so it needs owner-approved targets only and never a number the caller supplies.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Limit targets to a verified list and rate-limit transfers per hour.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief S51.09 | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | Should line. |
| other | Capability ledger S51.09 | `audit/ledger/ecosystem-capability-ledger.jsonl` | Records missing. |
| other | Missing-work file | `audit/missing/051-voice-agent-builder-and-telephony-extensions.md` | Open Wave 4 item. |
| endpoint | POST /api/custom-agents/[id]/transfer (ownership) | `apps/web/app/api/custom-agents/[id]/transfer/route.ts` | Different feature: changes text-agent owner. |
| service | transferAgent | `apps/web/lib/services/custom-agent-service.ts` | Ownership transfer service, not call transfer. |
| service | recordWorkspaceAuditEvent | `apps/web/lib/workspace-audit.ts` | Audit trail used for ownership transfer; a model for logging call transfers. |
| config | Twilio connector entry | `apps/web/features/connectors/data/connectors.ts:657` | Chat connector listing voice calls; not a voice-agent transport. |
| config | Twilio MCP declaration | `apps/web/lib/connectors/catalog.ts:228` | Declares twilio api-key MCP connector. |
| config | Twilio trust label | `packages/contracts/cloud-contracts/src/connector-trust-copy.ts:119` | high-impact class. |
| command | Desktop MCP provider list | `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1999` | Twilio in the Tauri MCP provider list. |
| service | live-voice-tools registry | `apps/web/lib/voice/live-voice-tools.ts:88` | Where a future transfer tool would be classed by risk and approval. |
| service | live-voice-tool-runner | `apps/web/lib/voice/live-voice-tool-runner.ts` | Runs approved live-voice function tools. |
| schema | Tool approval stakes | `packages/contracts/types/src/tool-approval-stakes.ts` | Only file in packages mentioning call-like stakes terms in a search; used to rank tool risk. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No call transfer flow exists; no telephony transport exists in any app. | our servers | audit/ledger/ecosystem-capability-ledger.jsonl: S51.09; search of apps and packages found no telephony code |
| Intended [inferred]: a phone carrier outside our systems would carry the call, so transfer would run on an outside service. | outside service | No code; reasoning only |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Transfer targets and outcomes | Does not exist | not applicable | unknown |

**Models and providers.** A model would decide when to transfer; none is wired. No telephony provider folder exists under packages/ai/providers for this [inferred from search finding none].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not defined. |
| Permissions | Not defined; [inferred] owner-only configuration. |
| Subscription | None found in the code. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code. |
| Model compatibility | Unknown. |
| Provider restrictions | Unknown; carrier choice not decided. |
| Local mode | Not available. A phone transfer needs a carrier outside the device [inferred]; no Local code exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No human answers | Not specified in the brief; not handled in the code. | knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md |
| Invalid target, busy, dropped call, accessibility | not handled in the code. | No telephony code found |
| Name clash with ownership transfer | The existing 'transfer' route is ownership only and returns 204. | apps/web/app/api/custom-agents/[id]/transfer/route.ts:28 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/custom-agents/[id]/transfer/route.test.ts`: Ownership transfer of a text agent; not call transfer.
- `apps/web/lib/voice/__tests__/live-voice-tool-runner.approval-parity.test.ts`: Approval behaviour for live voice tools.

**Test scenarios**

- **Confirm absence**
  1. Search the app for a call or phone control.
  2. Open /chat/agents.
  - Expected: No call transfer feature (today).
- **Cold transfer (future)**
  1. Configure a target.
  2. Ask the agent for a person.
  - Expected: Caller connected directly.
- **Warm transfer (future)**
  1. Set warm mode.
  2. Trigger transfer.
  - Expected: Human hears a summary first.
- **No answer (future)**
  1. Use a target that does not answer.
  - Expected: Agent returns and offers voicemail or callback.

**Where to look when it fails**

- No log lines exist. Future work should log transfer attempts and outcomes with the call record (see S51.19).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No call transfer capability or telephony transport** Affects: Web, Desktop, Mobile owners and callers. Evidence: ledger S51.09 missing. Work needed: Choose carrier path, build transfer action with consent and logging.
- **Targets and no-answer handling unspecified** Affects: product definition. Evidence: brief. Work needed: Write the requirement.
- **Number provisioning and call routing, which a transfer needs, are also missing** Affects: all. Evidence: ledger S51.12 to S51.16 missing (rows outside this feature). Work needed: Build telephony base first.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- F051-01
- F051-03
- SYS-voice-and-media
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- surface:web
- mode:cloud

## Unknown

- Which carrier or SIP provider would carry calls.
- Who may be a target and how targets are verified.
- Whether transfers are billed as extra minutes.
