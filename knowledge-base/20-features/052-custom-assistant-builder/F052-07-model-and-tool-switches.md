---
id: "F052-07"
type: "feature"
title: "Model and tool switches"
aliases: ["Model and tools", "Model and tool switches", "Model preference", "Tool selection", "Web-search enablement", "Code-execution enablement", "Media-generation enablement", "Connector selection", "S52.16", "S52.17", "S52.18", "S52.19", "S52.20", "S52.21", "Preferred model", "Reasoning effort", "Web search / Code execution / Image generation switches", "tools / disallowedTools / skills / mcpServers frontmatter"]
area: "52 Custom-assistant builder"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.16", "S52.17", "S52.18", "S52.19", "S52.20", "S52.21"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "mode:local", "table:user_agents", "table:user_agent_versions", "api:POST /api/custom-agents", "api:PATCH /api/custom-agents/[id]", "file:apps/web/lib/agents/agent-turn-config.ts", "file:apps/cli/src/agents.rs", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-local-inference", "SYS-execution-boundaries", "plan:pro"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-07 Model and tool switches

Lets a person decide what a custom assistant (called an agent in the product) may use: a preferred model, reasoning effort, web search, code execution, image generation, connectors and skills. Web and mobile store these as saved switches the server enforces in Cloud chats. The CLI and desktop file editors use tool lists in an agent file.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.16](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5216), [S52.17](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5217), [S52.18](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5218), [S52.19](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5219), [S52.20](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5220), [S52.21](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5221).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Each agent carries a small set of capability choices. On Web and Mobile they are fields on the agent (model, effort, webSearch, codeExecution, imageGeneration, connectorIds, skillNames, allowed and blocked websites) saved in our database and applied to every Cloud chat or scheduled run that uses the agent (packages/contracts/cloud-contracts/src/agents.ts:89-111; apps/web/lib/agents/agent-turn-config.ts:193-216). In the CLI the same idea is a markdown agent file with model, tools, disallowedTools, skills and mcpServers lines (apps/cli/src/agents.rs:1429-1560).

**Why it exists.** A builder wants one assistant that is narrower than a general chat: cheaper model, no web, no code, only some connectors. The product brief asks for model preference, tool selection, web search, code execution, media generation and connector selection as separate switches (brief S52.16 to S52.21). The migration that created agents says people could only paste the same instructions into every chat before (apps/web/db/neon/0370_user_agents.sql:1-9).

**Who uses it.** A builder (an individual or a workspace member) who creates an agent. Teammates who chat with a shared agent feel the effect but cannot change it (apps/web/lib/services/custom-agent-service.ts:321-331).

**Problems it solves**

- Stops an agent from using web search, code or image tools its builder does not want it to use.
- Lets a builder pin a model and a reasoning level so an agent behaves the same way in every chat.
- Limits which connectors and skills a shared agent can reach, so a teammate's connected accounts are not opened to an agent that should not use them.

**Use cases**

- A support-reply agent with web search off and only the helpdesk connector ticked.
- A research agent that pins a strong model and a high reasoning level and may only read three named websites.
- A drafting agent with code execution and image generation switched off to keep answers plain text.
- In the CLI, a reviewer agent file that allows only read tools and a turn limit.

## 2. User experience

**Where to find it**

- Web: Agents in the left navigation opens /chat/agents; New agent or Edit opens the form; the section is headed 'Model and tools' (apps/web/shared/components/layout/app-nav-items.ts:171-176; apps/web/features/agents/components/AgentConfigForm.tsx:498-632).
- Web: connectors and skills are in the section 'Connectors and skills' (apps/web/features/agents/components/AgentConfigForm.tsx:634-672).
- Mobile: route /(app)/agents, then New or an agent row; sections 'Model and tools' and 'Connectors and skills' (apps/mobile/src/features/agents/components/AgentConfigSections.tsx:317-398).
- CLI: the /agents command in the interactive session, and the --agent option to start on an agent (apps/cli/src/agents.rs:580-670; apps/cli/src/lib.rs:8651-8662).
- Desktop (internal Tauri build): Settings, Agents tab, Custom Agents list and editor with Model and Allowed Tools (apps/desktop/src/features/settings/CustomAgentEditor.tsx:248-322). The public desktop shows the hosted web app, so the web screens are what that window shows (AGENTS.md section 5) [inferred; the Electron code was not opened].
- VS Code extension and Chrome extension: not found.

**Before you start**

- Web and Mobile: signed in, and on Mobile the app must be in Cloud mode; Local mode shows a gate saying agents run in AGI Cloud (apps/mobile/src/shared/hooks/useCloudFeatureAccess.ts:30-35; apps/mobile/src/features/agents/AgentEditorScreen.tsx:79-90).
- Sharing aside, personal agents work without a workspace (apps/web/lib/services/custom-agent-service.ts:339-384).
- CLI and desktop: a writable agents folder; project agents load only from a trusted workspace (apps/cli/src/agents.rs:270-274).

**Screens and controls**

- Web 'Preferred model' dropdown with first option 'Whatever the chat uses'; help text says it is used when a chat is on Auto and a model picked in the chat still wins (AgentConfigForm.tsx:503-521).
- Web 'Reasoning effort' dropdown (first option 'Whatever the chat uses'), shown only if the model offers levels (AgentConfigForm.tsx:523-548).
- Web switches 'Web search' (help 'Search and read web pages.'), 'Code execution' (help 'Run code and analyse files in a sandbox.'), 'Image generation' (help 'Create and edit images.') (AgentConfigForm.tsx:549-577).
- Web 'Websites' box with Allow and Block buttons, shown only while Web search is on (AgentConfigForm.tsx:556-563, 191-296).
- Web 'Messages a day, per person' and 'Credits a month, across everyone' (AgentConfigForm.tsx:578-631).
- Web connectors checklist with the box 'Every connector the person has connected'; while connectors are not released it shows 'Connectors are coming soon.' (AgentConfigForm.tsx:638-665; packages/contracts/types/src/connector-release.ts:14).
- Web skills selection with the box for every skill (AgentSkillSelection.tsx).
- Mobile: 'Model' row with Choose and Clear buttons, toggles 'Web search', 'Code execution', 'Image generation', 'Messages a day, per person', Connectors and Skills lists (AgentConfigSections.tsx:317-398).
- CLI: /agents set <name> model|tools|disallowedTools|skills|maxTurns|maxBudgetUsd|permissionMode <value>; tool lists are comma separated (apps/cli/src/agents.rs:1117-1127, 1188-1240).
- Desktop: Model select 'Inherit from settings' and an Allowed Tools checklist (Read, Write, Edit, Bash, WebSearch, WebFetch, TodoRead, TodoWrite, Glob, Grep, LS) (CustomAgentEditor.tsx:16-30, 294-322).

**Journey**

1. Web: open Agents, press 'New agent' (or Edit on an agent).
2. Scroll to 'Model and tools'. Pick a model or leave 'Whatever the chat uses'; pick a reasoning effort if offered.
3. Turn Web search, Code execution and Image generation on or off. All three start on for a new agent (apps/web/lib/services/custom-agent-service.ts:43-45).
4. Under 'Connectors and skills' untick what the agent may not use, or keep the all-box ticked.
5. Press 'Create agent' or 'Save draft'. The toast says 'Draft saved.' or 'Created <name>.' (AgentEditorPage.tsx:222-231).
6. Press 'Chat' on the agent. The chat runs with the switches applied. A teammate sees the published copy only.
7. CLI: run /agents create <name>, then /agents set <name> tools "read_file, grep" and /agents set <name> model <id>; start with --agent <name> (apps/cli/src/agents.rs:1062-1090, 1188-1240).

**What the person sees and gets**

- Web: 'Draft saved.' / 'Created <name>.' toasts, footer 'All changes saved.' or 'Unsaved changes', red message under the form when the server refuses, for example 'Pick a model from the list.' (AgentEditorPage.tsx:337-345; custom-agent-service.ts:185).
- Web chat: a tool the agent switched off is simply not offered to the model [inferred from agent-turn-config.ts:139-148 and request-processor.ts:6346].
- CLI: '/agents set' prints 'Agent `<name>`: <field> updated.' (agents.rs:1238); when a model override fails the session prints 'Agent `<name>` model override ignored: <reason>' on stderr (agents.rs:101-107).
- CLI: /agents show prints the tool lists and model (agents.rs:913-956).

**Settings**

- Web and Mobile fields above; all stored on the agent, not in user settings.
- Workspace connector policy (website allow and block lists) narrows an agent further; an agent list never reopens a site the workspace blocked (apps/web/db/neon/0388_agent_web_domain_rules.sql:10-13).
- CLI: permissionMode and maxTurns in the same agent file (agents.rs:1117-1127).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web form edits and saves model, effort, webSearch, codeExecution, imageGeneration, connectorIds, skillNames and website lists through POST /api/custom-agents and PATCH /api/custom-agents/[id] (apps/web/app/api/custom-agents/route.ts:32-42; apps/web/app/api/custom-agents/[id]/route.ts:37-47).
- A model is validated: empty is allowed, Auto ids are kept, any other id must exist in the model catalog or the server answers 'Pick a model from the list.' (apps/web/lib/services/custom-agent-service.ts:180-187).
- Effort is moved to the nearest level the pinned model supports when the model changes (service:214-228; packages/contracts/cloud-contracts/src/agents.ts:58-80).
- In a Cloud chat that runs as an agent, the server loads the agent, switches web search, web fetch and code execution off when the agent says so, and puts the agent model in place only if the chat is on Auto or empty (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3898, 4079; agent-turn-config.ts:139-148, 175-182).
- Image tools are removed when the agent has image generation off, and a plan check still applies on top (request-processor.ts:6336-6350; packages/contracts/types/src/billing-catalog.ts:356).
- Connector tools are filtered to the agent's list; null means all, an empty list means none (apps/web/app/api/llm/v1/chat/completions/route.ts:863; agent-turn-config.ts:150-157). Skills are filtered the same way (request-processor.ts:5377; tool-loop.ts:5614).
- Scheduled runs of an agent apply the model, web, code and connector choices (apps/web/lib/services/scheduled-agent-executor.ts:919-965).
- Mobile has the same fields except effort, website lists and monthly credit cap, and saves them to the same routes (apps/mobile/src/features/agents/components/AgentConfigSections.tsx:317-398; apps/mobile/src/features/agents/service.ts:49-65).
- CLI agent files carry model, tools, disallowedTools, skills, mcpServers, maxTurns, maxBudgetUsd and permissionMode; apply_to_session applies them (apps/cli/src/agents.rs:98-148, 1429-1560).
- CLI: a failed model override is reported and ignored (agents.rs:99-109); the tool list is intersected with any allowlist given on the command line (agents.rs:110-117); the permission mode can only stay or become stricter (agents.rs:150-187); a subagent ignores model and permission overrides and its tools are intersected with the parent (agents.rs:196-236).
- Desktop (Tauri) editor writes name, description, model and tools into a markdown file under .claude/agents that the CLI also reads (apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:1-20, 120-132, 260-282).

**Incomplete**

- Image generation has no CLI or desktop file field; the CLI frontmatter reader has no such key (apps/cli/src/agents.rs:1429-1560).
- mcpServers is read from a CLI file but is not in the /agents set field list, so it is edited by hand only (agents.rs:1117-1127, 1511-1514).
- The web server checks that a model exists in the catalog but not that the builder's plan can use it; the form marks plan-locked models as 'unavailable on current plan' and disabled (packages/contracts/cloud-contracts/src/schedule-models.ts:30-41) but the PATCH route has no such check (custom-agent-service.ts:180-187). Whether the chat route later refuses such a model was not traced: unknown.
- Connectors section is hidden on Web and Mobile while the release state is 'coming_soon' (packages/contracts/types/src/connector-release.ts:14; AgentConfigForm.tsx:660-665).

**Present but disconnected or switched off**

- Web form connector checklist exists but is replaced by 'Connectors are coming soon.' because the connector release state constant is 'coming_soon' (connector-release.ts:14). A few named connectors are released selectively (connector-release.ts:16-30); the agent editor does not show them while the global state is off (AgentConfigForm.tsx:638) [inferred].
- Desktop Tauri editor tool names (Read, Bash, WebSearch) differ from CLI native names (read_file); the CLI filter treats Read and read_file as matching, so the file works (apps/cli/src/tool_filters.rs:332) .
- Brief status marks Web, Mobile and Desktop 'missing' for S52.16 to S52.21; the code shows Web and Mobile working and Desktop file-based, so the brief is out of date for these apps.

**Not available**

- VS Code extension: no agent builder code found (searched apps/extension-vscode/src for custom-agents and ManagedCloudAgent).
- Chrome extension: no agent builder code found; the hits for ManagedCloudAgent there are run references, a different type (apps/extension/src/types.ts:4).
- Mobile: no effort control, no website allow or block lists, no monthly credit cap field (AgentConfigSections.tsx:317-398).
- Image generation switch in CLI and desktop files.

## 4. Required behaviour

**Established requirements**

- An assistant can pin a preferred model that is used when it runs. (source: brief S52.16)
- An assistant's configuration chooses which tools it may use. (source: brief S52.17)
- Web search can be turned on or off per assistant. (source: brief S52.18)
- Code execution can be turned on or off per assistant. (source: brief S52.19)
- Image or media generation can be turned on or off per assistant. (source: brief S52.20)
- The configuration selects which connectors the assistant can use. (source: brief S52.21)
- Model-agnostic and provider-agnostic: model ids resolve through the generated catalog, never a literal in a consumer. (source: doc: AGENTS.md section 4)
- Nothing may silently route a Local chat to BYOK or managed cloud; Cloud agents run only in Cloud. (source: doc: AGENTS.md section 6)
- Documentation availability of web search, code execution and image generation is separate from route availability; they depend on a provider route or an AGI harness. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. On Web, create an agent with Web search off; in a chat with it, the model gets no web search or web fetch tool, and the same chat on a normal conversation still has them.
2. On Web, pin a model on an agent and open a chat on Auto: the turn runs on the pinned model. Pick a different model in the chat: the chat model wins.
3. Ticking one connector under 'Connectors and skills' limits tools to that connector; unticking all gives an agent with no connector tools (after connectors are released).
4. PATCH with an unknown model id answers a validation error 'Pick a model from the list.' and saves nothing.
5. CLI: /agents set <name> tools "read_file" then --agent <name>; only that tool is offered, and if a command-line allowlist is given the result is the overlap only.
6. CLI: an agent file with permissionMode looser than the session leaves the session mode unchanged and prints a notice.
7. CLI: a subagent invoked by the model keeps the parent's model and permission mode even if the agent file names others.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The same switches should exist on every app that lets a person build an agent; today VS Code and Chrome have none [inferred from the area brief and AGENTS.md section 5].
- A pinned model the owner's plan cannot use should be refused or flagged when saving, not only at chat time [inferred from the plan-aware model list in schedule-models.ts:17-41].
- Image generation should be switchable in CLI and desktop files to match Web and Mobile [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Share one tool vocabulary between web switches and CLI tool names, so an agent exported from one app keeps its limits in the other.
- [proposed] Add an effort control and website lists to Mobile so Mobile agents are not behind Web.
- [proposed] Reject a pinned model the builder's plan lacks at save time with a clear message.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | AgentConfigSchema | `packages/contracts/cloud-contracts/src/agents.ts` | Wire shape of an agent: model, effort, webSearch, codeExecution, imageGeneration, connectorIds, skillNames, website lists, limits (lines 89-111). |
| service | validateAgentModel / normalizedConfig | `apps/web/lib/services/custom-agent-service.ts` | Checks the model against the catalog, normalises effort, sorts connector and skill lists (lines 180-232). |
| service | createAgent / updateAgentDraft | `apps/web/lib/services/custom-agent-service.ts` | Writes the switches to user_agents; defaults all three capability switches on (lines 34-52, 339-416). |
| endpoint | api:POST /api/custom-agents, api:PATCH /api/custom-agents/[id] | `apps/web/app/api/custom-agents/route.ts` | Create and draft-save routes behind CSRF and a chat-conversation rate limit (agent-route.ts:35-46). |
| service | applyAgentTurnConfig and helpers | `apps/web/lib/agents/agent-turn-config.ts` | Applies switches to a chat request: tool policy, model pin over Auto, connector and skill filters, image check (lines 139-220). |
| service | chat request processor agent hooks | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads the agent for the conversation (line 3898), applies it (4079), filters skills (5377), blocks image tools (6336-6350). |
| endpoint | chat completions connector filter | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Filters connector tools to the agent's list (line 863). |
| service | scheduled agent executor | `apps/web/lib/services/scheduled-agent-executor.ts` | Applies model, web, code and connector choices to scheduled runs (lines 919-965). |
| component | AgentConfigForm | `apps/web/features/agents/components/AgentConfigForm.tsx` | Web form with the model, effort, switches, websites, connectors and skills controls. |
| component | AgentSkillSelection | `apps/web/features/agents/components/AgentSkillSelection.tsx` | Web skills picker with keyboard support. |
| screen | AgentEditorPage | `apps/web/features/agents/components/AgentEditorPage.tsx` | Loads, edits and saves an agent; builds connector and skill choices; model options by plan (lines 63-127, 179-183). |
| config | getScheduleModelOptions | `packages/contracts/cloud-contracts/src/schedule-models.ts` | Lists models a plan can use for the model dropdown (lines 17-42). |
| config | CONNECTOR_RELEASE_STATE | `packages/contracts/types/src/connector-release.ts` | Global connector release gate that hides the connectors picker (line 14). |
| config | BILLING_PLAN_CAPABILITY_TIERS | `packages/contracts/types/src/billing-catalog.ts` | Plan list for image generation (line 356). |
| screen | AgentConfigSections (Mobile) | `apps/mobile/src/features/agents/components/AgentConfigSections.tsx` | Mobile model, toggles, connectors and skills. |
| hook | useAgentEditor | `apps/mobile/src/features/agents/useAgentEditor.ts` | Mobile draft state, dirty check and save. |
| service | agents service (Mobile) | `apps/mobile/src/features/agents/service.ts` | Calls the custom-agents routes. |
| command | AgentDefinition.apply_to_session / apply_to_subagent_session | `apps/cli/src/agents.rs` | CLI applies model, tools, disallowed tools, MCP servers, turns, permission mode (lines 98-236). |
| command | set_agent_field / render_agents_command | `apps/cli/src/agents.rs` | /agents set and the other /agents verbs (lines 580-670, 1188-1240). |
| command | parse_agent_frontmatter | `apps/cli/src/agents.rs` | Reads model, tools, disallowedTools, skills, mcpServers from an agent file (lines 1429-1560). |
| service | AgentSession.switch_model / mcp_server_permitted | `apps/cli/src/agent/mod.rs` | Model switch that can fail, and the MCP server allowlist check (lines 1015-1022, 1114-1160). |
| component | CustomAgentEditor (Desktop Tauri) | `apps/desktop/src/features/settings/CustomAgentEditor.tsx` | Internal desktop editor for model and allowed tools. |
| command | save_custom_agent | `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs` | Writes the agent markdown file under .claude/agents (lines 260-282). |
| table | table:user_agents | `apps/web/db/neon/0370_user_agents.sql` | Stores the switch columns web_search, code_execution, image_generation, connector_ids, skill_names, model (lines 44-76); later migrations add effort and website lists. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web or Mobile sends the form values to POST /api/custom-agents or PATCH /api/custom-agents/[id]; the server checks CSRF, the rate limit and the user's session. | our servers | apps/web/lib/agents/agent-route.ts:32-52; apps/web/app/api/custom-agents/[id]/route.ts:37-47 |
| The server validates the model against the catalog, rounds the effort, sorts lists and writes the row in user_agents under the user's row-level rules. | our servers | apps/web/lib/services/custom-agent-service.ts:180-232, 386-416; apps/web/db/neon/0370_user_agents.sql:168-183 |
| On a chat turn the conversation's agent id is read, the owner's working copy or a teammate's published copy is chosen, and paused, retired or over-limit agents are refused before any model call. | our servers | apps/web/lib/agents/agent-turn-config.ts:57-105; request-processor.ts:3898-3915 |
| The request is edited: web search, web fetch and code execution forced off if the agent says so; the model replaced by the agent's model only when the chat is on Auto or empty; the agent's system prompt added. | our servers | apps/web/lib/agents/agent-turn-config.ts:139-216 |
| Tool lists for the turn are built: connectors and skills outside the agent's list are dropped and image tools removed when the agent has them off. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:863; request-processor.ts:5377, 6336-6350 |
| The provider call runs on whichever provider and model the router picked for the (possibly pinned) model. | outside service | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4079 [inferred: provider dispatch was not opened] |
| CLI: the agent file is read from disk, its fields are applied to the session and the model switch is attempted locally; tool filtering runs in the CLI process. | device | apps/cli/src/agents.rs:98-148, 258-268; apps/cli/src/lib.rs:8651-8662 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Agent configuration including capability switches | table:user_agents in our database (Web, Mobile) | Yes across Web and Mobile because both read the same routes; user_agents also carries a cloud-sync version column (0370_user_agents.sql:71, 90-93) | Kept until the owner deletes the agent; delete is a hard delete (custom-agent-service.ts:437-447) |
| Published copy of the configuration | table:user_agent_versions as JSON | Same database | Removed with the agent (on delete cascade, 0370_user_agents.sql:97) |
| CLI agent file | ~/.agiworkforce/agents, ~/.claude/agents or the project .agiworkforce/agents on the device (agents.rs:258-268) | No sync found | Removed by /agents delete <name> --yes, which deletes the file (agents.rs:1147-1163) |
| Desktop agent file | ~/.claude/agents or ./.claude/agents on the device (custom_agents.rs:120-132) | No sync found | delete_custom_agent removes the file (custom_agents.rs:284-304) |

**Models and providers.** The agent stores only a model id or an Auto id, never a provider. Ids are checked against the generated model catalog (validateAgentModel, custom-agent-service.ts:180-187). Routing to a provider happens later in the chat route (SYS-model-catalog-and-routing, SYS-inference-providers). The CLI switches model through its own catalog and local-model scan (apps/cli/src/agent/mod.rs:1114-1134).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and Mobile need a signed-in account; Mobile also needs Cloud mode (useCloudFeatureAccess.ts:30-35). CLI and desktop file editing need no account. |
| Permissions | Only the owner edits an agent (requireOwnedAgent, custom-agent-service.ts:321-331); a teammate sees a read-only form (AgentEditorPage.tsx:184, 416-420). In the CLI only agents in the project or global agents folders can be edited by /agents set (agents.rs:1129-1145). |
| Subscription | No plan gate was found on creating or editing an agent in the routes (apps/web/app/api/custom-agents/route.ts). Image generation inside a chat is limited to Pro, Max, Max 15x, Team, Team Premium and Enterprise plans (billing-catalog.ts:356; request-processor.ts:6336). Which plan tiers may run web search and code execution inside an agent chat was not traced: unknown. A per-agent monthly credit cap exists (agent-turn-config.ts:91-100). |
| Limits and metering | Connector and skill lists hold at most 200 entries each (agents.ts:24, 33); website lists hold at most 32 (agents.ts:30 constant AGENT_WEB_DOMAINS_MAX); daily message cap up to 10,000 and monthly credit cap up to 100,000,000 (agents.ts:20-21). Turns and credits are counted by the server before a turn (agent-turn-config.ts:81-100). CLI: maxTurns and maxBudgetUsd cap a session (agents.rs:57-65, 1117-1127). |
| Feature flags | Connector release state 'coming_soon' hides the connectors picker (connector-release.ts:14). No flag found for the other switches. |
| Model compatibility | A pinned model must exist in the catalog; effort levels are limited to what the model offers and a model without levels hides the effort control (agents.ts:58-80; AgentConfigForm.tsx:523). Whether a model supports tools is checked in the chat route (request-processor.ts:6334, resolvedModelCaps) and is not an agent rule. |
| Provider restrictions | None stored on the agent. A pinned model is routed by the normal router, so provider access rules of SYS-inference-providers apply [inferred]. |
| Local mode | The Web and Mobile agent switches are Cloud only: Mobile Local mode shows a gate 'Agents run in AGI Cloud; switching won't upload your local chats.' (AgentEditorScreen.tsx:79-90). The CLI and desktop file agents run on the device and can pin a local model; the CLI refuses a model switch that would cross a privacy boundary (apps/cli/src/agent/mod.rs:1135-1145). Local inference itself needs no subscription [doc: product context]; whether CLI sign-in is needed for local agent files: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading the editor | Web shows a skeleton with a status 'Loading agent'; Mobile shows loading rows. | AgentEditorPage.tsx:251-260; AgentEditorScreen.tsx:107-108 |
| Choice lists loading or failing | Connectors and skills show 'Loading...' then a red message with 'Try again'; empty list shows a hint. | AgentConfigForm.tsx:108-124 |
| Save fails | The draft stays on screen with the error text under the form; Cancel and edits are blocked while the save is pending. | AgentEditorPage.tsx:232-236; AgentEditorPage.test.tsx 'retains the draft after a failed create' |
| Unknown model id | Server answers a validation error and nothing is saved. | custom-agent-service.ts:185 |
| Model changed after effort picked | Effort moves to the nearest level the new model offers, or clears. | custom-agent-service.ts:214-228; AgentConfigForm.tsx:359-360 |
| Chat picked a model while the agent pins one | The chat model wins; the pin applies only on Auto or empty. | agent-turn-config.ts:175-182 |
| Connector list empty array vs null | Null means every connected connector; an empty list means none. | agent-turn-config.ts:150-157; 0370_user_agents.sql:15-16 |
| Retired agent | Edits refused with 'This agent is retired. Bring it back before changing it.' | custom-agent-service.ts:333-337 |
| Offline or timeout | Not handled specially; a failed request shows the generic message from toUserMessage. No offline queue found. | agents-client.ts:49-59 [no retry code found] |
| CLI model override fails | Message printed and the session keeps its model. | agents.rs:99-109 |
| CLI agent asks for a looser permission mode | Ignored with a message naming both modes. | agents.rs:174-186 |
| Accessibility | Web switches have labels and described-by help; touch targets grow on coarse pointers; Mobile toggle rows are labelled. | AgentConfigForm.tsx:298-331, 510 |
| Mobile versus Web differences | Mobile has no effort, website lists or monthly credit field. | AgentConfigSections.tsx:317-398 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/agents/__tests__/agent-turn-config.test.ts`: Refusal of unreadable, paused, retired and over-budget agents; instructions added, tools switched off, model pinned over Auto; effort rules; connector and skill allowlists (null versus empty).
- `apps/web/lib/agents/__tests__/custom-agent-service.test.ts`: Model validation (Auto and catalog ids accepted, others refused); effort save and move; website rule storage.
- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Form saves, connector and skill limits, effort levels per model, website rules hidden when web search is off.
- `apps/web/features/agents/__tests__/AgentSkillSelection.test.tsx`: Skill picker keyboard use, null versus empty selection, selection cap.
- `apps/web/features/agents/hooks/use-agent-options.test.ts`: Agent option hook (not opened in detail).
- `apps/web/db/neon/user-agents-migration.test.ts`: Stored limits and vocabularies align with the wire contract.
- `apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx`: Creating an agent from the editor with instructions and tools set; Local Mode gate.
- `apps/cli/src/agents.rs`: In-file tests: frontmatter parsing, apply_to_session sets model and tools (line 2321), permission mode can only narrow (2384-2437), subagent narrowing (2490).
- `apps/desktop/src/stores/__tests__/customAgentsStore.test.ts`: Desktop store calls the Tauri agent commands.

**Test scenarios**

- **Web search off is enforced**
  1. Sign in on Web in Cloud.
  2. Create an agent, turn Web search off, Save, press Chat.
  3. Ask a question that needs today's news.
  - Expected: The reply does not use web search or fetch; a normal chat does.
- **Pinned model yields to the chat's choice**
  1. Pin a model on an agent and save.
  2. Open a chat with it on Auto and send a message.
  3. Then pick another model in the chat and send again.
  - Expected: First turn uses the pinned model, second uses the chat's pick.
- **Connector limit**
  1. With connectors released, tick one connector, save, chat.
  2. Ask for an action that needs an unticked connector.
  - Expected: The unticked connector's tools are not offered.
- **Invalid model refused**
  1. PATCH /api/custom-agents/<id> with a made-up model id using a signed-in test session.
  - Expected: Validation error 'Pick a model from the list.'; stored model unchanged.
- **CLI tools narrowing**
  1. /agents create reviewer
  2. /agents set reviewer tools "read_file"
  3. Start with --agent reviewer and ask it to edit a file.
  - Expected: Only read tools are offered; the edit is refused.
- **CLI cannot widen permission**
  1. Set permissionMode to a looser mode than the session
  2. Start the session with --agent
  - Expected: A notice names both modes and the session keeps its own.

**Where to look when it fails**

- Server refusal codes agent_unavailable, agent_paused, agent_retired, agent_turn_limit, agent_credit_limit in the chat response (agent-turn-config.ts:17-22; request-processor.ts:3902-3915).
- Validation message 'Invalid agent request' with issues for a bad body (agent-route.ts:50).
- Tables user_agents and user_agent_versions; function app_user_agent_month_spend.
- CLI stderr line 'Agent `<name>` model override ignored' and '/agents validate' output (agents.rs:958+).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/052-custom-assistant-builder.md](../../70-qa/test-plans/cli/052-custom-assistant-builder.md)
- No hands-on plan yet for Web, Desktop, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Image generation switch missing from CLI and desktop agent files.** Affects: CLI and desktop agent authors. Evidence: apps/cli/src/agents.rs:1429-1560 has no image field. Work needed: Add a field and enforce it on the CLI tool list, or document that tool lists cover it.
- **Connectors picker hidden everywhere while connectors are 'coming soon'.** Affects: Web and Mobile builders. Evidence: packages/contracts/types/src/connector-release.ts:14; AgentConfigForm.tsx:660-665. Work needed: None in the agent code; follows the connector release decision.
- **Server does not check the pinned model against the builder's plan.** Affects: Web and Mobile builders on lower plans. Evidence: custom-agent-service.ts:180-187 versus schedule-models.ts:30-41. Work needed: Add the plan check on save, or confirm the chat route refuses it (unknown today).
- **Mobile lacks effort, website lists and monthly credit fields.** Affects: Mobile builders. Evidence: AgentConfigSections.tsx:317-398 versus AgentConfigForm.tsx:523-631. Work needed: Add the three controls with the same limits.
- **No agent builder on VS Code or Chrome extension.** Affects: Editor and browser users. Evidence: No agent code found in apps/extension-vscode/src or apps/extension/src. Work needed: Decide scope; at least a list and switch view against the shared routes.
- **Brief marks Web, Mobile and Desktop 'missing' although code exists.** Affects: Anyone planning from the brief. Evidence: area brief S52.16-S52.21 versus the code cited above. Work needed: Re-run the brief's status pass.
- **mcpServers cannot be set through /agents set.** Affects: CLI users. Evidence: agents.rs:1117-1127. Work needed: Add the field to the editable list.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- mode:local
- table:user_agents
- table:user_agent_versions
- api:POST /api/custom-agents
- api:PATCH /api/custom-agents/[id]
- file:apps/web/lib/agents/agent-turn-config.ts
- file:apps/cli/src/agents.rs
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-local-inference
- SYS-execution-boundaries
- plan:pro

## Unknown

- Whether the chat route refuses an agent's pinned model that the viewer's plan cannot use.
- Which plan tiers may use web search and code execution inside an agent chat.
- Whether an own-key (BYOK) web chat honours agent switches; only the managed chat route was read.
- Whether the public Electron desktop shows the Agents page exactly as the web app; Electron code was not opened.
- Whether CLI agent files need sign-in for managed models; only the file code was read.
