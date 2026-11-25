---
id: "F051-07"
type: "feature"
title: "Phone numbers and call routing"
aliases: ["Phone numbers and call routing", "S51.12 Phone-number provisioning", "S51.13 Bring-your-own-number setup", "S51.14 SIP connection setup", "S51.15 Inbound call routing", "number provisioning", "BYON", "SIP trunk setup", "routing rules"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.12", "S51.13", "S51.14", "S51.15"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "F051-09", "F051-11", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-api-and-contracts", "SYS-execution-boundaries", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-07 Phone numbers and call routing

A planned feature that would let an owner get or connect a phone number or SIP trunk and route inbound calls to a chosen voice agent by rules. Nothing is built on any app or in the API. The only telephony-related code is a Twilio chat connector with no calling feature behind it.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.12](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5112), [S51.13](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5113), [S51.14](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5114), [S51.15](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5115).

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

**What it does.** Would give a voice agent a way to be reached by phone: buy or provision a number, connect a number the owner already has, connect a SIP trunk or endpoint (an internet phone line), and choose by rules which agent answers an inbound call. Today it does nothing; all four brief items are missing on web, desktop, mobile and the API (audit/ledger/ecosystem-capability-ledger.jsonl:1672-1675).

**Why it exists.** A phone voice agent is useless without a number that callers can dial. The brief lists these four items as the entry point of the telephony part of the voice-agent builder (data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md S51.12-S51.15). The audit overview says telephony and a voice-agent builder are not built (audit/overview.md:161).

**Who uses it.** Business owners and admins who would run a voice agent that answers calls. Not the CLI, VS Code or Chrome apps: the ledger marks them n/a because they hold no telephony or voice-agent code (audit/ledger/ecosystem-capability-ledger.jsonl:1672).

**Problems it solves**

- Callers cannot reach an agent by phone because no number exists for it [inferred].
- Owners with an existing business number cannot keep it when moving to an AGI voice agent [inferred].
- Several agents and numbers need rules that decide which agent answers [inferred].

**Use cases**

- An owner buys a local number and points it at a front-desk agent [proposed].
- A company keeps its existing number and connects it through a SIP trunk to a support agent [proposed].
- Calls to a sales number go to a sales agent and calls to a support number go to a support agent [proposed].

## 2. User experience

**Where to find it**

- Web: not present. The brief and ledger mark it missing (audit/ledger/ecosystem-capability-ledger.jsonl:1672-1675).
- Desktop: not present (same ledger rows). Desktop shows the hosted web app in Electron, so a web screen would appear there too (AGENTS.md section 5).
- Mobile: not present (same ledger rows).
- CLI, VS Code, Chrome: not applicable (audit/ledger/ecosystem-capability-ledger.jsonl:1672).
- Nearest thing a person can reach today: the Twilio entry in the connectors list, category 'Communication' (apps/web/features/connectors/data/connectors.ts:657-666). It does not buy or route numbers.

**Before you start**

- None can be met today because the feature is absent.
- Intended [proposed]: a signed-in account, a plan that includes voice agents, and a voice agent to attach (see F051-11 for agent versions).

**Screens and controls**

- No screen, control or label exists in the code. A search of the repository for telephony terms found no source files outside the audit and the connector catalog (searched: twilio, telnyx, sip trunk, inbound call, outbound call, voice agent, telephony).
- Intended per brief [proposed]: a Numbers list, Buy number, Connect existing number, Connect SIP, and a routing-rules editor.

**Journey**

1. Today: a person cannot start this task. The only related step is adding the Twilio connector with an API key in settings, which gives chat access to Twilio tools (apps/web/lib/connectors/catalog.ts:228).
2. Intended [proposed]: 1 open the voice agent; 2 choose Buy number, Connect existing number or Connect SIP; 3 verify ownership of an existing number; 4 add routing rules; 5 place a test call; 6 see the number go live.

**What the person sees and gets**

- Nothing is shown today.
- Intended [proposed]: number status, verification result, and what a caller hears when no rule matches (the brief does not specify this).

**Settings**

- None found in the code for number, SIP or routing settings.
- The Twilio connector's trust level is 'high-impact' (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:119), which is a connector approval setting, not call routing.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The Twilio connector entry exists in the web catalog with summary 'SMS, WhatsApp messages, and voice calls', auth type api_key (apps/web/features/connectors/data/connectors.ts:657-666).
- Twilio is registered as an MCP connector using an api-key flow (apps/web/lib/connectors/catalog.ts:228).
- The vendor directory holds a Twilio record pointing at Twilio's documentation MCP, with capabilities limited to read (apps/web/lib/connectors/directory/sources/vendor-directory.json:7283-7296).

**Incomplete**

- The connector summary promises voice calls but the audit found no telephony behind it; the contradiction is logged as CR-005 (audit/doc-corrections/contradictions-register.md:80-86).

**Present but disconnected or switched off**

- none found in the code: no telephony code exists that could be switched off.

**Not available**

- Number provisioning (S51.12), bring-your-own-number (S51.13), SIP setup (S51.14) and inbound routing (S51.15) are missing on web, desktop, mobile and the API (audit/ledger/ecosystem-capability-ledger.jsonl:1672-1675).
- CLI, VS Code and Chrome: not applicable (audit/ledger/ecosystem-capability-ledger.jsonl:1672).

## 4. Required behaviour

**Established requirements**

- Owners can buy or provision a phone number for a voice agent. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.12)
- Owners can connect an existing phone number (bring your own number) to a voice agent. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.13)
- Owners can connect a SIP trunk or SIP endpoint to route calls to a voice agent. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.14)
- Inbound calls to a number are routed to a chosen voice agent using routing rules. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.15)
- Connector copy must describe what the connector does in chat, not telephony. (source: audit/doc-corrections/contradictions-register.md:86)

**Acceptance criteria**

1. A signed-in owner can reach a screen to buy or provision a number for a named voice agent on web (and the same flow appears in the desktop app).
2. An owner can add an existing number and must prove ownership before it is routed.
3. An owner can connect a SIP trunk or endpoint and see a connection status.
4. A rule can send an inbound call to a chosen agent, and a test call reaches that agent.
5. A call that matches no rule gets defined behaviour (voicemail, a message or a hangup), set by the product.
6. Numbers and routes are refused for accounts whose plan or entitlement does not include voice agents.
7. The Twilio connector copy no longer promises voice calls unless calling exists.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Number and SIP setup needs a telephone carrier, which is an outside service, so it cannot run in Local mode on the device [inferred from how phone numbers work; no code to confirm].
- Because Local, own key and Cloud are separate trust boundaries (AGENTS.md section 6), a number routed to a cloud-hosted agent must show that it is a Cloud feature [inferred].

**Proposed improvements** (suggestions, not requirements)

- Own numbers through one carrier abstraction in a shared package, so apps never keep a private copy of carrier data (AGENTS.md section 3) [proposed].
- Define the no-match fallback and the ownership-verification step before building the UI, since the brief leaves them unspecified [proposed].
- Change the Twilio connector summary to say what it does in chat until calling ships [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | Lists S51.12-S51.15 with status missing on web, desktop, mobile and API. |
| other | Capability ledger rows | `audit/ledger/ecosystem-capability-ledger.jsonl` | Lines 1672-1675 hold the four items with cell status and the n/a reasons for CLI, VS Code and Chrome. |
| other | Missing-work list | `audit/missing/051-voice-agent-builder-and-telephony-extensions.md` | Generated list of open items, wave 4, 'Build on: web, desktop, mobile, api'. |
| config | Twilio connector entry | `apps/web/features/connectors/data/connectors.ts` | Lines 657-666: chat connector card with the 'voice calls' wording. |
| config | Connector catalog registration | `apps/web/lib/connectors/catalog.ts` | Line 228: registers twilio as an MCP connector with api-key auth. |
| config | Connector trust copy | `packages/contracts/cloud-contracts/src/connector-trust-copy.ts` | Line 119 marks twilio high-impact; line 222 holds its display name. |
| config | Vendor directory record | `apps/web/lib/connectors/directory/sources/vendor-directory.json` | Lines 7283-7296: Twilio documentation MCP record, capability read only. |
| config | Desktop MCP OAuth provider list | `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs` | Line 1999 lists twilio among known connectors in the Tauri build. |
| other | Contradiction CR-005 | `audit/doc-corrections/contradictions-register.md` | Records that the connector claims voice calls but no telephony exists. |
| service | Entitlement resolution | `apps/web/lib/services/entitlement-resolution.ts` | Existing plan check used by live voice sessions; the place a future number entitlement would plug in [inferred]. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Today no number, SIP or routing step exists in the code. The only reachable step is adding the Twilio connector, which the web app registers as an MCP connector with an API key. | device and our servers | apps/web/lib/connectors/catalog.ts:228 |
| Chat tool calls to the Twilio MCP would go to Twilio's own documentation endpoint listed in the directory record; the record is read-only documentation search, so it cannot buy or route numbers [inferred]. | outside service | apps/web/lib/connectors/directory/sources/vendor-directory.json:7283-7296 |
| Intended [proposed]: the owner's request reaches our servers, which call a carrier to buy or verify a number, store it against an agent, and answer inbound webhooks by applying routing rules. | our servers | none; proposed design, no code |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connector credential for Twilio (an API key the owner enters) | unknown for this connector; connector credential storage is described in SYS-connectors-plugins-and-skills | unknown | unknown |
| Phone numbers, SIP settings and routing rules | none found in the code; no table or schema exists (no migration under apps/web/db/neon mentions them) | not applicable | not applicable |

**Models and providers.** No model or provider takes part today. A future voice call would need a speech and model route; see F051-09 and SYS-voice-and-media. The Twilio provider is a connector vendor, not a model provider; there is no folder for it under packages/ai/providers [inferred from the connector files above].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for numbers or routing. The Twilio connector needs an account that can add connectors. |
| Permissions | none found in the code for numbers or routing. The Twilio connector is classed high-impact (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:119). |
| Subscription | none found in the code for telephony. The nearest rule is the live-voice plan check, getTierPolicy(planTier).allowVoice (apps/web/app/api/voice/live/sessions/route.ts:311), which is in-app voice, not phone. |
| Limits and metering | none found in the code for numbers or routing. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable today; no model is involved. |
| Provider restrictions | unknown. No carrier is chosen anywhere in the code. |
| Local mode | Nothing runs in Local mode because the feature does not exist. A real phone number needs a carrier, so a future version would need outside services [inferred]. Local inference stays free of any paid subscription as a product rule; whether a phone feature can honour it is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent (all states) | No loading, empty, error, retry, cancel, timeout, offline or reconnect states exist because no UI or API exists. | audit/ledger/ecosystem-capability-ledger.jsonl:1672-1675 |
| Owner clicks the Twilio connector expecting calls | The card advertises 'voice calls' but only chat MCP access exists; mismatch is a logged defect. | apps/web/features/connectors/data/connectors.ts:659; audit/doc-corrections/contradictions-register.md:80-86 |
| Accessibility and app differences | not handled in the code; nothing to handle. | searched repository, no telephony source files |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/voice/__tests__/live-voice-billing.test.ts`: Billing math for in-app live voice sessions. Adjacent only; no phone number or routing test exists.
- `apps/mobile/__tests__/phone-device-steps.test.ts`: Phone-device tool steps (calendar, reminders). Unrelated to telephony; named 'phone' because it targets the handset.

**Test scenarios**

- **Confirm absence**
  1. Open web settings and the Agents area.
  2. Look for Numbers, SIP or Routing controls.
  3. Search repository for telephony routes under apps/web/app/api.
  - Expected: No control or route exists, matching the brief.
- **Connector copy check**
  1. Open Connectors on web.
  2. Find Twilio.
  3. Read its summary.
  - Expected: Summary says 'SMS, WhatsApp messages, and voice calls'; record whether any tool can place a call (expected: none).
- **When built: buy a number**
  1. Open a voice agent.
  2. Choose Buy number and pick a number.
  3. Confirm purchase.
  - Expected: Number shows active and a call to it reaches the agent.
- **When built: unmatched call**
  1. Remove all routing rules.
  2. Call the number.
  - Expected: Caller hears the defined fallback; call is logged.
- **When built: entitlement refusal**
  1. Sign in on a plan without voice agents.
  2. Try to add a number.
  - Expected: Refused with a plan message, not a silent failure.

**Where to look when it fails**

- Check audit/ledger/ecosystem-capability-ledger.jsonl rows S51.12-S51.15 for status changes.
- Run pnpm audit:worklist to regenerate audit/missing when an item flips to done (header of audit/missing/051-voice-agent-builder-and-telephony-extensions.md).
- Nothing was run for this page; no test result is claimed.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Number provisioning, bring-your-own-number, SIP setup and inbound routing do not exist.** Affects: Owners on web, desktop (hosted web app) and mobile; API consumers. Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1672-1675. Work needed: Choose a carrier route, add tables and API, build owner screens, add entitlement and metering.
- **Twilio connector card promises voice calls.** Affects: Web connector users. Evidence: apps/web/features/connectors/data/connectors.ts:659; audit/doc-corrections/contradictions-register.md:86. Work needed: Reword the summary or ship calling.
- **No rule for number ownership verification or no-match fallback.** Affects: All future owners. Evidence: S51.13 and S51.15 in the area brief give no detail. Work needed: Decide and document in docs/product.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- F051-09
- F051-11
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-api-and-contracts
- SYS-execution-boundaries
- mode:cloud

## Unknown

- Which carrier or SIP provider would be used; none is named in the code or docs reviewed.
- How a number would be priced or metered.
- How the Twilio connector credential is stored.
- Whether any Twilio MCP tool exposed to chat can place a call.
- Whether Remote or mobile screens would carry a numbers list.
