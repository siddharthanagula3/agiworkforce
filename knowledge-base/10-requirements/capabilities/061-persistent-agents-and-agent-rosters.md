---
id: "REQ-AREA-061"
type: "requirements"
title: "Requirement items: Persistent agents and agent rosters"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 61. Persistent agents and agent rosters

24 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S61.01

**Agent roster.** The user sees a roster of their persistent agents with each one listed by name.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-01 Agent roster and identity](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md)
- Competitor trace: CAP-agent-actions-08

## S61.02

**Create persistent agent.** The user can create a new persistent agent that is saved and appears in the roster.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-02 Create and manage agents](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)
- Competitor trace: CAP-agent-actions-09

## S61.03

**Agent name and avatar.** Each agent has a user-set name and avatar shown wherever it appears.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-01 Agent roster and identity](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md)

## S61.04

**Role description.** Each agent carries a role description the user can write and read back.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-01 Agent roster and identity](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md)
- Competitor trace: CAP-agent-actions-09

## S61.05

**Agent-specific instructions.** Each agent has its own instructions that shape its behaviour when used.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-03 Agent instructions and agent conversation](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md)
- Competitor trace: CAP-agent-actions-09

## S61.06

**Agent-specific Memory.** Each agent keeps its own memory separate from other agents.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F061-05 Agent memory, workspace, routines and responsibilities](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md)

## S61.07

**Agent-specific routines.** An agent can own routines that run as that agent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F061-05 Agent memory, workspace, routines and responsibilities](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md)
- Competitor trace: CAP-agent-actions-08

## S61.08

**Shared account-level tools.** Agents share the account-level tools and connectors, with per-agent limits.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-04 Shared tools, skills and per-agent limits](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md)

## S61.09

**Shared account-level Skills.** Agents can use the account-level Skills, and the user can see which ones.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-04 Shared tools, skills and per-agent limits](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md)

## S61.10

**Agent workspace/computer.** Each agent has its own persistent workspace or computer where its files live.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F061-05 Agent memory, workspace, routines and responsibilities](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md)

## S61.11

**Presence/activity indicator.** The roster shows whether each agent is currently working, idle or offline.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F061-07 Presence indicator and pause or disable](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)
- Competitor trace: CAP-agent-actions-08

## S61.12

**Active responsibility list.** Each agent shows the list of responsibilities it currently owns.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F061-05 Agent memory, workspace, routines and responsibilities](../../20-features/061-persistent-agents-and-agent-rosters/F061-05-agent-memory-workspace-routines-and-responsibiliti.md)
- Competitor trace: CAP-agent-actions-08

## S61.13

**Agent conversation.** The user can open a conversation with a specific agent that answers as that agent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-03 Agent instructions and agent conversation](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md)

## S61.14

**Agent group conversation.** Several agents can take part in one conversation with the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-06 Agent teams, delegation and coordinator](../../20-features/061-persistent-agents-and-agent-rosters/F061-06-agent-teams-delegation-and-coordinator.md)

## S61.15

**Chief-of-staff/coordinator pattern.** A coordinator agent routes work to other agents and reports back to the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-06 Agent teams, delegation and coordinator](../../20-features/061-persistent-agents-and-agent-rosters/F061-06-agent-teams-delegation-and-coordinator.md)

## S61.16

**Specialist-agent delegation.** An agent can delegate part of a task to a specialist agent and use its result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-06 Agent teams, delegation and coordinator](../../20-features/061-persistent-agents-and-agent-rosters/F061-06-agent-teams-delegation-and-coordinator.md)

## S61.17

**Inter-agent messages.** Agents can send each other messages that the receiving agent acts on, visible to the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-06 Agent teams, delegation and coordinator](../../20-features/061-persistent-agents-and-agent-rosters/F061-06-agent-teams-delegation-and-coordinator.md)

## S61.18

**Human escalation.** An agent can escalate a decision to the user and wait for the answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F061-08 Escalation to the user](../../20-features/061-persistent-agents-and-agent-rosters/F061-08-escalation-to-the-user.md)

## S61.19

**Agent pause/disable.** The user can pause or disable an agent so it stops acting until re-enabled.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F061-07 Presence indicator and pause or disable](../../20-features/061-persistent-agents-and-agent-rosters/F061-07-presence-indicator-and-pause-or-disable.md)

## S61.20

**Resource-budget controls.** The user can set resource limits (turns, spend) per agent and they are enforced.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-04 Shared tools, skills and per-agent limits](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md)
- Competitor trace: CAP-agent-actions-28

## S61.21

**Agent configuration versioning.** Changes to an agent's configuration are versioned and can be reviewed or restored.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F061-02 Create and manage agents](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)

## S61.22

**Agent activity history.** The user can review the history of what each agent did.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI done, VS Code missing, Chrome missing
- Feature: [F061-09 Agent activity history](../../20-features/061-persistent-agents-and-agent-rosters/F061-09-agent-activity-history.md)

## S61.23

**Agent duplication.** The user can duplicate an agent as the starting point for a new one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F061-02 Create and manage agents](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)

## S61.24

**Agent retirement and ownership transfer.** The user can retire an agent or transfer its ownership, keeping its history.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F061-02 Create and manage agents](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md)
