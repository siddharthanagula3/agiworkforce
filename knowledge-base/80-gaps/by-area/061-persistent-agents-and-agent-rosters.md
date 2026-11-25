---
id: "GAPS-AREA-061"
type: "gap-list"
title: "Gaps: Persistent agents and agent rosters"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 61. Persistent agents and agent rosters

76 open gaps that touch this area. Area page: [20-features/061-persistent-agents-and-agent-rosters](../../20-features/061-persistent-agents-and-agent-rosters/README.md).

## CMP-D37

**Proactive read-only research before you ask**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md), [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: The assistant only works when asked or on a schedule; it does not look things up on its own.
- Evidence: searched: proactive in apps/web/features/schedules, apps/web/features/chat

## CMP-M60

**Always-on proactive agent that texts or calls you (Duet)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md), [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: No always-on agent, morning brief or proactive updates in the app.
- Evidence: searched: duet, morning brief, proactive in app, src, lib

## CMP-M69

**Dot rules: custom rules, pause and delete**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md), [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: There is no dot, so no per-action rules, pause or delete.
- Evidence: searched: dot, custom rules in app, src

## CMP-M71

**dots: always-on personal agent with its own cloud computer ("Your dot")**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md), [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: No always-on personal agent or rules for acting without asking; AGI Work runs only start when the user starts them.
- Evidence: searched: dot, always-on, proactive in apps/mobile/src, apps/mobile/app

## CMP-MP51

**Scheduled task caps by plan**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Free users cannot schedule at all Caps come from the plan catalog: Free 0, Basic 3, Pro 5, Max 25, Team 10. Free users cannot schedule at all.
- Evidence: packages/contracts/types/src/billing-catalog.ts:617; :644; :663; :683; apps/mobile/app/(app)/schedules/index.tsx:62

## CMP-W139

**Always-on proactive agent (Duet, dots)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md), [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: No always-on agent; scheduled tasks and event triggers are the closest.
- Evidence: searched: Duet, dots, always-on in apps/web features, app

## CMP-W143

**Admin permissions to browse, build, share and publish agents**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Workspace controls have no switch for building, sharing or publishing agents; only a fixed list of features.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:38-52 (no agents entry)

## CMP-W154

**Daily brief from a proactive agent**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md), [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: No daily brief; a scheduled task can be set up by hand.
- Evidence: searched: daily brief in apps/web features, lib

## CMP-W155

**Dot rules: act without asking, act if pre-approved, ask first, hand off**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md), [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: No per-agent autonomy rules beyond account approval modes.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:54

## CMP-W156

**Duplicate an agent as a draft copy**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: An agent can be exported, imported, transferred or deleted, but there is no duplicate action.
- Evidence: searched: duplicate in apps/web/features/agents; app/api/custom-agents has import and export only

## CMP-W163

**Run an agent from any chat by typing @ and its name**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: An agent opens in its own chat from the Agents page; typing @ in the composer only offers skills.
- Evidence: packages/ui/unified-chat/src/components/SkillMentionPicker.tsx (no agent entries); searched: agentMention

## CMP-WP119

**Active scheduled task limit by plan**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Limits are Free 0 (paid only), Basic 3, Pro 5, Max 15, Max 15x 25, Team 10 Limits are Free 0 (paid only), Basic 3, Pro 5, Max 15, Max 15x 25, Team 10.
- Evidence: packages/contracts/types/src/billing-catalog.ts:593; packages/contracts/types/src/billing-catalog.ts:683

## CMP-WP128

**Agents page with Recently used, Built by me and a team directory**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: The Agents page lists your agents and agents shared with you, with no recently used list or workspace-wide directory The Agents page lists your agents and agents shared with you, with no recently used list or workspace-wide directory.
- Evidence: apps/web/features/agents/components/AgentsPage.tsx:220-226

## CMP-WP129

**Builder limits which actions an agent may take in each connected app**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Not which actions in each app An agent picks which connected apps it can use, but not which actions in each app; only websites have allow and block lists.
- Evidence: apps/web/features/agents/components/AgentConfigForm.tsx:104-135,273-284

## CMP-WP137

**Several tasks at once, and starting tasks from a phone**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Concurrent chat turns are capped by plan: 1 on Free, 3 on Pro, 5 on Max, 10 on Max 15x Concurrent chat turns are capped by plan: 1 on Free, 3 on Pro, 5 on Max, 10 on Max 15x.
- Evidence: packages/contracts/types/src/billing-catalog.ts:622; packages/contracts/types/src/billing-catalog.ts:678

## CMP-WP139

**Start an agent from an API call with an access token**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: An outside system can start an agent run: a trigger must belong to a scheduled task (apps/web/lib/triggers/trigger-serv… An outside system can start an agent run: a trigger must belong to a scheduled task (apps/web/lib/triggers/trigger-service.ts:198-199), a task can be bound to an agent (apps/web/lib/services/schedule-service.ts:705,843), and the trigger gets a signing secret and its own endpoint that accepts any cal
- Evidence: searched: accessToken, apiTrigger in apps/web/app/api/custom-agents and apps/web/app/api/v1

## GAP-AREA061-LW02

**/agents delete permanently removes the file. The repo rules say removed files go to Trash first.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-061
- Detail: Area 61. Persistent agents and agent rosters
- Evidence: apps/cli/src/agents.rs:1159

## GAP-AREA061-LW03

**The empty-state text and file header say global agents are in ~/.agiworkforce/agents, but discovery reads the CLI config folder's agents directory (which can be moved by AGIWORKFORCE_HOME) and ~/.claude/agents. They may differ.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-061
- Detail: Area 61. Persistent agents and agent rosters
- Evidence: apps/cli/src/agents.rs:3, apps/cli/src/agents.rs:812, apps/cli/src/agents.rs:258

## GAP-AREA061-LW04

**spawn_teammate's own doc comment says it only registers the teammate and that a multi-process version is a future step. The launch function does start a real thread, so the comment is stale.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-061
- Detail: Area 61. Persistent agents and agent rosters
- Evidence: apps/cli/src/teams.rs:296

## GAP-AREA061-LW05

**S61.03 asks for an avatar. The CLI only has a colour on the name, and it is not shown in the chat.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-061
- Detail: Area 61. Persistent agents and agent rosters
- Evidence: apps/cli/src/agents.rs:17, apps/cli/src/tui/widgets/agent_picker.rs:288

## GAP-AREA061-LW08

**Unknown skills named by an agent are silently skipped when it runs. Only /agents validate warns.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-061
- Detail: Area 61. Persistent agents and agent rosters
- Evidence: apps/cli/src/agents.rs:66

## GAP-CAP-agent-actions-08

**Always-on personal agent: No persistent agent, roster, presence, daily brief or per-agent rules. Roster items S61.* are done only in the CLI.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md), [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Requirement items: S61.01, S61.07, S61.11, S61.12
- Detail: Claude partly, ChatGPT yes; AGI not built

## GAP-CAP-agent-actions-09

**Custom and workspace agents: No @ mention to run an agent in any chat, no duplicate, no per-action limits in each connector, no admin switch for who may build or publish.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Requirement items: S61.02, S61.04, S61.05, S63.09
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-28

**Usage accounting and limits for agent runs: No spend or time budget for tasks on Web, Desktop or Mobile; held runs do not resume after an allowance reset; Billing showed no renewal info when a limit error pointed to it.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Requirement items: S60.10, S61.20, S63.31, S63.34
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F061-01-01

**Brief says web, desktop and mobile have no roster; code has one on web and mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md)
- Detail: Affects: Documentation accuracy for all six apps.. Work needed: Correct the brief statuses; verify the pages in a running build.
- Evidence: apps/web/app/chat/agents/page.tsx; apps/mobile/app/(app)/agents/index.tsx; brief S61.01

## GAP-F061-01-02

**No roster in the Chrome extension or VS Code extension.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md)
- Detail: Affects: Chrome and VS Code users.. Work needed: Design and build a Cloud-agent list on both surfaces.
- Evidence: grep of apps/extension/src and apps/extension-vscode/src found no agent list

## GAP-F061-01-03

**CLI and Cloud agents are separate lists with no shared view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md)
- Detail: Affects: People who use both CLI and web.. Work needed: Decide whether CLI should read Cloud agents; keep trust boundaries (AGENTS.md section 6).
- Evidence: apps/cli/src/agents.rs (files only); apps/web/lib/services/custom-agent-service.ts (database only)

## GAP-F061-01-04

**No presence indicator for saved agents (S61.11).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md)
- Detail: Affects: All apps.. Work needed: Define presence from running chats, routines or runs.
- Evidence: brief S61.11; no presence field in AgentDefinition or ManagedCloudAgentSchema

## GAP-F061-01-05

**Selected CLI row hides the agent colour; no picture avatar in CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md)
- Detail: Affects: CLI users.. Work needed: Keep the colour marker on the selected row.
- Evidence: apps/cli/src/tui/widgets/agent_picker.rs:268-283

## GAP-F061-01-NOTBUILT

**Agent roster and identity: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md)
- Requirement items: S61.01, S61.03, S61.04
- Detail: VS Code: S61.01, S61.03, S61.04; Chrome: S61.01, S61.03, S61.04

## GAP-F061-02-01

**No duplicate action for a person's own agent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)
- Detail: Affects: CLI, web, mobile, desktop users.. Work needed: Add duplicate for CLI files and Cloud rows.
- Evidence: No match in apps/web/features/agents, apps/mobile/src/features/agents or apps/cli/src/agents.rs for duplicate or clone

## GAP-F061-02-02

**CLI delete bypasses the Trash.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)
- Detail: Affects: CLI users.. Work needed: Move to the OS Trash through the shared helper before removal.
- Evidence: apps/cli/src/agents.rs:1159; AGENTS.md section 9

## GAP-F061-02-03

**CLI agents have no versioning, retirement or transfer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)
- Detail: Affects: CLI users.. Work needed: Decide whether git history is enough or add archive and restore.
- Evidence: brief S61.21, S61.24; no such subcommand in MANAGEMENT_SUBCOMMANDS (apps/cli/src/agents.rs:564-568)

## GAP-F061-02-04

**--agent-id is accepted but unused.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)
- Detail: Affects: CLI scripts that pass it.. Work needed: Connect it to a thread binding or remove it.
- Evidence: apps/cli/src/lib.rs:429-430; no reader in apps/cli/src

## GAP-F061-02-05

**Brief marks web, desktop, mobile management as missing; code has it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)
- Detail: Affects: Documentation.. Work needed: Update brief; verify in running apps.
- Evidence: apps/web/lib/services/custom-agent-service.ts; apps/mobile/src/features/agents/service.ts

## GAP-F061-02-06

**No management in Chrome or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)
- Detail: Affects: Those users.. Work needed: Decide scope.
- Evidence: No agent management code found in apps/extension/src or apps/extension-vscode/src

## GAP-F061-02-NOTBUILT

**Create and manage agents: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)
- Requirement items: S61.02, S61.21, S61.23, S61.24
- Detail: CLI: S61.21, S61.23, S61.24; VS Code: S61.02, S61.21, S61.23, S61.24; Chrome: S61.02, S61.21, S61.23, S61.24

## GAP-F061-03-01

**CLI has one switched session, no separate per-agent thread; --agent-id does nothing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md)
- Detail: Affects: CLI users.. Work needed: Bind a thread per agent or drop the flag.
- Evidence: apps/cli/src/agents.rs:88-96; apps/cli/src/lib.rs:429-430

## GAP-F061-03-02

**A previously activated agent's system message stays when another is activated.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md)
- Detail: Affects: CLI users who switch agents mid-session.. Work needed: Replace or label the prior agent message.
- Evidence: apps/cli/src/agents.rs:98-146 (messages are only pushed)

## GAP-F061-03-03

**No agent chat in Chrome, VS Code or the Tauri desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md)
- Detail: Affects: Those users.. Work needed: Decide per surface.
- Evidence: No code found

## GAP-F061-03-04

**Brief marks web and mobile conversation as missing; code has it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md)
- Detail: Affects: Documentation.. Work needed: Update brief; verify in a running app.
- Evidence: apps/web/app/api/custom-agents/[id]/conversations/route.ts

## GAP-F061-03-NOTBUILT

**Agent instructions and agent conversation: not built on Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, VS Code, Chrome
- Features: [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md)
- Requirement items: S61.05, S61.13
- Detail: Desktop: S61.05, S61.13; VS Code: S61.05, S61.13; Chrome: S61.05, S61.13

## GAP-F061-04-01

**MCP server list replaces rather than narrows in the CLI session path and cannot be set with /agents set.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md)
- Detail: Affects: CLI users with MCP servers.. Work needed: Intersect with the session list; add the field.
- Evidence: apps/cli/src/agents.rs:123-127, 1116-1127

## GAP-F061-04-02

**Skill misses are silent at run time.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md)
- Detail: Affects: CLI users.. Work needed: Warn at activation.
- Evidence: apps/cli/src/agents.rs:67-85

## GAP-F061-04-03

**A teammate's own spend cap may be overwritten by the team pool.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md)
- Detail: Affects: CLI teams using named agents with caps.. Work needed: Take the lower of the agent cap and the pool share; add a test.
- Evidence: apps/cli/src/teams.rs:716, 734

## GAP-F061-04-04

**No controls in Chrome, VS Code or Tauri desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md)
- Detail: Affects: Those users.. Work needed: Decide scope.
- Evidence: No code found

## GAP-F061-04-05

**Brief says only the CLI has limits; web and mobile have them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md)
- Detail: Affects: Documentation.. Work needed: Update brief.
- Evidence: packages/contracts/cloud-contracts/src/agents.ts:94-108

## GAP-F061-04-NOTBUILT

**Shared tools, skills and per-agent limits: not built on Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, VS Code, Chrome
- Features: [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md)
- Requirement items: S61.08, S61.09, S61.20
- Detail: Desktop: S61.08, S61.09, S61.20; VS Code: S61.08, S61.09, S61.20; Chrome: S61.08, S61.09, S61.20

## GAP-F061-05-01

**No per-agent memory.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md)
- Detail: Affects: All apps.. Work needed: Design memory keyed by agent and boundary.
- Evidence: S61.06; no agent-scoped memory table or code found

## GAP-F061-05-02

**No private workspace or computer per agent; only text reference files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md)
- Detail: Affects: All apps.. Work needed: Define sandbox storage and file tools.
- Evidence: custom-agent-service.ts:767-800 (text content column)

## GAP-F061-05-03

**No responsibility list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md)
- Detail: Affects: Web and mobile.. Work needed: Define what an agent owns and show it.
- Evidence: S61.12; activity only lists chats and routines

## GAP-F061-05-04

**No CLI routines tied to an agent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md)
- Detail: Affects: CLI users.. Work needed: Bind cron entries to an agent name.
- Evidence: apps/cli/src/features/exec/tools/mod.rs cron tools carry no agent field

## GAP-F061-05-05

**Brief says routines and files are missing; web and mobile have them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md)
- Detail: Affects: Documentation.. Work needed: Update brief.
- Evidence: apps/web/lib/services/scheduled-agent-executor.ts:918

## GAP-F061-05-NOTBUILT

**Agent memory, workspace, routines and responsibilities: not built on Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, CLI, VS Code, Chrome
- Features: [F061-05](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md)
- Requirement items: S61.06, S61.07, S61.10, S61.12
- Detail: Desktop: S61.06, S61.07, S61.10, S61.12; CLI: S61.06, S61.07, S61.10, S61.12; VS Code: S61.06, S61.07, S61.10, S61.12; Chrome: S61.06, S61.07, S61.10, S61.12

## GAP-F061-06-01

**Teams exist only in the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-06](../../20-features/061-persistent-agents-and-agent-rosters/F061-06-agent-teams-delegation-and-coordinator.md)
- Detail: Affects: Web, Mobile, Desktop, VS Code, Chrome users.. Work needed: Decide whether other apps need teams and on which route.
- Evidence: No teammate code outside apps/cli/src; web collaboration endpoint is retired (apps/web/app/api/agents/collaboration/route.ts:20-27)

## GAP-F061-06-02

**Team state is not persisted and task dependencies are not enforced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-06](../../20-features/061-persistent-agents-and-agent-rosters/F061-06-agent-teams-delegation-and-coordinator.md)
- Detail: Affects: CLI users with long jobs.. Work needed: Persist or document; enforce dependencies.
- Evidence: apps/cli/src/teams.rs:133-146, 518-560

## GAP-F061-06-03

**Named teammate spend cap may be replaced by the pool value.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-06](../../20-features/061-persistent-agents-and-agent-rosters/F061-06-agent-teams-delegation-and-coordinator.md)
- Detail: Affects: CLI users with capped named agents.. Work needed: Combine caps and add a test.
- Evidence: apps/cli/src/teams.rs:716, 734

## GAP-F061-06-04

**A2A peer registry relationship to teams is unclear.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-06](../../20-features/061-persistent-agents-and-agent-rosters/F061-06-agent-teams-delegation-and-coordinator.md)
- Detail: Affects: CLI users of A2A.. Work needed: Document or connect.
- Evidence: apps/cli/src/features/a2a/mod.rs (not read in depth)

## GAP-F061-06-05

**Brief S61.11 says no presence in the CLI, but /team shows working, idle and stopped for teammates.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-06](../../20-features/061-persistent-agents-and-agent-rosters/F061-06-agent-teams-delegation-and-coordinator.md)
- Detail: Affects: Documentation.. Work needed: Clarify that presence exists only for teammates of the current team.
- Evidence: apps/cli/src/teams.rs:845-855

## GAP-F061-06-NOTBUILT

**Agent teams, delegation and coordinator: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F061-06](../../20-features/061-persistent-agents-and-agent-rosters/F061-06-agent-teams-delegation-and-coordinator.md)
- Requirement items: S61.14, S61.15, S61.16, S61.17
- Detail: Web: S61.14, S61.15, S61.16, S61.17; Desktop: S61.14, S61.15, S61.16, S61.17; Mobile: S61.14, S61.15, S61.16, S61.17; VS Code: S61.14, S61.15, S61.16, S61.17; Chrome: S61.14, S61.15, S61.16, S61.17

## GAP-F061-07-01

**No presence indicator for saved agents**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: Affects: All users on Web, Desktop, CLI, VS Code, Chrome. Work needed: Define a persisted run-state model per agent and render it in each roster.
- Evidence: brief S61.11 statuses; apps/cli/src/agents.rs has no status field in help text (line 866)

## GAP-F061-07-02

**No pause or disable for saved agents**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: Affects: All users on all apps. Work needed: Add an enabled flag, enforce at run start, add controls and confirm copy.
- Evidence: brief S61.19

## GAP-F061-07-03

**No Offline state and no resume after stop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: Affects: CLI team users. Work needed: Extend the status model and add resume.
- Evidence: apps/cli/src/teams.rs:24-26,465

## GAP-F061-07-04

**Teammate status not persisted or synced**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Detail: Affects: CLI team users. Work needed: Decide whether live status needs to outlive the session.
- Evidence: apps/cli/src/teams.rs:141

## GAP-F061-07-NOTBUILT

**Presence indicator and pause or disable: not built on Web, Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code, Chrome
- Features: [F061-07](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Requirement items: S61.11, S61.19
- Detail: Web: S61.11, S61.19; Desktop: S61.11, S61.19; VS Code: S61.11, S61.19; Chrome: S61.11, S61.19

## GAP-F061-08-01

**No escalation for persistent agents on Web, Desktop, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-08](../../20-features/061-persistent-agents-and-agent-rosters/F061-08-escalation-to-the-user.md)
- Detail: Affects: Users of those apps. Work needed: Wire approval surfaces and alerts per app.
- Evidence: brief S61.18 statuses

## GAP-F061-08-02

**Brief says Web missing but server alert code exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-08](../../20-features/061-persistent-agents-and-agent-rosters/F061-08-escalation-to-the-user.md)
- Detail: Affects: Web users; documentation accuracy. Work needed: Check the web approval UI and correct the brief or add it.
- Evidence: apps/web/lib/services/agent-notification-service.ts

## GAP-F061-08-03

**Feed tap on an approval item may open the companion screen, not Tasks**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-08](../../20-features/061-persistent-agents-and-agent-rosters/F061-08-escalation-to-the-user.md)
- Detail: Affects: Mobile users. Work needed: Verify on a device which path real alerts take.
- Evidence: apps/mobile/app/(app)/notifications/index.tsx:296-298

## GAP-F061-08-04

**Cloud escalation is for cloud runs, not tied to a named persistent agent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-08](../../20-features/061-persistent-agents-and-agent-rosters/F061-08-escalation-to-the-user.md)
- Detail: Affects: Everyone. Work needed: Add agent identity to the notice.
- Evidence: notifier takes runId, not an agent name (agent-notification-service.ts AgentRunNotice)

## GAP-F061-08-NOTBUILT

**Escalation to the user: not built on Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, VS Code, Chrome
- Features: [F061-08](../../20-features/061-persistent-agents-and-agent-rosters/F061-08-escalation-to-the-user.md)
- Requirement items: S61.18
- Detail: Desktop: S61.18; VS Code: S61.18; Chrome: S61.18

## GAP-F061-09-01

**No history on other apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-09](../../20-features/061-persistent-agents-and-agent-rosters/F061-09-agent-activity-history.md)
- Detail: Affects: Web, Desktop, VS Code, Chrome users. Work needed: Design a synced run record and a history view per app.
- Evidence: brief S61.22

## GAP-F061-09-02

**Teammate files changed always 0**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-09](../../20-features/061-persistent-agents-and-agent-rosters/F061-09-agent-activity-history.md)
- Detail: Affects: CLI team users reading history. Work needed: Count files modified per teammate turn.
- Evidence: apps/cli/src/teams.rs:783

## GAP-F061-09-03

**No test of the history output or filter**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-09](../../20-features/061-persistent-agents-and-agent-rosters/F061-09-agent-activity-history.md)
- Detail: Affects: Maintainers. Work needed: Add tests with a temp config directory.
- Evidence: grep of apps/cli found no test calling recent_agent_runs or format_agent_history

## GAP-F061-09-04

**No retention, size limit or delete for the log**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-09](../../20-features/061-persistent-agents-and-agent-rosters/F061-09-agent-activity-history.md)
- Detail: Affects: Heavy CLI users. Work needed: Decide retention and add rotation.
- Evidence: apps/cli/src/subagent_audit.rs:98-120

## GAP-F061-09-05

**History is per device, not per account**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F061-09](../../20-features/061-persistent-agents-and-agent-rosters/F061-09-agent-activity-history.md)
- Detail: Affects: Users with several machines. Work needed: Decide on sync.
- Evidence: local file path (subagent_audit.rs:130)

## GAP-F061-09-NOTBUILT

**Agent activity history: not built on Web, Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code, Chrome
- Features: [F061-09](../../20-features/061-persistent-agents-and-agent-rosters/F061-09-agent-activity-history.md)
- Requirement items: S61.22
- Detail: Web: S61.22; Desktop: S61.22; VS Code: S61.22; Chrome: S61.22
