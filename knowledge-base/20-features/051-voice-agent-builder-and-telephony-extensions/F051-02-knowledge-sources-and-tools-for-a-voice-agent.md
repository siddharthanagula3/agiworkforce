---
id: "F051-02"
type: "feature"
title: "Knowledge sources and tools for a voice agent"
aliases: ["Knowledge-source setup", "Tool and MCP setup", "Voice agent knowledge", "S51.05", "S51.06"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.05", "S51.06"]
depends_on: ["F051-01", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-voice-and-media", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-02 Knowledge sources and tools for a voice agent

Intended: attach documents, sites, tools and MCP servers to a voice agent so it answers from them and acts during a call. Not built for voice agents. Text agents already hold up to 20 knowledge files and connector lists, and personal live voice has a tool registry, as neighbours only.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.05](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5105), [S51.06](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5106).

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

**What it does.** Intended: grounded answers on calls from attached documents or sites, and tools or MCP servers callable during a call (S51.05, S51.06). No voice-agent version exists (audit/missing/051-voice-agent-builder-and-telephony-extensions.md).

**Why it exists.** A phone bot that only talks cannot answer company-specific questions or take actions; the audit marks both as open (audit/ledger/ecosystem-capability-ledger.jsonl: S51.05, S51.06).

**Who uses it.** Intended: owners of voice agents on Web, Desktop and Mobile.

**Problems it solves**

- Callers get answers from the owner's own material, not guesses.
- The agent can look up or do something during the call, for example check an order.

**Use cases**

- A clinic attaches an FAQ document so the bot answers opening-hours questions.
- A shop connects an order-lookup tool so the bot reads order status.
- A team attaches a website so the bot cites its policy pages.

## 2. User experience

**Where to find it**

- Web: not available for voice agents. Neighbour: text-agent editor has a 'Knowledge' section with an 'Add files' button (apps/web/features/agents/components/AgentKnowledgePanel.tsx:106,134) at /chat/agents.
- Desktop and Mobile: not available (audit/ledger/ecosystem-capability-ledger.jsonl: S51.05, S51.06).

**Before you start**

- A voice agent must exist first (F051-01), which it does not.

**Screens and controls**

- None for voice agents. Neighbour text agents also offer skill selection (apps/web/features/agents/components/AgentSkillSelection.tsx) and website allow or block lists (apps/web/features/agents/components/AgentConfigForm.tsx:232).

**Journey**

1. Intended: open the agent's settings, add a document or site, pick tools or an MCP server, save, test on a call.
2. Today: not possible.

**What the person sees and gets**

- None today. Failure behaviour and limits are not specified and not built (brief).

**Settings**

- None for voice agents. Neighbour limits: 20 files per agent, 512,000 bytes per file (packages/contracts/cloud-contracts/src/agents.ts:25-26).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Text agents accept uploaded knowledge files with a virus or unsafe-file check, a 20-file count limit and storage in user_agent_files (apps/web/app/api/custom-agents/[id]/files/route.ts; apps/web/lib/services/custom-agent-service.ts:767-785).
- Text agents hold connectorIds and skillNames selections (packages/contracts/cloud-contracts/src/agents.ts:89-115).
- Personal live voice has a registry of tools it may use, each with risk, approval and timeout (apps/web/lib/voice/live-voice-tools.ts:88).

**Incomplete**

- Live voice delegation tools come from the user's connectors and MCP definitions for the signed-in user, not from a per-agent selection (apps/web/lib/voice/live-voice-tools.ts:295, imports loadMcpToolDefs).

**Present but disconnected or switched off**

- Twilio exists only as a chat connector entry with capability 'SMS, WhatsApp messages, and voice calls' (apps/web/features/connectors/data/connectors.ts:657-660); no voice agent uses it.

**Not available**

- Knowledge sources and tools for a voice agent on Web, Desktop, Mobile and API (audit/ledger/ecosystem-capability-ledger.jsonl: S51.05, S51.06 missing).

## 4. Required behaviour

**Established requirements**

- Knowledge sources (documents, sites) can be attached to a voice agent for grounded answers on calls. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.05)
- Tools and MCP servers can be attached to a voice agent and invoked during calls. (source: S51.06)

**Acceptance criteria**

1. An owner attaches a document and a site to a voice agent and sees them listed.
2. A test question answered from the document cites or reflects its content.
3. A tool or MCP server attached to the agent is callable during a call and its result is spoken.
4. A tool not attached to the agent cannot be called.
5. A failing knowledge fetch or tool call gives a spoken, safe fallback and is logged.
6. Uploads are scanned and size-limited with a visible message when refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] High-impact tools such as Twilio are marked high-impact in the trust copy, so a voice agent would need an approval or explicit owner consent step (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:119).
- [inferred] Per-agent tool allow lists must not bypass the tool approval policy the live voice route already loads.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse the text-agent knowledge files and connector selection for voice agents.
- [proposed] Show on each tool whether a spoken confirmation is required.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Capability ledger rows S51.05 and S51.06 | `audit/ledger/ecosystem-capability-ledger.jsonl` | Records missing on web, desktop, mobile and api. |
| other | Area brief | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | Should lines for S51.05 and S51.06. |
| component | AgentKnowledgePanel | `apps/web/features/agents/components/AgentKnowledgePanel.tsx` | Neighbour: text-agent knowledge upload UI. |
| endpoint | /api/custom-agents/[id]/files | `apps/web/app/api/custom-agents/[id]/files/route.ts` | Neighbour: list and add knowledge files. |
| endpoint | /api/custom-agents/[id]/files/[fileId] | `apps/web/app/api/custom-agents/[id]/files/[fileId]/route.ts` | Neighbour: remove a knowledge file. |
| service | addAgentFile | `apps/web/lib/services/custom-agent-service.ts:767` | Neighbour: enforces file count and inserts the file. |
| table | user_agent_files | `apps/web/lib/services/custom-agent-service.ts:785` | Neighbour: stores knowledge file text and hash. |
| service | agent-file-text | `apps/web/lib/agents/agent-file-text.ts` | Neighbour: extracts text from agent files. |
| schema | AgentConfigSchema connectorIds, skillNames, allowed/blocked domains | `packages/contracts/cloud-contracts/src/agents.ts:89` | Neighbour: selection fields for tools and sites. |
| component | AgentSkillSelection | `apps/web/features/agents/components/AgentSkillSelection.tsx` | Neighbour: pick skills for a text agent. |
| service | live-voice-tools registry | `apps/web/lib/voice/live-voice-tools.ts:88` | Neighbour: tools reachable from personal live voice with risk and timeouts. |
| service | live-voice-tool-runner | `apps/web/lib/voice/live-voice-tool-runner.ts` | Neighbour: runs approved function tools for live voice. |
| config | Twilio connector entry | `apps/web/features/connectors/data/connectors.ts:657` | Chat connector for SMS, WhatsApp and voice calls; not a voice-agent integration. |
| config | Twilio MCP connector | `apps/web/lib/connectors/catalog.ts:228` | Declares twilio as an MCP connector with api-key auth. |
| config | Connector trust level | `packages/contracts/cloud-contracts/src/connector-trust-copy.ts:119` | Marks twilio high-impact. |
| command | Desktop MCP OAuth list | `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1999` | Lists twilio among known MCP providers in the Tauri build. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No voice-agent knowledge or tool flow exists. | device | audit/ledger/ecosystem-capability-ledger.jsonl: S51.05, S51.06 |
| Neighbour: an uploaded file is scanned, text extracted and stored against a text agent, then supplied to that agent's chats. | our servers | apps/web/app/api/custom-agents/[id]/files/route.ts; apps/web/lib/services/custom-agent-service.ts:767-790 |
| Neighbour: a live voice session delegates tool use to a provider-hosted turn; hosted tools run inside the provider, function tools need a step the session lacks. | outside service | apps/web/lib/voice/live-voice-tools.ts:44-62 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Voice-agent knowledge sources and tool selections | Does not exist | not applicable | unknown |
| Text-agent knowledge files (neighbour) | table user_agent_files (apps/web/lib/services/custom-agent-service.ts:785) | server-held; available to the same account on other apps through the API [inferred] | deleted by a delete statement on file removal (apps/web/lib/services/custom-agent-service.ts:808) |

**Models and providers.** A voice agent's grounding and tool calls would run through a provider model; none is wired. Neighbour live voice uses a routing slot (voice_live) and delegates to a backend model slot; tools are provider-hosted (apps/web/lib/voice/live-voice-tools.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not defined for voice agents; text-agent files require an owned agent (apps/web/lib/services/custom-agent-service.ts: requireOwnedAgent used by files route). |
| Permissions | Not defined. Neighbour live voice tools are limited by a loaded tool approval policy and connector permissions (apps/web/lib/voice/live-voice-tools.ts imports). |
| Subscription | None found for voice agents. Neighbour custom remote MCP counts are limited by plan (apps/web/lib/voice/live-voice-tools.ts imports getCustomRemoteMcpLimit). |
| Limits and metering | None for voice agents. Text agents: 20 files, 512,000 bytes each (packages/contracts/cloud-contracts/src/agents.ts:25-26). |
| Feature flags | None found for voice agents. |
| Model compatibility | Unknown. |
| Provider restrictions | Unknown; neighbour live voice needs a managed provider route. |
| Local mode | Not available; no voice-agent code runs in Local mode, and no local retrieval for voice agents was found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent | No controls exist on any app. | audit/ledger/ecosystem-capability-ledger.jsonl: S51.05, S51.06 |
| File limit reached (neighbour) | Text agents refuse the 21st file with 'An agent holds up to 20 files.' | apps/web/lib/services/custom-agent-service.ts:779-780 |
| Unsafe upload (neighbour) | refuseUnsafeUpload blocks it on the files route. | apps/web/app/api/custom-agents/[id]/files/route.ts |
| Tool failure, timeout, offline during a call | not handled in the code for voice agents; neighbour live voice defines per-tool timeouts (apps/web/lib/voice/live-voice-tools.ts:76). | apps/web/lib/voice/live-voice-tools.ts:76 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/agents/__tests__/AgentKnowledgePanel.test.tsx`: Neighbour text-agent knowledge panel.
- `apps/web/lib/voice/__tests__/live-voice-tools.test.ts`: Neighbour live voice tool registry and resolution.
- `apps/web/lib/voice/__tests__/live-voice-tool-runner.approval-parity.test.ts`: Neighbour live voice tool approval parity.
- `apps/web/lib/agents/__tests__/custom-agent-service.test.ts`: Neighbour text-agent service.

**Test scenarios**

- **Confirm absence**
  1. Open /chat/agents.
  2. Open an agent's settings.
  3. Look for voice or call knowledge or tool controls.
  - Expected: Only text-agent Knowledge exists; no voice controls (today).
- **Grounded answer (future)**
  1. Attach a document with a unique fact.
  2. Test-call the agent and ask for it.
  - Expected: The spoken answer contains the fact.
- **Detached tool (future)**
  1. Attach tool A only.
  2. Ask the agent to use tool B.
  - Expected: Refused or unavailable, no call made.
- **Failing source (future)**
  1. Attach a source that errors.
  2. Ask a question that needs it.
  - Expected: Spoken fallback; failure logged.

**Where to look when it fails**

- No voice-agent logs. Neighbours: user_agent_files rows; live voice tool timeouts and withdrawal logic in apps/web/app/api/voice/live/sessions/lib/__tests__/live-voice-withdrawal.test.ts.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No knowledge-source setup for voice agents** Affects: Web, Desktop, Mobile owners. Evidence: ledger S51.05 missing. Work needed: Attach knowledge to a voice-agent record; retrieval at call time.
- **No per-agent tool or MCP selection for calls** Affects: Web, Desktop, Mobile owners. Evidence: ledger S51.06 missing; live voice tools are per user (apps/web/lib/voice/live-voice-tools.ts:295). Work needed: Per-agent allow list tied to the tool approval policy.
- **Failure behaviour and limits unspecified** Affects: product definition. Evidence: brief. Work needed: Write the requirement.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- F051-01
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-voice-and-media
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud

## Unknown

- How retrieval would run during a phone call and its latency budget.
- Whether site knowledge would be crawled and how often.
- Which MCP servers would be allowed on a public phone line.
