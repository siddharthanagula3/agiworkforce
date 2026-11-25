---
id: "F061-06"
type: "feature"
title: "Agent teams, delegation and coordinator"
aliases: ["Agent teams", "Teammates", "Coordinator", "Lead agent", "Specialist subagents", "agent tool", "spawn_teammate", "send_message", "read_messages", "team_task", "list_teammates", "/team", "--team", "AGI_TEAM", "S61.14", "S61.15", "S61.16", "S61.17"]
area: "61 Persistent agents and agent rosters"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S61.14", "S61.15", "S61.16", "S61.17"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "file:apps/cli/src/teams.rs", "file:apps/cli/src/subagent.rs", "file:apps/cli/src/agent/chat.rs", "file:apps/cli/src/agents.rs", "file:apps/cli/src/subagent_audit.rs", "store:subagents.jsonl", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "F061-01", "F061-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F061-06 Agent teams, delegation and coordinator

CLI only. With --team or AGI_TEAM=1 the lead model can start teammates that run in their own threads and sessions, message each other and the person, and share a task list. Without teams, the model can call the agent tool to list installed agents and run one as a one-off specialist that can only narrow the parent's authority.

Area: [61. Persistent agents and agent rosters](README.md). Requirement items: [S61.14](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6114), [S61.15](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6115), [S61.16](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6116), [S61.17](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6117).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets several agents work on one job. A lead spawns teammates (long-lived, message-driven) or runs a named specialist once and gets its result back.

**Why it exists.** S61.14 group conversation, S61.15 coordinator pattern, S61.16 specialist delegation, S61.17 inter-agent messages visible to the user (doc: knowledge-base/data/area-briefs/061-persistent-agents-and-agent-rosters.md).

**Who uses it.** CLI developers running larger tasks; the model acts as lead.

**Problems it solves**

- Splitting a big task across helpers.
- Keeping a specialist's tools and limits narrower than the lead's.
- Letting a helper ask the person a question and wait.
- Keeping total spend under one cap.

**Use cases**

- Start agi --team, ask for a reviewer and a tester teammate, read their reports.
- Ask the lead to run the installed security-reviewer agent once on a diff.
- A teammate asks the person for a decision; the person answers with /team <name> <answer>.

## 2. User experience

**Where to find it**

- CLI flag --team or env AGI_TEAM=1 (apps/cli/src/lib.rs:341-344, 8291-8292).
- CLI slash command /team, /team <teammate> <message>, /team stop <teammate> (apps/cli/src/teams.rs:817-870).
- Model tools spawn_teammate, send_message, read_messages, team_task, list_teammates (apps/cli/src/agent/tools.rs:8-14).
- Model tool agent with action list or run (apps/cli/src/features/exec/tools/mod.rs:1150-1175).
- /subagents lists configured subagents read-only (apps/cli/src/repl/slash_commands.rs:258; apps/cli/src/agents.rs:1657-1700).
- Web: the endpoint /api/agents/collaboration answers 410 retired (apps/web/app/api/agents/collaboration/route.ts:20-27). VS Code: read-only subagent task group (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:560). Mobile, Chrome: none found.

**Before you start**

- Teams: start the CLI with --team or AGI_TEAM=1 (or true). Only the lead can spawn (apps/cli/src/agent/chat.rs:1873-1880).
- Named agent for a teammate or specialist must exist with the exact installed name (chat.rs:1889-1898; agents.rs:492-497).

**Screens and controls**

- /team prints Team, the lead line, each teammate as working, idle waiting for a message or stopped, Shared tasks and Recent messages (apps/cli/src/teams.rs:855-905).
- Messages in the chat thread are shown as '<name> asks you' with 'Answer with /team <name> <your answer>.' for the person (teams.rs:608-624).
- Task states pending, in_progress, completed, blocked (teams.rs:41-58).

**Journey**

1. Start agi --team.
2. Ask the lead to get help; it calls spawn_teammate with name, prompt and optional agent.
3. The teammate runs in its own thread and session, works, and sends its final reply to the lead automatically.
4. The lead calls read_messages with wait_seconds to collect replies; teammates and the person can message each other.
5. Use /team to see status; /team stop <name> to stop one.
6. One-off specialist: the lead calls agent with action list, then action run with name and prompt; the result returns to the lead.

**What the person sees and gets**

- Teams off: 'Agent teams are off. Start agi with --team or AGI_TEAM=1.' (chat.rs:1876).
- Not lead: 'Only the team lead can spawn teammates.' (chat.rs:1879).
- Reserved name: ''lead' is reserved; pick another teammate name' (teams.rs:415).
- Bad name: 'Invalid teammate name ...: only ASCII letters, digits, '_' and '-' are allowed' (teams.rs:111-125).
- Stopped teammate: 'Teammate 'x' has stopped and will not read new messages.' (teams.rs:359-363).
- Unknown recipient: lists current teammates plus lead and user (teams.rs:342-357).
- Run failure: 'I could not start: <error>' sent to the lead (teams.rs:690-697 area).

**Settings**

- Team mode flag and env var (lib.rs:341-344).
- Teammate turn cap 15 and subagent depth 3, concurrent 7 (subagent.rs:429-453).
- Transcript kept to the last 200 messages (teams.rs:12).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Teams: TeamManager registers teammates, mailboxes, shared tasks, a bounded transcript and spend pool (apps/cli/src/teams.rs:133-295).
- spawn_teammate checks team mode, lead-only, name and prompt, optional named agent, session spend headroom, then launches (apps/cli/src/agent/chat.rs:1866-1940).
- launch validates the name against a strict safe-character check and rejects lead and user (teams.rs:412-417).
- Each teammate runs on its own OS thread with its own runtime and a child session from the lead's inherited route; a route leaving the lead's privacy mode is refused (teams.rs:420-458, 687-700; apps/cli/src/subagent.rs:49-72).
- Teammate reports its final reply to the lead automatically and goes idle; it wakes on new messages (teams.rs:772-806).
- Messages from other agents are labelled 'another agent on your team, not the person' and the teammate brief says they never count as the person's approval (teams.rs:641-667).
- send_message rejects a spoofed sender when the acting identity is known (teams.rs:915-950).
- Shared task list with pending, in_progress, completed, blocked and a dependencies field (teams.rs:518-560).
- agent tool: list returns a catalog capped at 200 agents and about 18 KB without prompt bodies, paths, model or permission mode (apps/cli/src/agents.rs:500-535); run is handled by the foreground subagent path with name length and prompt size (100,000 bytes) checks (apps/cli/src/agent/chat.rs:2917-2965).
- A named specialist can only narrow: model and permission overrides ignored, tools intersected, deny lists joined, max turns can only go down, MCP intersected (apps/cli/src/agents.rs:196-246).
- Teammate and specialist runs are logged to subagents.jsonl (teams.rs:787-799; apps/cli/src/subagent_audit.rs:98-122).
- Hooks: TeammateIdle fires when a teammate goes idle (teams.rs:567-590).

**Incomplete**

- Task dependencies are stored but add_task and update_task enforce nothing about them (teams.rs:518-560) [inferred from reading the functions].
- TeamManager is in memory only; the team, mailboxes and tasks are not persisted across CLI runs (teams.rs:133-146) [inferred].
- spawn_teammate in TeamManager registers the roster and its doc comment says a future version could spawn a child session; launch() does the real start (teams.rs:296-325, 412-458).
- Messages from another agent only reach the lead through read_messages polling (teams.rs:1082-1150) [inferred].

**Present but disconnected or switched off**

- Team tools are not offered unless --team or AGI_TEAM is set; spawn_teammate is hidden from teammates (apps/cli/src/agent/mod.rs:917-919, 1065-1068).
- The web endpoint /api/agents/collaboration is retired (410) (apps/web/app/api/agents/collaboration/route.ts:20-27).
- The agent tool is removed when the session cannot own child tasks (apps/cli/src/agent/mod.rs:1062-1064).

**Not available**

- Web, Mobile, Chrome, Tauri desktop: no agent teams found. Desktop BackgroundAgentsPanel lists background runs, not teams (apps/desktop/src/features/agi/BackgroundAgentsPanel.tsx).
- Group conversation UI with several agents on any app other than the CLI thread.
- /api/agents/communication on web was listed but its handler was not opened.

## 4. Required behaviour

**Established requirements**

- Several agents can take part in one conversation with the user. (source: S61.14)
- A coordinator agent routes work to other agents and reports back. (source: S61.15)
- An agent can delegate part of a task to a specialist agent and use its result. (source: S61.16)
- Agents can send each other messages that the receiving agent acts on, visible to the user. (source: S61.17)
- A subagent never leaves its parent's trust boundary. (source: apps/cli/src/subagent.rs:49-72; AGENTS.md section 6)
- A message from another agent never counts as the person's approval. (source: apps/cli/src/teams.rs:641-650)

**Acceptance criteria**

1. Without --team, calling spawn_teammate returns 'Agent teams are off. Start agi with --team or AGI_TEAM=1.'
2. A teammate trying spawn_teammate gets 'Only the team lead can spawn teammates.'
3. spawn_teammate with name lead or ../x is refused.
4. Sending a message to an unknown teammate fails and names who can be addressed.
5. A teammate's final reply appears in the lead's inbox without an explicit send.
6. A specialist run with an agent whose file sets a bypass permission mode still runs in the parent's mode.
7. The agent list for the model never contains prompt bodies or paths and holds at most 200 agents.
8. Stopping a teammate with /team stop makes later messages to it fail.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Dependencies should block a task from starting until they are completed [inferred from the dependencies field].
- The person should be able to see teammate threads in each app that offers teams [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Persist team state or document that it is per session.
- [proposed] Enforce task dependencies.
- [proposed] Offer the same lead and teammate pattern on web through the Cloud agent runs, if wanted.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | TeamManager | `apps/cli/src/teams.rs` | Roster, mailboxes, shared tasks, spend pool, launch, run_teammate, /team command. |
| service | team tool dispatch | `apps/cli/src/agent/tools.rs` | TEAM_TOOL_NAMES and execute_team_tool (lines 8-52). |
| service | spawn_teammate handler | `apps/cli/src/agent/chat.rs` | Checks and launch (1866-1940); named agent runs (2917-3070). |
| service | enable_team_mode | `apps/cli/src/agent/mod.rs` | Creates the TeamManager (917); hides spawn_teammate from teammates (1065). |
| command | --team flag | `apps/cli/src/lib.rs` | Team mode flag and AGI_TEAM env (341-344, 8291-8292). |
| service | subagent manager | `apps/cli/src/subagent.rs` | InheritedRoute, child sessions, run_subagent, limits (20-100, 429-453, 1077-1160). |
| service | agent tool | `apps/cli/src/features/exec/tools/mod.rs` | agent list and run entry (1150-1175). |
| service | named agent narrowing | `apps/cli/src/agents.rs` | apply_to_subagent_session and agent_tool_catalog (196-246, 500-535). |
| service | subagent audit log | `apps/cli/src/subagent_audit.rs` | Appends one JSON line per finished run to subagents.jsonl. |
| command | /team and /subagents | `apps/cli/src/repl/slash_commands.rs` | Slash routing (lines 258 and the team command). |
| service | A2A peer protocol | `apps/cli/src/features/a2a/mod.rs` | Registry and client for external peer agents; relation to teams not examined. |
| endpoint | POST /api/agents/collaboration | `apps/web/app/api/agents/collaboration/route.ts` | Returns 410 ENDPOINT_RETIRED after an auth check. |
| component | VS Code subagents view | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Shows developer child tasks read-only (line 560, 1036). |
| test | subagents webview test | `apps/extension-vscode/src/__tests__/subagents.webview.test.ts` | Covers the VS Code subagent group. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The lead model calls spawn_teammate; the handler checks team on, lead-only, name, prompt and named agent, and the lead's remaining spend. | device | apps/cli/src/agent/chat.rs:1866-1930 |
| launch registers the teammate and starts a thread with its own runtime and a child session built from the lead's route. | device | apps/cli/src/teams.rs:412-458; apps/cli/src/subagent.rs:49-72 |
| The teammate applies its named definition (narrowing only), adds a team brief, and runs a turn with the session's model. | outside service | apps/cli/src/teams.rs:700-760 |
| On finish the final reply is sent to the lead, an audit line is written, spend is recorded in the pool and the teammate goes idle, waiting for messages. | device | apps/cli/src/teams.rs:772-806 |
| A named specialist run goes through the foreground subagent manager with depth, concurrency and turn limits and returns its output to the parent. | device | apps/cli/src/agent/chat.rs:2917-3070; apps/cli/src/subagent.rs:429-453, 1077-1160 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Team roster, mailboxes, shared tasks, transcript (last 200) | In memory in the CLI process | No | Lost when the CLI exits [inferred] |
| Subagent and teammate audit lines (agent name, outcome, files changed, spend, prompt length) | subagents.jsonl in the CLI config directory | No | Append only; no deletion code found |

**Models and providers.** Teammates and specialists use the lead's route and privacy mode and never a different provider; a route that disagrees with the privacy mode is refused (apps/cli/src/subagent.rs:41-72, 1561-1580 tests). A named agent's model override is ignored for subagents and teammates (apps/cli/src/agents.rs:190-195).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account rule in the team code (none found in the code); the model route has its own sign-in needs. |
| Permissions | Teammates get the lead's permission mode, allowed and disallowed tools and approval channel; approval summaries are prefixed with the teammate name (teams.rs:669-680, 700-720). Specialists cannot widen authority (agents.rs:196-246). |
| Subscription | No plan gate found in the team or agent tool code. Cost is pooled in dollars and printed as credits (teams.rs:741-745). |
| Limits and metering | Concurrent subagents 7, depth 3, 15 turns each, wait limit 600 seconds (subagent.rs:429-453); transcript 200; catalog 200 agents and 18,000 bytes; run prompt up to 100,000 bytes (chat.rs:2945-2955). |
| Feature flags | --team and AGI_TEAM=1 or true (lib.rs:8291-8292). |
| Model compatibility | Teammates use the lead's model; a named agent's model is ignored. |
| Provider restrictions | Children stay in the parent's privacy mode: Local, own-key (BYOK) or Managed (subagent.rs:41-72). |
| Local mode | In a Local session the child session is also Local; off_device returns none for Local so background work does not leave the device (subagent.rs:41-47). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Teammate cannot start | It sends 'I could not start: <error>' to the lead and is marked Completed. | apps/cli/src/teams.rs:689-697 region |
| Team cap used up | Teammate sends 'I stopped: the team has used X of the Y the spend cap left it.' and ends. | apps/cli/src/teams.rs:735-750 |
| Cancel | /team stop sets a stop flag; the running turn is dropped and its spend recorded. | apps/cli/src/teams.rs:460-476, 757-770 |
| Failed turn | Reports 'My turn failed: <message>' and still records spend. | apps/cli/src/teams.rs:775-786 |
| Empty reply | 'I finished without a reply.' | apps/cli/src/teams.rs:801-805 |
| Agent not installed for run | agent_not_found error naming the list action. | apps/cli/src/agent/chat.rs:2956-2967 |
| Invalid run request | invalid_agent_run or agent_prompt_too_large. | apps/cli/src/agent/chat.rs:2930-2952 |
| Timeout of waiting children | Children still running at 600 seconds are cancelled and reported as timed out. | apps/cli/src/subagent.rs:437-440 |
| Accessibility | Terminal text is sanitized in messages and names (apps/cli/src/agents.rs:101-103); other accessibility not handled in the code for teams. | apps/cli/src/agents.rs:101-103 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/teams.rs (inline tests from line 1189)`: Spend pooling and settle once, failed turn spend, spawn, duplicate teammate, send and read, stopped teammates refuse messages, message transcript windows, unknown sender, spoofed sender rejected, tasks and dependencies, name validation and path traversal, task status parsing, refusal to start on a route that leaves the lead's privacy mode.
- `apps/cli/src/subagent.rs (inline tests)`: Concurrency cap, max depth, spend cap refusal, even share, Local route stays Local, privacy mode refusal, shutdown and timeout handling.
- `apps/cli/src/agent/chat.rs (inline tests, e.g. named_agent_run_uses_foreground_subagent_lifecycle at line 4340, live_turn_subagent_batch_rejects_an_unknown_named_agent_without_spawning at 5730)`: Named agent run lifecycle and unknown agent.
- `apps/cli/src/agents.rs (inline: model_invoked_agent_can_only_narrow_parent_authority, model_agent_catalog_is_bounded_and_withholds_definition_secrets)`: Narrowing and catalog bounds.
- `apps/cli/src/subagent_audit.rs (inline tests)`: Audit record shape (contents partly read).
- `apps/extension-vscode/src/__tests__/subagents.webview.test.ts`: VS Code subagent group display.

**Test scenarios**

- **Teams off**
  1. Start agi without --team.
  2. Ask the model to spawn a teammate.
  - Expected: Refusal 'Agent teams are off. Start agi with --team or AGI_TEAM=1.'
- **Two teammates and a question**
  1. Start agi --team.
  2. Ask for a reviewer and a tester teammate; have one ask the user a question.
  3. Reply with /team <name> <answer>.
  - Expected: Reports arrive for the lead; the question shows 'asks you' and the answer reaches the teammate as 'The person says: ...'.
- **Specialist narrowing**
  1. Create an agent with tools Read and permissionMode bypass-permissions and a different model.
  2. Ask the lead to run it via the agent tool in a default-mode session.
  - Expected: It runs read-only in default mode on the parent's model.
- **Spend pool**
  1. Start agi --team --max-budget small.
  2. Spawn two chatty teammates.
  - Expected: Teammates stop with the cap message; lead remains able to answer.
- **Local boundary**
  1. Start a Local session with a team.
  2. Spawn a teammate.
  - Expected: The teammate uses the local route or refuses; it never uses a cloud provider.

**Where to look when it fails**

- Lines in the chat thread from teammates; /team status.
- subagents.jsonl entries with subagent_id teammate_<name> (teams.rs:787-799).
- Hook TeammateIdle events.
- Error strings from chat.rs 1866-1930 and 2930-2967.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md)

## 10. Gaps and dependencies

- **Teams exist only in the CLI.** Affects: Web, Mobile, Desktop, VS Code, Chrome users.. Evidence: No teammate code outside apps/cli/src; web collaboration endpoint is retired (apps/web/app/api/agents/collaboration/route.ts:20-27). Work needed: Decide whether other apps need teams and on which route.
- **Team state is not persisted and task dependencies are not enforced.** Affects: CLI users with long jobs.. Evidence: apps/cli/src/teams.rs:133-146, 518-560. Work needed: Persist or document; enforce dependencies.
- **Named teammate spend cap may be replaced by the pool value.** Affects: CLI users with capped named agents.. Evidence: apps/cli/src/teams.rs:716, 734. Work needed: Combine caps and add a test.
- **A2A peer registry relationship to teams is unclear.** Affects: CLI users of A2A.. Evidence: apps/cli/src/features/a2a/mod.rs (not read in depth). Work needed: Document or connect.
- **Brief S61.11 says no presence in the CLI, but /team shows working, idle and stopped for teammates.** Affects: Documentation.. Evidence: apps/cli/src/teams.rs:845-855. Work needed: Clarify that presence exists only for teammates of the current team.
- Not built on: Web, Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- file:apps/cli/src/teams.rs
- file:apps/cli/src/subagent.rs
- file:apps/cli/src/agent/chat.rs
- file:apps/cli/src/agents.rs
- file:apps/cli/src/subagent_audit.rs
- store:subagents.jsonl
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- F061-01
- F061-04

## Unknown

- Whether the /team command and the teammate thread are wired in the plain REPL as well as the TUI; only teams.rs and the TUI thread entry helper were read.
- What /api/agents/communication does; only its folder was listed.
- How the A2A peer feature relates to teams.
- Contents of the inline tests beyond their names, and whether any tests were run.
- The exact lines 1000-1180 of teams.rs for read_messages wait behaviour were only partly read.
