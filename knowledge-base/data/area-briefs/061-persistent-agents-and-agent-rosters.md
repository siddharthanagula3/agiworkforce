# Area 61. Persistent agents and agent rosters

24 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S61.01 Agent roster.
- Should: The user sees a roster of their persistent agents with each one listed by name.
- Status: web missing, desktop missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:3647; apps/cli/src/agents.rs:396; apps/cli/src/agents.rs:167

## S61.02 Create persistent agent.
- Should: The user can create a new persistent agent that is saved and appears in the roster.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:3647; apps/cli/src/agents.rs:421; apps/cli/src/agents.rs:617

## S61.03 Agent name and avatar.
- Should: Each agent has a user-set name and avatar shown wherever it appears.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agents.rs:19; apps/cli/src/agents.rs:592; apps/cli/src/tui/widgets/agent_picker.rs:288; apps/cli/src/tui/tui_app.rs:5775; apps/cli/src/tui/terminal_palette.rs:276

## S61.04 Role description.
- Should: Each agent carries a role description the user can write and read back.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agents.rs:502; apps/cli/src/agents.rs:21

## S61.05 Agent-specific instructions.
- Should: Each agent has its own instructions that shape its behaviour when used.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:2947; apps/cli/src/agents.rs:55

## S61.06 Agent-specific Memory.
- Should: Each agent keeps its own memory separate from other agents.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S61.07 Agent-specific routines.
- Should: An agent can own routines that run as that agent.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S61.08 Shared account-level tools.
- Should: Agents share the account-level tools and connectors, with per-agent limits.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:2947; apps/cli/src/agents.rs:55

## S61.09 Shared account-level Skills.
- Should: Agents can use the account-level Skills, and the user can see which ones.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agents.rs:66; apps/cli/src/agents.rs:605; apps/cli/src/agents.rs:990; apps/cli/src/agents.rs:1164

## S61.10 Agent workspace/computer.
- Should: Each agent has its own persistent workspace or computer where its files live.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S61.11 Presence/activity indicator.
- Should: The roster shows whether each agent is currently working, idle or offline.
- Status: web missing, desktop missing, cli missing, vscode missing, chrome missing

## S61.12 Active responsibility list.
- Should: Each agent shows the list of responsibilities it currently owns.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S61.13 Agent conversation.
- Should: The user can open a conversation with a specific agent that answers as that agent.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:2947; apps/cli/src/agents.rs:55; apps/cli/src/lib.rs:421

## S61.14 Agent group conversation.
- Should: Several agents can take part in one conversation with the user.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/teams.rs:286; apps/cli/src/teams.rs:583; apps/cli/src/agent/chat.rs:1331; apps/cli/src/teams.rs:690

## S61.15 Chief-of-staff/coordinator pattern.
- Should: A coordinator agent routes work to other agents and reports back to the user.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agent/chat.rs:1331; apps/cli/src/teams.rs:270; apps/cli/src/agent/chat.rs:842

## S61.16 Specialist-agent delegation.
- Should: An agent can delegate part of a task to a specialist agent and use its result.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agent/chat.rs:1868; apps/cli/src/tui/tui_app.rs:3647

## S61.17 Inter-agent messages.
- Should: Agents can send each other messages that the receiving agent acts on, visible to the user.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/teams.rs:525; apps/cli/src/teams.rs:583; apps/cli/src/teams.rs:969

## S61.18 Human escalation.
- Should: An agent can escalate a decision to the user and wait for the answer.
- Status: web missing, desktop missing, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/lib/services/agent-notification-service.ts:94; apps/mobile/app/(app)/tasks.tsx:8; apps/cli/src/teams.rs:526; apps/cli/src/teams.rs:565; apps/cli/src/subagent.rs:725; apps/cli/src/agent/chat.rs:2245

## S61.19 Agent pause/disable.
- Should: The user can pause or disable an agent so it stops acting until re-enabled.
- Status: web missing, desktop missing, cli missing, vscode missing, chrome missing

## S61.20 Resource-budget controls.
- Should: The user can set resource limits (turns, spend) per agent and they are enforced.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agents.rs:56; apps/cli/src/agents.rs:1169; apps/cli/src/agents.rs:873; apps/cli/src/agents.rs:598

## S61.21 Agent configuration versioning.
- Should: Changes to an agent's configuration are versioned and can be reviewed or restored.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S61.22 Agent activity history.
- Should: The user can review the history of what each agent did.
- Status: web missing, desktop missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agents.rs:485; apps/cli/src/agents.rs:1007; apps/cli/src/subagent_audit.rs:98; apps/cli/src/subagent.rs:438

## S61.23 Agent duplication.
- Should: The user can duplicate an agent as the starting point for a new one.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S61.24 Agent retirement and ownership transfer.
- Should: The user can retire an agent or transfer its ownership, keeping its history.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
