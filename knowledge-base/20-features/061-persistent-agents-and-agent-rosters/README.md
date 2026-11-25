---
id: "AREA-061"
type: "area"
title: "Persistent agents and agent rosters"
features: ["F061-01", "F061-02", "F061-03", "F061-04", "F061-05", "F061-06", "F061-07", "F061-08", "F061-09"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 61. Persistent agents and agent rosters

A person can keep a set of named helper agents, each with its own role, instructions, tool limits and spend cap, and call on them again and again. They can also run several agents together as a team that talk to each other and report back. Today this exists only in the command-line app (CLI). The other apps have no roster, and the Mobile app only receives alerts when a cloud agent run needs the user.

**Who uses it.** Developers who use the CLI (terminal app). The code in the files I opened has no plan gate on agent definitions. Teams are off unless the user starts the CLI with --team or sets AGI_TEAM=1. The approval and question alerts on web and Mobile belong to cloud agent runs started by a signed-in user.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F061-01](F061-01-agent-roster-and-identity.md) | Agent roster and identity | built | built | built | built | no | no |
| [F061-02](F061-02-create-and-manage-agents.md) | Create and manage agents | built | partly | built | partly | no | no |
| [F061-03](F061-03-agent-instructions-and-agent-conversation.md) | Agent instructions and agent conversation | built | no | built | built | no | no |
| [F061-04](F061-04-shared-tools-skills-and-per-agent-limits.md) | Shared tools, skills and per-agent limits | built | no | built | built | no | no |
| [F061-05](F061-05-agent-memory-workspace-routines-and-responsibiliti.md) | Agent memory, workspace, routines and responsibilities | partly | no | partly | no | no | no |
| [F061-06](F061-06-agent-teams-delegation-and-coordinator.md) | Agent teams, delegation and coordinator | no | no | no | built | no | no |
| [F061-07](F061-07-presence-indicator-and-pause-or-disable.md) | Presence indicator and pause or disable | no | no | n/a | partly | no | no |
| [F061-08](F061-08-escalation-to-the-user.md) | Escalation to the user | partly | no | built | built | no | no |
| [F061-09](F061-09-agent-activity-history.md) | Agent activity history | no | no | n/a | built | no | no |

Requirement items for this area: [10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md).

## How this area works in the code

1. **Agent files on disk.** An agent is a markdown file with frontmatter. Fields are name, description, model, tools, disallowed tools, max turns, permission mode, colour, skills, spend cap and MCP servers. The body is the system prompt. (`apps/cli/src/agents.rs:16`, `apps/cli/src/agents.rs:20`, `apps/cli/src/agents.rs:395`)
2. **Finding agents.** discover_agents reads the user folders (the CLI config folder's agents directory and ~/.claude/agents), then the current project's agents if the project is trusted, then plugin agents. Project and user agents are merged. (`apps/cli/src/agents.rs:258`, `apps/cli/src/agents.rs:276`)
3. **The /agents command.** /agents with no argument opens the picker. Subcommands (list, show, path, create, validate, history, delete, rename, set) are handled by render_agents_command. (`apps/cli/src/agents.rs:467`, `apps/cli/src/agents.rs:481`, `apps/cli/src/tui/widgets/agent_picker.rs:1`, `apps/cli/src/tui/tui_app.rs:4997`)
4. **Create, edit, delete.** Create writes a template file. Set, rename and delete rewrite or remove the file after checks. The model can also draft an agent from a description. (`apps/cli/src/agents.rs:1054`, `apps/cli/src/agents.rs:1076`, `apps/cli/src/agents.rs:1188`, `apps/cli/src/agents.rs:1147`, `apps/cli/src/agents.rs:811`)
5. **Activating an agent.** Picking a row reloads the definition from that exact file, then applies it to the live session: model, tools, MCP servers, turns, permission mode (never looser), spend cap, system prompt and skills. (`apps/cli/src/tui/tui_app.rs:5003`, `apps/cli/src/agents.rs:98`, `apps/cli/src/agents.rs:132`, `apps/cli/src/agents.rs:55`)
6. **Delegating to a specialist.** The model's agent tool lists agents (a trimmed catalog) or runs one. A run is handled by the subagent manager, which applies the named agent with the narrower-only rules and runs it on its own thread. (`apps/cli/src/features/exec/tools/mod.rs:1151`, `apps/cli/src/agents.rs:500`, `apps/cli/src/agents.rs:177`, `apps/cli/src/subagent.rs:674`, `apps/cli/src/agent/chat.rs:2765`)
7. **Teams.** Team mode is read from --team or AGI_TEAM. spawn_teammate checks the lead, the names and the spend cap, then TeamManager.launch registers the teammate, starts its thread, and shares the spend pool. (`apps/cli/src/lib.rs:8291`, `apps/cli/src/agent/chat.rs:1866`, `apps/cli/src/teams.rs:411`, `apps/cli/src/teams.rs:687`)
8. **Messages and approvals between agents.** send_message checks that both sides are on the team and that the target has not stopped, then puts the message in the mailbox and the shared transcript. A teammate's tool approvals go to the user's approval sink with the teammate's name added. (`apps/cli/src/teams.rs:326`, `apps/cli/src/teams.rs:608`, `apps/cli/src/teams.rs:669`, `apps/cli/src/teams.rs:711`)
9. **History.** Each finished subagent run is appended to subagents.jsonl in the config folder. /agents history reads it back newest first. (`apps/cli/src/subagent.rs:725`, `apps/cli/src/subagent_audit.rs:98`, `apps/cli/src/subagent_audit.rs:120`, `apps/cli/src/agents.rs:1349`)
10. **Escalation to a phone.** For cloud agent runs, the web server records a feed notification and sends a push (Expo and web). The phone opens the Tasks route, which opens the run. (`apps/web/lib/services/agent-notification-service.ts:94`, `apps/web/lib/services/agent-notification-service.ts:133`, `apps/mobile/app/(app)/tasks.tsx:8`)

## Files to know

| File | Role |
|---|---|
| `apps/cli/src/agents.rs` | Agent file format, discovery, applying an agent to a session, and every /agents subcommand. |
| `apps/cli/src/teams.rs` | Team manager: teammates, mailboxes, shared tasks, spend pool, teammate threads and the team tools. |
| `apps/cli/src/subagent.rs` | Runs one-off subagents (including named agents) on their own thread and records the audit entry. |
| `apps/cli/src/subagent_audit.rs` | Writes and reads the subagent run log used by /agents history. |
| `apps/cli/src/tui/widgets/agent_picker.rs` | The /agents picker overlay: filter, list, empty states, colour. |
| `apps/cli/src/tui/tui_app.rs` | Handles picker keys and activates the chosen agent in the session. |
| `apps/cli/src/agent/chat.rs` | The chat loop: spawn_teammate tool and classification of task and named-agent calls. |
| `apps/cli/src/features/exec/tools/mod.rs` | Runs the agent tool (list action) and routes run to the orchestrator. |
| `apps/cli/src/lib.rs` | Command line flags --agent, --agent-id, --team and the AGI_TEAM check. |
| `apps/web/lib/services/agent-notification-service.ts` | Turns agent run events into feed notifications and push alerts. |
| `apps/mobile/app/(app)/tasks.tsx` | Mobile route that opens the cloud run an alert points to. |

## What is stored

- Agent definitions (one markdown file per agent): Project folder .agiworkforce/agents (shown in the empty-state text), the CLI config folder's agents directory, and ~/.claude/agents; plugins can add more (apps/cli/src/agents.rs:258)
- Run history of named subagents (time, agent, outcome, files changed, usage, prompt length only): subagents.jsonl in the CLI config folder (apps/cli/src/subagent_audit.rs:120)
- Team state: teammates, mailboxes, shared tasks, transcript (last 200 messages) and spend: In memory only, inside TeamManager, lost when the CLI session ends (apps/cli/src/teams.rs:133, apps/cli/src/teams.rs:13)
- Agent run alerts: Notification feed rows written through recordNotification on the web database (apps/web/lib/services/agent-notification-service.ts:133)
- Mobile push preference mobilePushAgentActivity: Read by loadAgentPushPreference in apps/web/lib/services/agent-notification-service.ts:20 (storage table not opened)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **--team flag / AGI_TEAM=1 or true**: Turns on agent teams (teammates, messaging, shared tasks). Off by default. (apps/cli/src/lib.rs:8291, apps/cli/src/lib.rs:341)
- **--agent <name>, --agent-id <id>**: Start with a named agent, or bind to an agent thread id. (apps/cli/src/lib.rs:424)
- **Project trust**: Project agent files load only when the folder's trust allows repository config. (apps/cli/src/agents.rs:270)
- **mobilePushAgentActivity preference**: Only an explicit false silences phone alerts for agent runs. (apps/web/lib/services/agent-notification-service.ts:20)
- **Cloud mode and Cloud unlocked (Mobile)**: The Tasks route opens a run only when both are true. (apps/mobile/app/(app)/tasks.tsx:9)
- **Agent file fields (maxTurns, maxBudgetUsd, tools, permissionMode...)**: Per-agent limits. (apps/cli/src/agents.rs:22)

## Shared between apps

Nothing is shared across apps for agents. All agent, team and history code is in the CLI's Rust code under apps/cli/src. The only cross-app piece is the run-alert path, where web server code sends the alert and the Mobile Tasks route receives it (the Mobile screen code itself, CloudTasksScreen, was not opened). No shared agent type exists in packages that I saw.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Many line numbers in the brief no longer match the code. For example apps/cli/src/tui/tui_app.rs:3647 is status-bar layout code, not roster code, and apps/cli/src/tui/terminal_palette.rs:276 is a syntax colour palette. apps/cli/src/lib.rs:421 is just the --agent flag. apps/cli/src/agent/chat.rs:1331 and :842 are unrelated to teams or coordinator work. (knowledge-base/data/area-briefs/061-persistent-agents-and-agent-rosters.md, S61.01, S61.03, S61.13, S61.15)
- /agents delete permanently removes the file. The repo rules say removed files go to Trash first. (apps/cli/src/agents.rs:1159)
- The empty-state text and file header say global agents are in ~/.agiworkforce/agents, but discovery reads the CLI config folder's agents directory (which can be moved by AGIWORKFORCE_HOME) and ~/.claude/agents. They may differ. (apps/cli/src/agents.rs:3, apps/cli/src/agents.rs:812, apps/cli/src/agents.rs:258)
- spawn_teammate's own doc comment says it only registers the teammate and that a multi-process version is a future step. The launch function does start a real thread, so the comment is stale. (apps/cli/src/teams.rs:296)
- S61.03 asks for an avatar. The CLI only has a colour on the name, and it is not shown in the chat. (apps/cli/src/agents.rs:17, apps/cli/src/tui/widgets/agent_picker.rs:288)
- The brief marks S61.18 web as missing, yet web has the server code that raises the alert. No web screen answering an agent's question was found. (apps/web/lib/services/agent-notification-service.ts:94)
- Team status (Active, Idle, Completed) exists but is not shown on any roster, and the brief marks presence missing in the CLI. (apps/cli/src/teams.rs:23)
- Unknown skills named by an agent are silently skipped when it runs. Only /agents validate warns. (apps/cli/src/agents.rs:66)

## Not established

- Whether the web, Desktop, VS Code or Chrome apps have any agent screens. I only searched the CLI files the brief names and the web notification and Mobile Tasks files.
- How the CLI team 'user' or 'lead' answers an escalation in detail (the ask_user tool and the approval prompt UI). I saw the tool is wired in features/exec/tools/mod.rs but did not open the prompt code.
- Where the mobilePushAgentActivity preference is stored. I did not open loadAgentPushPreference.
- What the Mobile CloudTasksScreen shows for an approval or a question and how the user answers there.
- Whether any plan or tier limits the number of agents or teammates. I saw none in the files I opened.
- How S61.14 group conversation looks in the TUI beyond the thread_entry labels in the chat, and whether the user can message a single teammate directly (send_message allows the user as a name).
- Exact lines of the interactive prompt that drafts an agent with the model (AgentRequest parsing). I read only the draft parsing.
