---
id: "F063-03"
type: "feature"
title: "What a run may use: sources, connectors, agent, model"
aliases: ["What Each Run Can Use", "Sources", "Connectors", "Run as agent", "Model", "Agent", "S63.06 S63.07 S63.08 S63.09 S63.10"]
area: "63 Routines, schedules, and triggers"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S63.06", "S63.07", "S63.08", "S63.09", "S63.10"]
depends_on: ["F063-02", "F063-04", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:cli", "mode:cloud", "table:scheduled_tasks", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F063-03 What a run may use: sources, connectors, agent, model

Per routine, the person chooses what a run may read (project files, saved memories, the web, recent chats), which connected tools it may call, which custom agent it runs as and which model. Web and the Tauri desktop panel have most of it. Mobile has agent and connector choice. Repository and reasoning effort do not exist anywhere.

Area: [63. Routines, schedules, and triggers](README.md). Requirement items: [S63.06](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6306), [S63.07](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6307), [S63.08](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6308), [S63.09](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6309), [S63.10](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6310).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores sources, a connector allow-list, an agent id and a model on the routine, and enforces them when the run is built (apps/web/lib/services/schedule-service.ts:559-680; apps/web/lib/services/scheduled-agent-executor.ts:237-372, 918-1010).

**Why it exists.** An unattended run cannot ask what it may touch, so the allowance is fixed when the routine is saved.

**Who uses it.** People who want a routine to use project context, memory, web search or a specific agent, and to keep cost and data access narrow.

**Problems it solves**

- A routine reading data the person did not intend
- Running every task on one default model
- Reusing an agent's instructions and tool limits in a schedule

**Use cases**

- Daily briefing that also reads recent chats
- Project-scoped routine that reads the project's files
- Routine that runs as a saved 'research' agent
- Routine pinned to the Auto model to stay on-plan

## 2. User experience

**Where to find it**

- Web and public Electron Desktop: create or edit dialog, section 'What Each Run Can Use' with 'Sources' and 'Connectors'; fields 'Model' and 'Run as agent' (ScheduleAccessFields.tsx:70-125; ScheduleForm.tsx:229-284).
- Tauri desktop: access fields with Project instructions and files, Saved memories, The web (apps/desktop/src/features/schedules/DesktopScheduleAccessFields.tsx:29-38); model select with 'Select a model' (DesktopCloudSchedules.tsx:1624).
- Mobile: create screen sections 'Agent' (chips 'No agent' and agent names) and 'Connectors' (ScheduleAccessSection.tsx:68-140); model chip in the form (ScheduleForm.tsx:273).
- Chrome: 'Model' select in the Schedules form (schedulesSection.ts:518).
- CLI: --model flag only (lib.rs:1527). VS Code: none.

**Before you start**

- Routine create or edit access
- Agents: at least one active agent for the picker to show (web hides it with none: ScheduleForm.tsx:252)
- Project source shows only when the routine belongs to a project (ScheduleAccessFields.tsx:62)
- Connectors: connectors must be released (they are 'coming soon' today)

**Screens and controls**

- Checkboxes: 'Project instructions and files', 'Saved memories', 'The web', 'Recent chats'
- Connector checkboxes plus text 'Includes every connector, even ones you connect later. Uncheck to choose.'
- 'Run as agent' select with option 'No agent' and one-line agent description
- Model select with Auto choices first, then catalog models for the plan
- Mobile toggle 'Every connected connector'

**Journey**

1. Open create or edit
2. Open 'What Each Run Can Use'
3. Untick sources you do not want
4. Choose connectors (when released) and an agent
5. Pick a model
6. Save; the choices are stored with the routine and applied on each run

**What the person sees and gets**

- Helper text under each source (for example 'Read only while memory is on in Settings')
- Connector area says 'Connectors for scheduled runs are coming soon.' on web and 'Connectors are coming soon.' on mobile
- Validation errors for a bad model or agent
- Run output may note capabilities withheld for the run (executor withheldToolsDirective, lines 374-400)

**Settings**

- Settings > Memory 'Search past chats' decides if recent chats are read (executor:409-440)
- Settings tool approval policy decides which tools pause a run (executor:374-400)
- Workspace context policy (executor:419)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Sources default: project, memory and web on; recentChats off (packages/contracts/cloud-contracts/src/schedules.ts:101-106). Server normalises and stores them in metadata (schedule-service.ts:638-647).
- Run reads project files only if sources.project and the routine has a project; memory only if sources.memory; recent chats only if sources.recentChats and the 'Search past chats' setting is on (scheduled-agent-executor.ts:990-1004, 409-440).
- The web search tool is allowed only if sources.web is true and the agent allows it (executor:955).
- Connector ids must match a pattern and at most 100 are accepted; null means every connector (schedule-service.ts:649-665; schedules.ts:107).
- Agent must be one the user can load (assertScheduleAgent, schedule-service.ts:919-925); the run loads the agent and applies its model, tools and web-domain rules (executor:918-923, 957-966).
- Model: Auto or an eligible catalog model; an already stored model may be kept even if no longer eligible (schedule-service.ts:559-577).
- Mobile picks an agent and, when released, connectors, and reads them back from a saved routine (apps/mobile/src/features/schedules/__tests__/ScheduleAccess.test.tsx:82-106).
- Chrome form has a model select that needs the loaded catalog (schedulesSection.ts:575-620).

**Incomplete**

- Mobile has no source choice (no sources key anywhere under apps/mobile/src/features/schedules).
- Tauri desktop shows three sources and has no 'Recent chats' option and no agent picker (DesktopScheduleAccessFields.tsx:29-38; no agentId in DesktopCloudSchedules.tsx).
- Chrome keeps sources only from a template and has no agent or connector controls (schedulesSection.ts:727-775).
- CLI sets a model only; no sources, connectors or agent (apps/cli/src/schedules.rs:73-115).

**Present but disconnected or switched off**

- Connector choice is switched off by CONNECTOR_RELEASE_STATE = coming_soon, so web and mobile show a 'coming soon' line instead of the picker (packages/contracts/types/src/connector-release.ts:14; ScheduleAccessFields.tsx:100-110; ScheduleAccessSection.tsx:88-93; apps/web/features/schedules/components/ScheduleConnectorGates.test.tsx:25).
- Stored connector lists still apply at run time through buildScheduledToolPlan, but with connectors not released connectorsAllowedWithoutRequest may remove them (executor:252-262) [inferred].

**Not available**

- Repository selection: no field in ScheduleInput or any form (schedule-service.ts:139-168). Brief S63.07 says missing on all apps.
- Reasoning effort per routine: no field in ScheduleInput (schedule-service.ts:139-168). Brief S63.10.
- Chrome and CLI: sources, connectors, agent.

## 4. Required behaviour

**Established requirements**

- User chooses which sources a run may read. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.06)
- User picks a code repository the run works against. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.07)
- Per routine the user chooses which connectors and tools the run may use. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.08)
- User picks which agent runs the routine. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.09)
- Per routine the user picks the model and the reasoning effort. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.10)
- Agent id must be a real agent the user can load; connector ids limited by pattern and count; model must be Auto or catalog and plan-eligible. (source: apps/web/lib/services/schedule-service.ts:559-577, 649-665, 919-925)
- Scheduled prompts send saved text only; attachments are not carried. (source: doc: audit/registers/ui-gaps.md GAP-029)

**Acceptance criteria**

1. New routine with no sources field stores project, memory, web true and recentChats false
2. Sources with a non-boolean value return a validation error
3. An agent id that the user cannot load is refused at save
4. A model not in the catalog, or not eligible for the plan, is refused at save; Auto is accepted
5. With 'Search past chats' off, a routine with Recent chats ticked reads none
6. A connector id with a space is refused
7. Unticking The web removes web search from the run's tools

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile and Chrome should expose sources like web [inferred from the shared contract].
- Effort selection needs a new field and a router input [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add reasoning effort to ScheduleInput once the router exposes it.
- [proposed] Add repository selection only with a checkout design; today nothing in the executor checks out code.
- [proposed] Add the sources section to mobile, Tauri and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | normalizeScheduleSources, normalizeScheduleConnectors | `apps/web/lib/services/schedule-service.ts` | Validate and store sources and connectors (lines 638-665) |
| service | normalizeModel | `apps/web/lib/services/schedule-service.ts` | Model eligibility (line 559) |
| service | assertScheduleAgent | `apps/web/lib/services/schedule-service.ts` | Agent ownership/load check (line 919) |
| config | ManagedCloudScheduleSourcesSchema and defaults | `packages/contracts/cloud-contracts/src/schedules.ts` | Source schema and defaults (line 99-107) |
| service | getScheduleModelOptions, normalizeEligibleScheduleModel | `packages/contracts/cloud-contracts/src/schedule-models.ts` | Which models a plan may pick for schedules |
| service | buildScheduledToolPlan | `apps/web/lib/services/scheduled-agent-executor.ts` | Tools, web, connectors per run (line 237) |
| service | resolveScheduledContext | `apps/web/lib/services/scheduled-agent-executor.ts` | Reads project, memory, recent chats (line 409) |
| component | ScheduleAccessFields | `apps/web/features/schedules/components/ScheduleAccessFields.tsx` | Web sources and connectors UI |
| component | ScheduleForm model and agent fields | `apps/web/features/schedules/components/ScheduleForm.tsx` | Model and Run as agent selects (lines 229-284) |
| component | DesktopScheduleAccessFields | `apps/desktop/src/features/schedules/DesktopScheduleAccessFields.tsx` | Tauri sources and connectors UI |
| component | ScheduleAccessSection | `apps/mobile/src/features/schedules/components/ScheduleAccessSection.tsx` | Mobile agent and connector choice |
| service | listAgents (mobile) | `apps/mobile/src/features/agents/service.ts` | Agents for the picker |
| hook | useAgentOptions | `apps/web/features/agents/hooks/use-agent-options.ts` | Web agent options |
| config | CONNECTOR_RELEASE_STATE | `packages/contracts/types/src/connector-release.ts` | Switch that hides connector pickers (line 14) |
| component | model select in Chrome form | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome model choice (lines 518, 575) |
| table | scheduled_tasks (metadata, model, agent_id, project_id) | `apps/web/db/neon/0009_scheduling.sql` | Where choices are stored |
| test | ScheduleAccess.test.tsx | `apps/mobile/src/features/schedules/__tests__/ScheduleAccess.test.tsx` | Mobile agent and connector tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Form collects sources, connectors, agent id, model. | device | ScheduleAccessFields.tsx:70-125 |
| Server validates them and stores sources and connectors in metadata, agent and model in columns. | our servers | schedule-service.ts:681-868, 994-1053 |
| At run time the executor re-checks the account's access, loads the agent, selects a route for the model, builds the tool plan from sources and connectors. | our servers | scheduled-agent-executor.ts:889-966 |
| Context is loaded: project files, memory, recent chats as allowed; the prompt and context go to the chosen model provider. | our servers | executor:990-1020 |
| The model call and any tool calls run at an outside provider or connector. | outside service | executor:1056-1100 (reserve usage then provider completion) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Sources, connectors, notifications | scheduled_tasks.metadata (JSON) | Yes, server record | Deleted with the routine |
| Context manifest of what a run read | context manifest store (packages/platform/context-engine/src/manifest-store.ts:57) | Server only | unknown |

**Models and providers.** Server routing picks provider and model from the stored selection; Auto uses the routing profile. A model that keeps inputs out of training is required when the account or Google data demands it, else the run does not start (executor:719-722, 783-805). Provider chosen by dispatchProviderForSelectedRoute (executor:936-945).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account. |
| Permissions | Agent must be loadable by the user; project must be owned by the user (schedule-service.ts:905-925); workspace context policy applies to sources (executor:419). |
| Subscription | Model list depends on the plan through getModelsForTierAndSurface for the web/cloud-chat profile (schedule-models.ts:8-26). Plan limit on scheduled tasks as in F063-02. |
| Limits and metering | Each run reserves and settles managed usage against the account's credits (executor:1056-1138). Output capped at 4,096 tokens per run (executor:161). Optional credit cap per routine (F063-06). |
| Feature flags | CONNECTOR_RELEASE_STATE coming_soon; sources.recentChats default false. |
| Model compatibility | Types allowed: chat, code, reasoning, multimodal (schedule-models.ts:9). A model that cannot call tools gets no tool loop (executor:974-979). |
| Provider restrictions | Only providers reachable through Cloud routing for the plan; no own-key route found. |
| Local mode | Not available. Local mode cannot reach schedules (CLI refuses, mobile gate, Tauri Managed only). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Stored model no longer eligible | Kept on unrelated edits; shown disabled as '(unavailable on current plan)'; cannot be chosen anew | schedule-models.ts:28-40; schedule-service.test.ts:653 |
| Agent deleted or unusable at run time | Run fails with ScheduledAgentUnavailableError | executor:174, 920 |
| Project removed | Run stopped before any model call with a message to restore or remove it | executor:184-192, 990-996 |
| Agent id in form no longer allowed | Option 'An agent you can no longer use' shown disabled | ScheduleForm.tsx:268-272 |
| Connectors not released | Picker replaced by coming-soon text | ScheduleAccessFields.tsx:100-110 |
| Connector list loading or failed | 'Reading your connectors…' then error with 'Try again' | ScheduleAccessFields.tsx:140-160 |
| Tools that need approval with models that run tools inside the provider | Tools withheld and the run says so | executor:374-400 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/schedules/components/ScheduleConnectorGates.test.tsx`: Connectors coming-soon text; Gmail and Calendar triggers only as coming soon
- `apps/web/features/schedules/components/ScheduleForm.test.tsx`: Agent description line, no connector promise while unavailable, optional chat access description
- `apps/web/lib/schedules/schedule-models.test.ts`: Schedule model options (case titles not read)
- `packages/contracts/cloud-contracts/src/__tests__/schedule-models.test.ts`: Contract model eligibility (case titles not read)
- `apps/web/lib/services/schedule-service.test.ts`: Rejects ineligible model for plan; keeps unchanged legacy model; persists per-routine settings in metadata
- `apps/web/lib/services/scheduled-agent-executor.tools.test.ts`: Tool plan (case titles not read)
- `apps/web/lib/services/__tests__/scheduled-agent-context.test.ts`: Run context sources (case titles not read)
- `apps/mobile/src/features/schedules/__tests__/ScheduleAccess.test.tsx`: Hidden sharers' agents left out, run as chosen agent with narrowed connectors, read back from saved schedule

**Test scenarios**

- **Default sources**
  1. POST a routine with no sources
  2. GET it
  - Expected: sources project true, memory true, web true, recentChats false
- **Recent chats off in Settings**
  1. Turn off Search past chats
  2. Create a routine with Recent chats ticked
  3. Run now
  - Expected: Run output shows no past-chat context; the context manifest lists none
- **Ineligible model**
  1. On Basic POST a model only higher plans list
  - Expected: Validation error 'Model is not available for Managed Cloud schedules on the current plan'
- **Agent not owned**
  1. POST an agentId of another user
  - Expected: Validation error from assertScheduleAgent
- **Connector picker hidden**
  1. Open the web form
  2. Open 'What Each Run Can Use'
  - Expected: Text 'Connectors for scheduled runs are coming soon.'

**Where to look when it fails**

- Run row error text and result.cancellation
- Log line 'Scheduled run context source failed to load'
- Errors ScheduledAgentUnavailableError, ScheduledProjectContextUnavailableError, NoTrainingRouteError

**Hands-on test plans**

- Web: [70-qa/test-plans/web/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/web/063-routines-schedules-and-triggers.md)
- Desktop: [70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md)
- Mobile: [70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md)
- CLI: [70-qa/test-plans/cli/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/cli/063-routines-schedules-and-triggers.md)
- Chrome: [70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md)

## 10. Gaps and dependencies

- **Repository selection does not exist** Affects: All apps. Evidence: No repository field in schedule-service.ts:139-168; brief S63.07. Work needed: Design checkout for unattended runs, then add field
- **Reasoning effort per routine does not exist** Affects: All apps. Evidence: schedule-service.ts:139-168; brief S63.10. Work needed: Add field, validation, router input and UI
- **Mobile has no source choice** Affects: Mobile users. Evidence: No sources under apps/mobile/src/features/schedules. Work needed: Add the sources section
- **Tauri lacks Recent chats and agent picker** Affects: Tauri desktop users. Evidence: DesktopScheduleAccessFields.tsx:29-38. Work needed: Add both
- **Chrome and CLI cannot set sources, connectors or agent** Affects: Chrome, CLI users. Evidence: schedulesSection.ts:727-775; schedules.rs:73-115. Work needed: Add controls or accept as scoped
- **Connector choice is off while connectors are coming soon** Affects: Web, mobile, Tauri users. Evidence: connector-release.ts:14. Work needed: Follows the connector release
- **Brief says Chrome has no model choice; code has one; brief says mobile has no agent or connectors; code has both** Affects: Brief accuracy. Evidence: schedulesSection.ts:518; ScheduleAccessSection.tsx. Work needed: Correct statuses in S63.08, S63.09, S63.10
- **Brief cites apps/desktop/electron/config.ts:39 and product-routes.ts:20 as source selection code; they only list allowed hosts and routes** Affects: Brief accuracy. Evidence: apps/desktop/electron/config.ts:39-47; packages/contracts/types/src/product-routes.ts:19-28. Work needed: Replace citations
- Not built on: VS Code (from the capability ledger).

**Depends on**

- F063-02
- F063-04
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:cli
- mode:cloud
- table:scheduled_tasks
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage

## Unknown

- How long run context manifests are kept: manifest-store.ts retention not read.
- Whether a stored connector list is honoured at run time while connectors are coming soon: connectorsAllowedWithoutRequest body not read.
- Whether the Tauri form has any agent control: none found by search, not read line by line.
- Cases inside schedule-models.test.ts, scheduled-agent-executor.tools.test.ts and scheduled-agent-context.test.ts.
