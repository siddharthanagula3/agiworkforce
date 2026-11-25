---
id: "F092-10"
type: "feature"
title: "Agent definitions and subagents"
aliases: ["Agent definitions and subagents", "Named agents", "Custom agents", "/agents", "agent definition store", "user_agents", "Subagent coordinator", "S92.21", "S92.24"]
area: "92 Tool-calling and agent-loop components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S92.21", "S92.24"]
depends_on: ["surface:cli", "surface:web", "mode:local", "mode:cloud", "mode:own-key", "table:user_agents", "table:user_agent_versions", "table:user_agent_files", "api:POST /api/agents/execute", "api:GET /api/custom-agents", "F092-09", "F092-08", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-authorization-and-workspaces"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F092-10 Agent definitions and subagents

A named agent is a saved set of instructions, tools and model. In the CLI it is a markdown file under .agiworkforce/agents or .claude/agents, managed with /agents. The web app also has a hosted Agents page backed by the user_agents table. The old /api/agents/execute route answers 410. The CLI has a subagent manager; the hosted run has none.

Area: [92. Tool-calling and agent-loop components](README.md). Requirement items: [S92.21](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9221), [S92.24](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9224).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person define a reusable agent (name, description, instructions, model, tools) and run chats or tasks as that agent. In the CLI an agent file overrides the session's model, tools, turn cap, permission mode and system prompt. On the web a built agent can be published, shared and run in chat or on a schedule. The CLI can also run named agents as child sessions. (apps/cli/src/agents.rs:25-47, 6-11; apps/web/db/neon/0370_user_agents.sql:1-30; apps/cli/src/subagent.rs:575-590)

**Why it exists.** People repeat the same instructions in every chat. Competitor products offer reusable agents. (apps/web/db/neon/0370_user_agents.sql:3-10)

**Who uses it.** Developers on the CLI; people on web who build and share agents with a workspace.

**Problems it solves**

- Reuse instead of re-pasting instructions.
- Narrow what an agent may do: a CLI agent can only narrow, never widen, the session's permission mode (apps/cli/src/agents.rs:2384-2437).
- Share an agent with a workspace with published versions (apps/web/db/neon/0370_user_agents.sql:15-24).

**Use cases**

- In the CLI, /agents create <name> and edit the file, then run with --agent <name>.
- A model in the CLI lists installed agents through the agent tool and asks the foreground orchestrator to run one.
- On web, build an agent on /chat/agents, publish it and start a chat as it.
- Run a scheduled task as a chosen agent (scheduled-agent-executor.ts:896-901).

## 2. User experience

**Where to find it**

- CLI: /agents (list), /agents show <name>, /agents path <name>, /agents create <name> [--global], /agents validate, /agents history [name], /agents set <name> <field> <value>, /agents rename, /agents delete <name> --yes (apps/cli/src/agents.rs:857-870). Start with --agent <name> (apps/cli/src/lib.rs:424-426).
- Web: route /chat/agents, heading 'Agents', button 'New agent', publish panel with 'Publish' and 'Publish changes' (apps/web/app/chat/agents/page.tsx; apps/web/features/agents/components/AgentsPage.tsx:162, 188; AgentPublishPanel.tsx:187).
- Desktop, Mobile, Chrome, VS Code: not examined.

**Before you start**

- CLI: project agents load only if the workspace is trusted to supply configuration (apps/cli/src/agents.rs:270-274, 2199).
- Web: signed-in account; sharing needs a workspace (apps/web/db/neon/0370_user_agents.sql:27-28).

**Screens and controls**

- CLI: slash commands above; TUI agent picker (apps/cli/src/tui/widgets/agent_picker.rs).
- Web: Agents list, new-agent form, publish and share panel, usage and activity routes (apps/web/app/api/custom-agents/...).

**Journey**

1. CLI: 1. /agents create reviewer (writes .agiworkforce/agents/reviewer.md) 2. edit the markdown 3. /agents validate 4. start with --agent reviewer or pick it 5. the file's model, tools, turn cap and prompt apply (apps/cli/src/agents.rs:1054-1076, 958, 120-170).
2. Web: 1. New agent 2. fill instructions, model, tools, connectors, files 3. Publish 4. optionally share 5. start a chat as the agent; paused or retired agents refuse new work (apps/web/lib/agents/agent-turn-config.ts:57-100).

**What the person sees and gets**

- CLI: 'Created project agent `<name>` at <path>' or an error; validation report of duplicates and bad modes (agents.rs:608-621, 958-1037).
- Web refusals: paused, retired, daily message limit reached, monthly credit limit reached (agent-turn-config.ts:20-26, 70-99).
- Hosted execute route: HTTP 410 with code CANONICAL_COMPLETION_REQUIRED and the completion URL (apps/web/lib/server/retired-managed-execution.ts:7-11).

**Settings**

- CLI agent fields: name, description, model, tools, disallowed tools, max turns, permission mode, color, skills, max budget in dollars, MCP servers (apps/cli/src/agents.rs:25-47).
- Web agent fields: instructions, model, web search, code execution, connectors, skills, daily turn limit, visibility, status (apps/web/db/neon/0370_user_agents.sql:46-66).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI discovery from user folders, plugin folders and, for a trusted project, project folders (apps/cli/src/agents.rs:258-318).
- CLI management commands and validation (agents.rs:580-655).
- CLI agent applied to a session: model, tool allowlist, disallowed tools, turn cap, narrowed permission mode, spend cap (agents.rs:84-170).
- Model-callable agent tool: list returns bounded catalog; run is handled by the foreground subagent orchestrator (apps/cli/src/agents.rs:500-535; apps/cli/src/features/exec/tools/mod.rs:1150-1169; apps/cli/src/subagent.rs:581-590).
- CLI subagent manager: depth limit 3, 7 concurrent, 15 turns per child, child spend share of the session cap, inherits the parent's route and privacy mode (apps/cli/src/subagent.rs:429-453, 612-640, 31-60).
- Hosted agent store with draft, publish, versions, share, status, files and usage (apps/web/db/neon/0370_user_agents.sql; apps/web/lib/services/custom-agent-service.ts:339-640; apps/web/app/api/custom-agents).
- Hosted agents used in chat and in schedules (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3897-3898; scheduled-agent-executor.ts:896-901).
- Hosted execute endpoint is retired and answers 410 (apps/web/app/api/agents/execute/route.ts:8-10).

**Incomplete**

- The brief says project agents override global agents of the same name. The code does the reverse: a project agent never replaces your own agent of the same name, and a warning is logged (apps/cli/src/agents.rs:331-352; test at 2217).
- The brief says the CLI path is .agi/agents; the code uses .agiworkforce/agents and .claude/agents (agents.rs:6-7, 320-325).
- The brief says the hosted platform has no agent definition store. The code has one (apps/web/db/neon/0370_user_agents.sql:1-12; apps/web/lib/services/custom-agent-service.ts).
- The brief says subagents are not applicable anywhere. A CLI subagent manager exists (apps/cli/src/subagent.rs:429-453). The hosted run has no subagent coordinator: the budget table has parent and depth columns that no service code uses (apps/web/db/neon/0258_cloud_agent_run_budgets.sql:46-50; search of apps/web for delegation_key found only the budget service and its tests).

**Present but disconnected or switched off**

- POST /api/agents/execute is retired and always answers 410 (route.ts:8-10).
- Other /api/agents/* routes exist (collaboration, communication, log-message, session, tool-executions, tools); not examined.

**Not available**

- Hosted subagent coordinator: not found.
- CLI agents in Local mode: agent runs inherit the session's route; Local privacy is preserved for children (subagent.rs:31-60). Desktop, Mobile, Chrome, VS Code agent definitions: not examined.

## 4. Required behaviour

**Established requirements**

- Project agents override global agents with the same name. (source: brief S92.21; contradicted by code (apps/cli/src/agents.rs:331-352))
- The hosted execute endpoint answers that the feature is retired. (source: brief S92.21 (apps/web/app/api/agents/execute/route.ts:8; retired-managed-execution.ts:7-11))
- Agent definitions (name, instructions, tools, model) are stored and can be run by the runtime. (source: brief S92.21 Should line)
- A coordinator spawns subagents, bounds depth and fan-out and merges results. (source: brief S92.24 Should line; status not applicable anywhere)
- A CLI agent definition may never raise the session's permission mode. (source: code and test (apps/cli/src/agents.rs:2384-2437))

**Acceptance criteria**

1. /agents lists project and global agents and shows the folders when none exist.
2. /agents create <name> writes a markdown file in .agiworkforce/agents and /agents create <name> --global writes under the user config folder.
3. /agents validate reports duplicate names and invalid permission modes.
4. An untrusted project supplies no agents.
5. A project agent with the same name as a user agent is ignored and the user's is kept.
6. POST /api/agents/execute returns 410 with code CANONICAL_COMPLETION_REQUIRED.
7. On web, a paused or retired agent refuses new chat turns with its message.
8. A subagent at depth 3 cannot spawn another.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's item statuses should be corrected for the hosted store and the CLI subagent manager [inferred from the code read].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide which precedence is wanted (project or user) and make brief, help text and code agree.
- [proposed] Offer hosted subagents with the already designed budget tree, or remove the unused columns.
- [proposed] Remove the retired execute route once no client calls it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | agents.rs (definitions, discovery, /agents) | `apps/cli/src/agents.rs` | Agent definition type, discovery order, trust check, management commands, apply to session. |
| command | /agents | `apps/cli/src/agents.rs` | render_agents_command (line 580) and help text (857-870). |
| config | --agent flag | `apps/cli/src/lib.rs` | Starts a session with a named agent (line 424-426). |
| service | agent tool | `apps/cli/src/features/exec/tools/mod.rs` | Model tool with list and run actions (line 1150). |
| service | SubagentManager | `apps/cli/src/subagent.rs` | Spawns child sessions with depth, concurrency and spend limits (lines 429-640). |
| service | subagent audit | `apps/cli/src/subagent_audit.rs` | Records finished subagent runs for /agents history. |
| component | agent picker | `apps/cli/src/tui/widgets/agent_picker.rs` | TUI list of agents. |
| endpoint | POST /api/agents/execute | `apps/web/app/api/agents/execute/route.ts` | Retired; returns 410. |
| service | retiredManagedExecutionResponse | `apps/web/lib/server/retired-managed-execution.ts` | The 410 body with code and completion URL. |
| table | user_agents, user_agent_versions, user_agent_access, user_agent_files | `apps/web/db/neon/0370_user_agents.sql` | Hosted agent store with publish, share and files. |
| service | custom-agent-service | `apps/web/lib/services/custom-agent-service.ts` | Create, update, publish, restore, share, usage, files for hosted agents. |
| service | loadAgentTurnConfig | `apps/web/lib/agents/agent-turn-config.ts` | Loads an agent for a turn and refuses paused, retired or over-limit agents. |
| endpoint | /api/custom-agents (and sub-routes) | `apps/web/app/api/custom-agents/route.ts` | CRUD, publish, share, status, versions, files, usage, export, import. |
| screen | AgentsPage | `apps/web/features/agents/components/AgentsPage.tsx` | Web Agents list at /chat/agents. |
| component | AgentPublishPanel | `apps/web/features/agents/components/AgentPublishPanel.tsx` | Publish and share panel. |
| service | request-processor agent hook | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads the conversation's agent into the turn (lines 3897-3898). |
| service | scheduled agent hook | `apps/web/lib/services/scheduled-agent-executor.ts` | Runs a scheduled task as a chosen agent (lines 896-901). |
| table | cloud_agent_run_budgets (subagent columns) | `apps/web/db/neon/0258_cloud_agent_run_budgets.sql` | Unused parent, depth and delegation columns for a future hosted subagent tree. |
| test | agents.rs unit tests | `apps/cli/src/agents.rs` | Inline tests from line 1932 on. |
| test | custom-agent-service tests | `apps/web/lib/agents/__tests__/custom-agent-service.test.ts` | Hosted agent service. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI reads markdown agent files from user, plugin and trusted project folders | device | apps/cli/src/agents.rs:258-318 |
| CLI applies the chosen definition to the session before the model runs | device | apps/cli/src/agents.rs:120-170 |
| CLI model call goes to the session's provider (or a local model) | outside service | apps/cli/src/subagent.rs:31-60 (children use the parent's route) |
| Web: the conversation's agent is loaded and its config and files shape the turn | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3897-3898; apps/web/lib/agents/agent-turn-config.ts:57-110 |
| Web: limits (daily turns, monthly credits) are read before the turn | our servers | apps/web/lib/agents/agent-turn-config.ts:77-99 |
| Retired endpoint returns 410 | our servers | apps/web/app/api/agents/execute/route.ts:8-10 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI agent definition (markdown with front matter) | Files on the device: .agiworkforce/agents, .claude/agents, user config agents folder | No sync found | Deleted by /agents delete <name> --yes; whether it goes to Trash first: unknown |
| Hosted agent, versions, access, files | Neon tables user_agents, user_agent_versions, user_agent_access, user_agent_files | Has a server version column for cloud sync (0370: server_version) | Retire keeps history read-only; delete sets conversation and schedule links to null (0370 header) |
| Subagent run audit | Local audit file via approval_audit helpers | No | unknown |

**Models and providers.** A CLI agent may name a model; invalid override is ignored with a message (apps/cli/src/agents.rs:123-134). Children inherit the parent's provider and privacy mode so a Local session cannot reach a cloud provider (apps/cli/src/subagent.rs:23-60). A hosted agent may name a model, validated against the catalog (apps/web/lib/services/custom-agent-service.ts:180).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI agents: no account needed to define or run (files on disk). Web agents: signed-in account. |
| Permissions | CLI: workspace trust decides whether project agents load; agent permission mode can only narrow (agents.rs:270-274, 2384-2437). Web: row level security, owner or shared access, workspace role for sharing (0370 migration). |
| Subscription | Web agents: no plan check found in the files read; per-agent monthly credit limit and daily message limit are enforced (agent-turn-config.ts:77-99). Scheduled use follows the schedule plan limits (F092-09). |
| Limits and metering | CLI agent max_budget_usd caps session spend (agents.rs:60-80); children get a share of the session cap (subagent.rs:595-607). Web: daily_turn_limit up to 10000 and monthly credit limit (0370; agent-turn-config.ts). |
| Feature flags | None found. |
| Model compatibility | Not examined beyond model validation. |
| Provider restrictions | Children stay on the parent's provider and privacy mode (subagent.rs:23-60). |
| Local mode | CLI definitions are files and work offline. A Local session's subagent stays Local; off-device route is None for Local sessions (apps/cli/src/subagent.rs:41-45). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No agents | /agents shows the project and global folders and how to create one | apps/cli/src/agents.rs:874-885 |
| Unknown agent | 'Agent `<name>` was not found.' with help | agents.rs:590-593 |
| Untrusted workspace | Project agents are not loaded | agents.rs:270-274; test 2199 |
| Name collision | Project agent ignored, warning logged | agents.rs:331-352 |
| Path escapes the project | Agent file is not loaded | test at agents.rs:2173 |
| Delete without confirmation | Needs --yes | agents.rs:624-628 |
| Depth reached | 'Maximum subagent nesting depth reached (3)...' | apps/cli/src/subagent.rs:612-618 |
| Spend cap reached | No further subagent can be spawned | subagent.rs:620-632 |
| Web agent paused, retired, unavailable, over limit | Turn refused with a named message | apps/web/lib/agents/agent-turn-config.ts:20-99 |
| Retired execute endpoint | 410 | apps/web/app/api/agents/execute/route.ts:8 |
| Accessibility and app differences | not handled or not examined for web agent screens; CLI output uses terminal text sanitising (agents.rs:127-130) | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/agents.rs`: Inline tests: template creation, create help and draft parsing, detail and validation output, discovery, untrusted project supplies no agents, project agent never replaces user agent, path escape, permission mode never raised, model-invoked agent only narrows authority, bounded catalog.
- `apps/cli/src/subagent.rs`: Inline tests include concurrency constant and depth limit (lines 1422, 2082).
- `apps/web/lib/agents/__tests__/custom-agent-service.test.ts`: Hosted agent service (by file name; not read).
- `apps/web/lib/agents/__tests__/agent-turn-config.test.ts`: Turn config and refusals (by file name; not read).
- `apps/web/lib/agents/__tests__/agent-markdown.test.ts`: Agent markdown import and export (by file name; not read).
- `apps/web/db/neon/user-agents-migration.test.ts`: Migration 0370 (by file name; not read).

**Test scenarios**

- **Create and list**
  1. In a scratch folder run the CLI and type /agents create reviewer
  2. Type /agents
  - Expected: File .agiworkforce/agents/reviewer.md exists and the list shows it.
- **Precedence**
  1. Create an agent named reviewer in the global folder and another in the trusted project
  2. Run /agents and /agents path reviewer
  - Expected: Today: the global one is used and the project one is ignored.
- **Retired route**
  1. POST to /api/agents/execute on the local build
  - Expected: 410 with code CANONICAL_COMPLETION_REQUIRED.
- **Hosted agent**
  1. On web open /chat/agents, choose New agent, add instructions, Publish
  2. Start a chat as the agent
  - Expected: Replies follow the instructions; pausing the agent blocks the next turn with its message.
- **Subagent depth**
  1. In the CLI ask for nested delegated tasks four levels deep
  - Expected: The fourth level is refused with the depth message.
- **Untrusted project**
  1. Open a project not trusted for configuration that has .agiworkforce/agents
  2. Run /agents
  - Expected: Project agents are absent.

**Where to look when it fails**

- CLI warning: 'ignoring project agent that collides with your own agent'.
- CLI /agents validate output.
- Web error codes agent_unavailable, agent_paused, agent_retired, agent_turn_limit, agent_credit_limit (agent-turn-config.ts:15-20).
- 410 body code CANONICAL_COMPLETION_REQUIRED.
- Table user_agents.status and published_version.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief and code disagree on name collisions (project vs user).** Affects: CLI users and testers. Evidence: apps/cli/src/agents.rs:331-352, 2217. Work needed: Decide the rule, then fix brief, help or code.
- **Brief says no hosted definition store and no subagents; code has a hosted store and a CLI subagent manager.** Affects: Brief accuracy for web and CLI. Evidence: apps/web/db/neon/0370_user_agents.sql; apps/cli/src/subagent.rs:429-453. Work needed: Correct item statuses S92.21 and S92.24 and the CLI folder name.
- **No hosted subagent coordinator; budget tree columns are unused.** Affects: Cloud agent runs on all apps. Evidence: apps/web/db/neon/0258_cloud_agent_run_budgets.sql:46-50. Work needed: Build or remove.
- **Hosted agents are not run by the durable runtime as definitions; they shape a normal chat or schedule turn.** Affects: Web. Evidence: apps/web/lib/agents/agent-turn-config.ts:57-110. Work needed: Confirm that is the intended meaning of 'can be run by the runtime'.
- **Agent definitions on Desktop, Mobile, Chrome, VS Code and sync of CLI files to the account were not found.** Affects: Those apps. Evidence: not found in files read. Work needed: Search and decide scope.
- **The retired execute route is still deployed.** Affects: Any old client. Evidence: apps/web/app/api/agents/execute/route.ts. Work needed: Remove when no caller remains.

**Depends on**

- surface:cli
- surface:web
- mode:local
- mode:cloud
- mode:own-key
- table:user_agents
- table:user_agent_versions
- table:user_agent_files
- api:POST /api/agents/execute
- api:GET /api/custom-agents
- F092-09
- F092-08
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-authorization-and-workspaces

## Unknown

- Whether Desktop, Mobile, Chrome or VS Code let people define or run named agents.
- Whether /agents delete moves the file to Trash first (AGENTS.md section 9 requires it).
- What the /api/agents/* routes other than execute do and whether they are live.
- Whether web agent use is gated by plan.
- How the CLI --agent flag and the agent tool are used in the TUI in practice (not run).
- Retention of the CLI subagent audit file.
