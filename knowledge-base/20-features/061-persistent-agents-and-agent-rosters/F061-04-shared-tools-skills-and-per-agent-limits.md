---
id: "F061-04"
type: "feature"
title: "Shared tools, skills and per-agent limits"
aliases: ["Shared tools, skills and per-agent limits", "Agent tools", "Agent skills", "Agent connectors", "maxTurns", "maxBudgetUsd", "Messages a day, per person", "Credits a month, across everyone", "Web search, Code execution, Image generation toggles", "S61.08", "S61.09", "S61.20"]
area: "61 Persistent agents and agent rosters"
available_on: ["web", "mobile", "cli"]
implementation: {web: "built", desktop: "missing", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S61.08", "S61.09", "S61.20"]
depends_on: ["surface:cli", "surface:web", "surface:mobile", "mode:cloud", "mode:local", "file:apps/cli/src/agents.rs", "file:apps/cli/src/teams.rs", "file:apps/web/lib/agents/agent-turn-config.ts", "table:user_agents", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "F061-03", "F061-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F061-04 Shared tools, skills and per-agent limits

Agents reuse the tools, connectors and skills the account already has, but each can be narrowed and capped. CLI: tool allow and deny lists, MCP servers, skills, max turns and a dollar cap. Web and mobile Cloud: connector and skill selection, three tool toggles, web domain rules, a daily message limit and a monthly credit limit.

Area: [61. Persistent agents and agent rosters](README.md). Requirement items: [S61.08](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6108), [S61.09](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6109), [S61.20](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6120).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets an agent use shared account-level tools and skills while restricting which ones and how much it may spend or run.

**Why it exists.** S61.08 shared tools with per-agent limits, S61.09 shared skills visible to the user, S61.20 turn and spend limits that are enforced (doc: knowledge-base/data/area-briefs/061-persistent-agents-and-agent-rosters.md).

**Who uses it.** CLI users who want a read-only reviewer; workspace owners who want an agent that cannot use the web or cost too much.

**Problems it solves**

- Stopping an agent from using tools it should not.
- Capping cost per agent.
- Preloading the right skills.
- Limiting how many messages people can send to an agent each day.

**Use cases**

- Set tools to Read, Grep for a reviewer and maxBudgetUsd to 0.50.
- Turn off web search and code execution for a policy-bound agent on web.
- Allow only two connectors for a sales agent.
- Set 'Messages a day, per person' to 20 for a shared support agent.

## 2. User experience

**Where to find it**

- CLI: agent file frontmatter or /agents set <name> tools|disallowedTools|skills|maxTurns|maxBudgetUsd (apps/cli/src/agents.rs:1116-1127).
- Web editor section 'Model and tools' and the access section (apps/web/features/agents/components/AgentConfigForm.tsx:498-675).
- Mobile editor sections 'Model and tools' and 'Connectors and skills' (apps/mobile/src/features/agents/components/AgentConfigSections.tsx:317-373).
- Other apps: none found.

**Before you start**

- CLI: tool names valid for the session; skills installed for them to load.
- Cloud: connectors and skills must exist on the account; the editor lists options (apps/web/features/agents/components/AgentSkillSelection.tsx; hooks/use-agent-options.ts).

**Screens and controls**

- CLI /agents validate warns 'skills not installed: ...' (apps/cli/src/agents.rs:1000-1008).
- CLI /agents show prints 'skills: preloads a, b (not installed: b)' or 'uses your installed skills when it needs them (N installed)' (apps/cli/src/agents.rs:1332-1347).
- CLI maxBudgetUsd accepts a positive dollar amount like 0.50; error text 'maxBudgetUsd takes a positive amount in US dollars, such as 0.50.' (apps/cli/src/agents.rs:1213-1224).
- Web toggles Web search, Code execution, Image generation; fields 'Messages a day, per person' and 'Credits a month, across everyone'; allowed and blocked web domain lists (AgentConfigForm.tsx:498-675).
- Mobile toggles Web search, Code execution, Image generation and 'Messages a day, per person' (AgentConfigSections.tsx:345-363).

**Journey**

1. CLI: edit the file or run /agents set reviewer tools Read, Grep.
2. Run /agents validate to check skills.
3. Activate the agent; the tool allowlist is intersected with any command-line allowlist; the lower spend cap wins.
4. Cloud: open the editor, choose tools and limits, Publish; non-owners then run the published settings.
5. When a limit is reached, the next message is refused with a plain sentence.

**What the person sees and gets**

- Cloud daily limit: '<name> has reached its limit of N messages a day set by its owner. It resets at midnight UTC.' (apps/web/lib/agents/agent-turn-config.ts:84-92).
- Cloud credit limit: '<name> has used the N credits its owner allows each month. It runs again on the 1st (UTC).' (agent-turn-config.ts:94-103).
- CLI team spend: 'I stopped: the team has used X of the Y the spend cap left it.' (apps/cli/src/teams.rs:741-745).

**Settings**

- CLI frontmatter keys: tools, disallowedTools (or disallowed_tools), skills, mcpServers (or mcp_servers), maxTurns (or max_turns), maxBudgetUsd (or max_budget_usd) (apps/cli/src/agents.rs:1470-1525).
- Cloud config keys: webSearch, codeExecution, imageGeneration, connectorIds, skillNames, allowedWebDomains, blockedWebDomains, dailyTurnLimit, monthlyCreditLimit (packages/contracts/cloud-contracts/src/agents.ts:94-108).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI tool allowlist is intersected with the caller's allowlist so an agent can only narrow (apps/cli/src/agents.rs:111-118).
- CLI disallowed tools are appended to the session's list (agents.rs:119-125).
- CLI skills named in the agent are matched case-insensitively against installed skills and each match is added as a system message; missing ones are skipped silently at run time (agents.rs:67-85).
- CLI spend cap: the lower of session and agent cap (agents.rs:57-66).
- CLI max turns set from the agent file in the session path (agents.rs:128-130); in subagent paths it can only go down (agents.rs:226-232).
- CLI team spend is pooled: teammates share remaining headroom and a teammate stops and tells the lead when the cap is used up (apps/cli/src/teams.rs:252-295, 726-748).
- Cloud: web search and code execution toggles turn the request flags off (agent-turn-config.ts:139-148); image generation gated (lines 218-220).
- Cloud: connectors and skills restricted by the agent (agent-turn-config.ts:150-173; request-processor.ts:5377).
- Cloud: allowed and blocked web domain lists passed to the web tool policy (request-processor.ts:5264-5268).
- Cloud: daily message limit counts user messages since UTC midnight; monthly credit limit compares month spend to the cap (custom-agent-service.ts:690-719; agent-turn-config.ts:84-103; db/neon/0374_slack_channel_policy_and_agent_credit_cap.sql:82).

**Incomplete**

- CLI mcpServers is applied in the session path by replacing the session list, not by narrowing it, and /agents set cannot edit it (apps/cli/src/agents.rs:123-127, 1116-1127). In the subagent path it is intersected (agents.rs:213-223).
- CLI max_turns in the session path replaces the session value even if it is larger (agents.rs:128-130).
- A named teammate's own maxBudgetUsd is applied by apply_to_subagent_session then overwritten each turn by the team pool value (apps/cli/src/teams.rs:716, 734) [inferred].
- CLI spend and turn limits have no screen outside the command line (brief S61.20).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Chrome, VS Code and Tauri desktop: no per-agent tool or limit controls found.
- A per-agent limit editor in the CLI picker: none.

## 4. Required behaviour

**Established requirements**

- Agents share account-level tools and connectors with per-agent limits. (source: S61.08)
- Agents can use account-level skills and the user can see which ones. (source: S61.09)
- The user can set resource limits (turns, spend) per agent and they are enforced. (source: S61.20)
- Tool allowlist from an agent can only narrow what the caller started with. (source: apps/cli/src/agents.rs:111-118 and test at agents.rs:2490)
- Rate limits and quotas are configuration, not constants. (source: AGENTS.md section 8)

**Acceptance criteria**

1. With the CLI started with an allowlist of A and B, an agent listing B and C ends up with only B.
2. An agent with maxBudgetUsd 0.50 in a session with cap 2.00 ends with cap 0.50; with session cap 0.25 ends with 0.25.
3. /agents set x maxBudgetUsd -1 fails with the positive amount message.
4. /agents validate lists a skill that is not installed.
5. On web, with Web search off, a chat as the agent sends web_search false.
6. On web, an agent with dailyTurnLimit 2 refuses the third user message of the UTC day with the daily limit sentence.
7. On web, an agent with a monthly credit limit refuses once spend reaches it.
8. A teammate stops and messages the lead when the team pool is spent.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Per-agent limits should show current use to the owner [inferred; usage panel exists but its content was not fully read].
- MCP servers should narrow, not replace, in the session path [inferred from the subagent path].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add mcpServers to /agents set.
- [proposed] Show a daily and monthly meter on the owner's web editor.
- [proposed] Print a warning at activation when a listed skill is not installed.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | cap_spend and preload_skills | `apps/cli/src/agents.rs` | Spend cap and skill preload (lines 57-85). |
| service | intersect_allowlists | `apps/cli/src/tool_filters.rs` | Used for the allowlist intersection (referenced at agents.rs:112); file not opened. |
| service | TeamManager spend pool | `apps/cli/src/teams.rs` | set_budget_headroom, record_teammate_spend, turn_budget_usd (252-295). |
| service | settle_team_spend | `apps/cli/src/agent/chat.rs` | Settles team spend into the lead's ledger (line 1074). |
| service | agent tool policy | `apps/web/lib/agents/agent-turn-config.ts` | applyAgentToolPolicy, agentAllowsConnector, agentAllowsSkill, limit checks. |
| service | turn counters | `apps/web/lib/services/custom-agent-service.ts` | countAgentTurnsToday, readAgentMonthSpendMicrousd (690-719). |
| table | app_user_agent_month_spend | `apps/web/db/neon/0374_slack_channel_policy_and_agent_credit_cap.sql` | Database function summing agent spend for the month (line 82). |
| component | AgentConfigForm | `apps/web/features/agents/components/AgentConfigForm.tsx` | Toggles and limit inputs. |
| component | AgentSkillSelection | `apps/web/features/agents/components/AgentSkillSelection.tsx` | Skill choice for an agent. |
| hook | use-agent-options | `apps/web/features/agents/hooks/use-agent-options.ts` | Loads connector and skill options. |
| schema | AgentConfigSchema limits | `packages/contracts/cloud-contracts/src/agents.ts` | dailyTurnLimit max 10,000; monthlyCreditLimit max 100,000,000; selections max 200; domains max 32. |
| service | chat request processor policy | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Applies skills, domains and image gate (5264, 5377, 6336). |
| component | AgentConfigSections (mobile) | `apps/mobile/src/features/agents/components/AgentConfigSections.tsx` | Mobile toggles and daily limit. |
| schema | user_agents columns | `apps/web/db/neon/0370_user_agents.sql` | Stores toggles and limits; domains in 0388, effort in 0389. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI: activation intersects tools, appends disallowed tools, replaces the MCP list, sets max turns, takes the lower spend cap and preloads skills. | device | apps/cli/src/agents.rs:98-146 |
| CLI: before each teammate turn the team computes an even share of remaining pooled headroom and stops if none is left. | device | apps/cli/src/teams.rs:277-295, 726-748 |
| Cloud: before applying an agent to a chat turn the server counts today's user messages and the month's spend and refuses over the cap. | our servers | apps/web/lib/agents/agent-turn-config.ts:84-103 |
| Cloud: tool flags and connector or skill lists are applied to the request before the model call. | our servers | apps/web/lib/agents/agent-turn-config.ts:139-173; request-processor.ts:4079, 5377 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI limits and lists | agent file frontmatter | No | With the file |
| Cloud limits and selections | user_agents columns; copied into user_agent_versions on publish | Yes | Versions kept (apps/web/lib/services/custom-agent-service.ts:449-491) |
| Cloud turn and spend counts | Derived from web_messages and usage records | Server side | By the chat data rules (SYS-data-model-and-migrations) |

**Models and providers.** Spend is computed in credits from model usage; no provider is named in the feature. CLI spend cap uses dollars and prints credits (apps/cli/src/agents.rs:925-929).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI: none for the limits themselves. Cloud: signed-in account. |
| Permissions | Only the owner edits limits. The agent can narrow but not widen the caller's tools (agents.rs:111-118). |
| Subscription | No plan gate found on setting limits. Credits are the metering unit; monthly credit limit is measured in credits (agent-turn-config.ts:94-103). How credits relate to the plan is in SYS-subscriptions-entitlements-and-usage (not opened). |
| Limits and metering | dailyTurnLimit counts per person, per UTC day (custom-agent-service.ts:701-719); monthlyCreditLimit counts across everyone for the month. CLI subagent max concurrent 7, depth 3, 15 turns (apps/cli/src/subagent.rs:429-453). |
| Feature flags | none found in the code. |
| Model compatibility | Effort options depend on the model (packages/contracts/cloud-contracts/src/agents.ts:46-70). |
| Provider restrictions | none found in the code. |
| Local mode | CLI limits apply in Local mode; a local model has no billed cost so the dollar cap may never trigger [inferred]. Cloud limits are Cloud only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid maxBudgetUsd in file | Value is dropped when not positive or not finite. | apps/cli/src/agents.rs:1517-1523 |
| Skill not installed | Skipped at run time, reported by validate and shown in show. | apps/cli/src/agents.rs:67-85, 1000-1008, 1332-1347 |
| Session spend cap already reached | spawn_teammate refuses: 'The session spend cap is reached, so no teammate can start.' | apps/cli/src/agent/chat.rs:1901-1910 |
| Daily limit reached | Turn refused until midnight UTC. | apps/web/lib/agents/agent-turn-config.ts:84-92 |
| Scheduled routine hits a limit | Scheduling checks the agent with countTurns false, so the daily message limit is not counted for routines [inferred]. | apps/web/lib/services/schedule-service.ts:922-924 |
| Unknown tool name in tools | not handled in the code beyond the filter; no validation of tool names found. | apps/cli/src/agents.rs:958-1037 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/agents.rs (inline tests)`: Model-invoked agent can only narrow parent authority; tool catalog bounded; validation reports bad modes.
- `apps/cli/src/agent/mod.rs (inline test a_named_agent_keeps_the_callers_tool_allowlist at line 5250)`: Named agent keeps the caller's allowlist.
- `apps/cli/src/teams.rs (inline tests)`: The spend cap holds across the whole team; teammate turns reach the lead's cost once; failed turn still reports spend.
- `apps/web/lib/agents/__tests__/agent-turn-config.test.ts`: Turn config (contents not opened).
- `apps/web/features/agents/__tests__/AgentSkillSelection.test.tsx`: Skill selection UI (contents not opened).
- apps/web/db/neon/__tests__/slack-channel-policy-and-agent-credit-cap-migration.test.ts (not found) (not found): Credit cap migration (contents not opened).
- apps/web/db/neon/__tests__/agent-web-domain-rules-migration.test.ts (not found) (not found): Domain rules migration (contents not opened).

**Test scenarios**

- **Allowlist narrowing**
  1. Start agi with an allowlist of Read and Grep.
  2. Activate an agent whose tools are Grep and Write.
  3. Ask it to write a file.
  - Expected: Only Grep is available; Write is refused.
- **Lower spend cap wins**
  1. Start with a session cap of 2.00.
  2. Activate an agent with maxBudgetUsd 0.50.
  - Expected: Session cap becomes 0.50.
- **Daily limit**
  1. Set 'Messages a day, per person' to 1 on web and publish.
  2. As a member send two messages in one UTC day.
  - Expected: Second is refused with the daily limit sentence.
- **Tool toggle**
  1. Turn off Web search and publish.
  2. Ask the agent for today's news.
  - Expected: No web search is used.
- **Team pool**
  1. Start agi --team with a small cap and spawn two teammates with work.
  2. Watch lead messages.
  - Expected: A teammate reports it stopped when the pool is spent.

**Where to look when it fails**

- CLI: /agents show <name> prints spend cap and skills; /agents history prints spend per run.
- Cloud: refusal codes agent_turn_limit and agent_credit_limit (agent-turn-config.ts:17-22).
- Database function app_user_agent_month_spend.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md)
- CLI: [70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md)
- No hands-on plan yet for Web: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **MCP server list replaces rather than narrows in the CLI session path and cannot be set with /agents set.** Affects: CLI users with MCP servers.. Evidence: apps/cli/src/agents.rs:123-127, 1116-1127. Work needed: Intersect with the session list; add the field.
- **Skill misses are silent at run time.** Affects: CLI users.. Evidence: apps/cli/src/agents.rs:67-85. Work needed: Warn at activation.
- **A teammate's own spend cap may be overwritten by the team pool.** Affects: CLI teams using named agents with caps.. Evidence: apps/cli/src/teams.rs:716, 734. Work needed: Take the lower of the agent cap and the pool share; add a test.
- **No controls in Chrome, VS Code or Tauri desktop.** Affects: Those users.. Evidence: No code found. Work needed: Decide scope.
- **Brief says only the CLI has limits; web and mobile have them.** Affects: Documentation.. Evidence: packages/contracts/cloud-contracts/src/agents.ts:94-108. Work needed: Update brief.
- Not built on: Desktop, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- surface:web
- surface:mobile
- mode:cloud
- mode:local
- file:apps/cli/src/agents.rs
- file:apps/cli/src/teams.rs
- file:apps/web/lib/agents/agent-turn-config.ts
- table:user_agents
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- F061-03
- F061-06

## Unknown

- Where the intersect_allowlists function lives was inferred from the call path and the file was not opened.
- How credits map to plans; the subscription system was not read.
- Whether the owner can see current daily or month use in the editor beyond the Usage panel; that panel was not opened.
- Whether local models report a cost the CLI dollar cap can see.
