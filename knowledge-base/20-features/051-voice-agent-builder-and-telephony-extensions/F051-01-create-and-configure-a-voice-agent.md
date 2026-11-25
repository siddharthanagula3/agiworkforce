---
id: "F051-01"
type: "feature"
title: "Create and configure a voice agent"
aliases: ["Voice-agent creation wizard", "Voice agent builder", "Agent name and role", "System instructions for a voice agent", "Voice selection", "Conversation goals", "S51.01", "S51.02", "S51.03", "S51.04", "S51.07"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.01", "S51.02", "S51.03", "S51.04", "S51.07"]
depends_on: ["SYS-voice-and-media", "SYS-agents-tools-and-automation", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "SYS-model-catalog-and-routing", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-01 Create and configure a voice agent

A guided builder where an owner would name a phone or web voice bot, give it a role, instructions, a speaking voice and call goals, then save a draft. Not built on any app. Only a text-agent builder (Agents page) and a personal live-voice mode exist as neighbours.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.01](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5101), [S51.02](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5102), [S51.03](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5103), [S51.04](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5104), [S51.07](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5107).

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

**What it does.** Intended: lets an owner create a configurable voice agent (a phone or web voice bot) step by step, with a name, a role, editable system instructions, a chosen speaking voice and goals a call should reach (audit/ledger/ecosystem-capability-ledger.jsonl: rows S51.01 to S51.04 and S51.07). Today nothing of this exists for voice agents (audit/missing/051-voice-agent-builder-and-telephony-extensions.md).

**Why it exists.** Competing assistants ship hosted voice-agent builders; the project's audit lists this as open Wave 4 work (audit/missing/051-voice-agent-builder-and-telephony-extensions.md; audit/plan/waves.md:195). The ledger says builders of this kind ship as hosted dashboards (audit/ledger/ecosystem-capability-ledger.jsonl: S51.01 cli note).

**Who uses it.** Intended users are account owners on Web, Desktop and Mobile who want a bot that answers calls or speaks on a website. CLI, VS Code and Chrome are marked not applicable (audit/ledger/ecosystem-capability-ledger.jsonl: S51.01 cells).

**Problems it solves**

- No way today to define a persona and instructions for a voice bot that others (callers) talk to.
- The existing live voice mode is a personal assistant session for the signed-in user, not a configurable bot [inferred from apps/web/app/api/voice/live/sessions/route.ts:149, whose request has no agent, name or instruction field].

**Use cases**

- A shop owner names a bot 'Front desk', gives it opening hours and a polite tone, picks a voice and saves a draft.
- A support lead writes instructions and a goal such as 'book an appointment' for a web voice bot.
- A team copies the text-agent configuration idea (name, instructions) to a spoken agent [proposed].

## 2. User experience

**Where to find it**

- Web: not available. No voice-agent screen exists; the nearest screen is the text-agent builder at /chat/agents with a 'New agent' link (apps/web/features/agents/components/AgentsPage.tsx:188; apps/web/features/agents/lib/agent-display.ts:4).
- Desktop: not available. The public Desktop shows the hosted web app (AGENTS.md section 5), so it has the same absence; desktop settings only hold a voice persona selector (apps/desktop/src/features/settings/VoicePersonaSelector.tsx).
- Mobile: not available. Mobile has a text-agent client (apps/mobile/src/features/agents/service.ts:41) and a voice-language setting (apps/mobile/src/features/settings/voice-language/index.tsx), nothing for voice agents.
- CLI, VS Code, Chrome: not applicable (audit/ledger/ecosystem-capability-ledger.jsonl: S51.01 cells).

**Before you start**

- None can be met: the feature does not exist.
- Intended prerequisites are unknown; the brief names none (knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md).

**Screens and controls**

- No screen. The text-agent editor, for comparison only, has a 'Preferred model' select, 'Reasoning effort' select, 'Output examples' field and 'Conversation starters' fields (apps/web/features/agents/components/AgentConfigForm.tsx:467-537), but no voice, role or goal control.
- Existing live voice settings dialog titled 'Voice settings' with a 'Voice' control picks the personal live-voice voice (apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:41-45).

**Journey**

1. Intended: open the builder, start the wizard, fill name and role, write instructions, pick a voice, set goals, save a draft (brief S51.01 to S51.04, S51.07).
2. Today: the journey stops at step one because no entry point exists. Empty, waiting and failure states are not specified in the brief.

**What the person sees and gets**

- None today. Intended output is a saved draft voice agent; the shape is unknown.

**Settings**

- None for voice agents. Neighbouring text-agent limits: name 80 characters, instructions 32,000 characters (packages/contracts/cloud-contracts/src/agents.ts:15-20).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The text-agent builder works as a neighbour: create, list, publish and version text agents through /api/custom-agents (apps/web/app/api/custom-agents/route.ts:20-45; apps/web/lib/services/custom-agent-service.ts:339, :449). It is not a voice-agent builder.
- A personal live voice session works on web with a selectable voice list (packages/contracts/types/src/live-voices.ts:7-20; apps/web/app/api/voice/live/sessions/route.ts:149).

**Incomplete**

- The text-agent schema has name, instructions and conversation starters but no role, voice or goal field (packages/contracts/cloud-contracts/src/agents.ts:89-115).

**Present but disconnected or switched off**

- Nothing found that exists but is switched off for voice agents. A search of apps and packages for voice-agent, telephony, twilio and SIP found only the Twilio connector entries, the voice-agent-status test id in voice mode and audit files.

**Not available**

- Voice-agent wizard, name and role, instructions, voice selection and conversation goals on Web, Desktop and Mobile (audit/ledger/ecosystem-capability-ledger.jsonl: S51.01 to S51.04, S51.07: missing).
- Any /api voice-agent resource (ledger S51.02, S51.03, S51.04, S51.07 api: missing; S51.01 api: n/a).

## 4. Required behaviour

**Established requirements**

- A guided wizard creates a new voice agent (a configurable phone or web voice bot) step by step. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.01)
- A voice agent can be given a name and a role that it uses on calls. (source: S51.02)
- A voice agent has editable system instructions that govern its calls. (source: S51.03)
- The builder lets the owner pick the speaking voice a voice agent uses on calls. (source: S51.04)
- A voice agent can be configured with conversation goals (what a call should achieve). (source: S51.07)

**Acceptance criteria**

1. A signed-in owner on Web finds a clear entry point to create a voice agent.
2. The wizard saves a draft containing name, role, instructions, voice and goals, and reopening shows the same values.
3. Empty name or over-length instructions are refused with a visible message.
4. The chosen voice is the one used on a test call and a real call.
5. The same agent can be seen and edited from Desktop and Mobile, or the difference is stated.
6. Plan or quota refusals name the limit and offer an upgrade path.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Voice agents should reuse the text-agent save, draft, publish and version model rather than a second one, because AGENTS.md section 3 requires one owner per concept.
- [inferred] Voice choices should come from the shared voice list, not a private copy (AGENTS.md section 3).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add voice, role and goals to a shared agent contract in packages/contracts/cloud-contracts and render the wizard once in shared UI.
- [proposed] Give each wizard step an autosaved draft so leaving does not lose work.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | Lists items S51.01 to S51.25 with Should lines and status. |
| other | Missing-work file | `audit/missing/051-voice-agent-builder-and-telephony-extensions.md` | States each item is open, Wave 4, build on web, desktop, mobile and api. |
| other | Capability ledger | `audit/ledger/ecosystem-capability-ledger.jsonl` | Records status missing for S51.01 to S51.04 and S51.07 with n/a reasons for CLI, VS Code, Chrome. |
| schema | AgentConfigSchema (text agents, neighbour) | `packages/contracts/cloud-contracts/src/agents.ts:89` | Existing agent fields; no voice, role or goal fields. |
| endpoint | /api/custom-agents list and create | `apps/web/app/api/custom-agents/route.ts` | Neighbour: create and list text agents. |
| service | createAgent / publishAgent | `apps/web/lib/services/custom-agent-service.ts:339` | Neighbour: writes user_agents and user_agent_versions rows. |
| table | user_agents | `apps/web/lib/services/custom-agent-service.ts:351` | Neighbour table holding text-agent configuration. |
| table | user_agent_versions | `apps/web/lib/services/custom-agent-service.ts:473` | Neighbour table holding published versions. |
| screen | AgentsPage | `apps/web/features/agents/components/AgentsPage.tsx` | Neighbour: lists agents, 'New agent' link. |
| screen | AgentEditorPage / AgentConfigForm | `apps/web/features/agents/components/AgentConfigForm.tsx` | Neighbour: text-agent form to extend or model. |
| config | LIVE_VOICES | `packages/contracts/types/src/live-voices.ts` | Existing list of selectable live voices and the default. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts:149` | Personal live voice session; request has voice, language, pace, no agent. |
| component | VoiceSettingsModal | `apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx` | Existing voice picker UI for personal voice mode. |
| component | VoicePersonaSelector | `apps/desktop/src/features/settings/VoicePersonaSelector.tsx` | Desktop voice persona setting (personal, not agent). |
| service | Mobile agents client | `apps/mobile/src/features/agents/service.ts` | Mobile reads text agents from the managed API. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No voice-agent flow exists. Nothing runs when a person looks for a wizard. | device | audit/ledger/ecosystem-capability-ledger.jsonl: S51.01 web, desktop, mobile missing |
| Neighbour flow: the text-agent editor posts a config to /api/custom-agents, which validates it and inserts a user_agents row. | our servers | apps/web/app/api/custom-agents/route.ts:28-37; apps/web/lib/services/custom-agent-service.ts:351 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Voice-agent configuration (name, role, instructions, voice, goals) | Does not exist; no table or column found for it | not applicable | unknown |

**Models and providers.** No voice-agent model use exists. The neighbour live voice route resolves a routing slot named voice_live to a managed provider model and refuses an unmanaged one (apps/web/app/api/voice/live/sessions/route.ts, search 'voice_live'); how a voice agent would pick a model or provider is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not defined for voice agents. The neighbour live voice route requires a signed-in user and an adult-eligibility check (apps/web/app/api/voice/live/sessions/route.ts, handleCreateLiveSession). |
| Permissions | None found in the code for voice agents. Text agents are owner-scoped and workspace-aware (apps/web/lib/agents/agent-route.ts). |
| Subscription | None found in the code for voice agents. Neighbour live voice checks a canUseVoice capability by plan (apps/web/app/api/voice/live/sessions/route.ts:300-309). |
| Limits and metering | None found in the code for voice agents. Neighbour live voice bills in one-minute blocks (apps/web/lib/voice/live-voice-billing.ts:20). |
| Feature flags | None found for voice agents. canUseVoice gates neighbour live voice (apps/web/app/api/voice/live/sessions/route.ts:300-309). |
| Model compatibility | Unknown; not designed. |
| Provider restrictions | Unknown for voice agents; neighbour live voice only accepts managed providers. |
| Local mode | Nothing exists in Local mode, own-key or Cloud for voice agents. The neighbour live voice route is a Cloud route; a Local variant is not found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Entry point absent | No control, route or page exists on any app, so the person cannot start. | audit/ledger/ecosystem-capability-ledger.jsonl: S51.01 |
| Loading, empty, error, retry, offline, accessibility | not handled in the code (no voice-agent screen); the brief does not specify them. | knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md |
| App differences | Web, Desktop and Mobile all missing; CLI, VS Code and Chrome not applicable. | audit/ledger/ecosystem-capability-ledger.jsonl: S51.01 cells |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/custom-agents/route.test.ts`: Neighbour text-agent list and create route, not voice agents.
- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Neighbour text-agent editor page.
- `apps/web/features/chat/components/Voice/VoiceSettingsModal.test.tsx`: Neighbour personal voice settings dialog.
- `apps/web/app/api/voice/live/sessions/lib/__tests__/voice-session-budget.test.ts`: Neighbour live voice budget logic.

**Test scenarios**

- **Confirm the absence**
  1. Open /chat/agents on Web.
  2. Look for any voice, phone or call control.
  3. Search the app navigation for a voice-agent entry.
  - Expected: No voice-agent entry exists (current truth). When built, an entry must exist.
- **Create a draft (future)**
  1. Open the wizard.
  2. Enter name, role, instructions, pick a voice, set a goal.
  3. Save and reopen.
  - Expected: All values persist.
- **Validation (future)**
  1. Leave the name empty and try to save.
  2. Paste instructions beyond the limit.
  - Expected: Clear refusal messages; nothing saved.
- **API absence**
  1. Look in apps/web/app/api for a voice-agent route.
  - Expected: None found today.

**Where to look when it fails**

- No voice-agent log lines or tables exist. For neighbours: look at user_agents and user_agent_versions rows and the custom-agents route errors.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No voice-agent wizard or builder on any app** Affects: Web, Desktop, Mobile owners. Evidence: audit/ledger/ecosystem-capability-ledger.jsonl: S51.01 missing. Work needed: Design and build the wizard once in shared UI; add routes on the surfaces.
- **No API or data model for voice agents (name, role, instructions, voice, goals)** Affects: all surfaces. Evidence: ledger S51.02, S51.03, S51.04, S51.07 api missing; no table found. Work needed: Extend or add a contract, migration and endpoints.
- **Plan, quota and empty/failure states not specified** Affects: product definition. Evidence: brief gives only Should lines. Work needed: Write the requirement under docs/product.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- SYS-model-catalog-and-routing
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud

## Unknown

- Whether a voice agent reuses the text-agent resource or a new one.
- Which speech provider and model would speak on phone calls.
- Plan limits on number of voice agents.
- Whether Desktop would get its own screen or use the hosted web app (AGENTS.md section 5 says the public Desktop shows the web app).
