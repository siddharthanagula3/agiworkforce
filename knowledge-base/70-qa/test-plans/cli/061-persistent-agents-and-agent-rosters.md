---
id: "PLAN-cli-061"
type: "test-plan"
title: "CLI · 61. Persistent agents and agent rosters"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "61"
---
# CLI · 61. Persistent agents and agent rosters

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S61.01 Agent roster.

- **Expected:** The user sees a roster of their persistent agents with each one listed by name.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6131; apps/cli/src/agents.rs:580; apps/cli/src/agents.rs:258
- **Where to find it:** Type /agents in the chat (the TUI opens an overlay titled "Agents"). In plain text mode, /agents prints "Agents (N)" with a table. (labels found in the code)
- **Needs:** none (an agent must exist; create one first with S61.02 steps)
- **Steps:**
  1. Start agi and sign in.
  2. Type /agents and press Enter.
  3. Look for the overlay titled Agents with a list of agent names, each showing its color, scope ([project] or [global]) and description.
  4. Compare with Expected: each persistent agent is listed by name. If you have no agents, the overlay shows "No agents found. Create one with: /agents create <name>".

## S61.02 Create persistent agent.

- **Expected:** The user can create a new persistent agent that is saved and appears in the roster.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6131; apps/cli/src/agents.rs:605; apps/cli/src/agents.rs:1054
- **Where to find it:** Type /agents create <name> in the chat (add --global to save it for every project). A description in words instead of a name also works and is drafted by the model. (labels found in the code)
- **Needs:** a folder agi can write to
- **Steps:**
  1. Type /agents create reviewer and press Enter.
  2. Read the reply: it should say Created project agent `reviewer` at a path ending in .agiworkforce/agents/reviewer.md.
  3. Type /agents and press Enter.
  4. Compare with Expected: the new agent appears in the roster by name.

## S61.03 Agent name and avatar.

- **Expected:** Each agent has a user-set name and avatar shown wherever it appears.
- **Code:** done. Evidence present: apps/cli/src/agents.rs:19; apps/cli/src/agents.rs:925; apps/cli/src/tui/widgets/agent_picker.rs:288; apps/cli/src/tui/tui_app.rs:7955; apps/cli/src/tui/terminal_palette.rs:214
- **Where to find it:** Type /agents set <name> color <color> (colors: red, blue, green, yellow, purple, orange, pink, cyan). There is no avatar or picture setting anywhere in the CLI code. (labels found in the code)
- **Needs:** an existing agent named reviewer (create one first)
- **Steps:**
  1. Type /agents set reviewer color blue and press Enter.
  2. Type /agents show reviewer and read the color line.
  3. Type /agents and press Enter, then look at the reviewer name in the overlay.
  4. Compare with Expected: the name shows in the chosen color. No avatar exists to check.

## S61.04 Role description.

- **Expected:** Each agent carries a role description the user can write and read back.
- **Code:** done. Evidence present: apps/cli/src/agents.rs:913; apps/cli/src/agents.rs:25
- **Where to find it:** Type /agents set <name> description <text>, then read it back with /agents show <name>. (labels found in the code)
- **Needs:** an existing agent named reviewer
- **Steps:**
  1. Type /agents set reviewer description "Reviews pull requests for risky changes" and press Enter.
  2. Type /agents show reviewer and press Enter.
  3. Compare with Expected: the description line shows the text you wrote.

## S61.05 Agent-specific instructions.

- **Expected:** Each agent has its own instructions that shape its behaviour when used.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:2947 (quoted code not found in the file now); apps/cli/src/agents.rs:98
- **Where to find it:** Type /agents set <name> prompt <text> to replace the agent's instructions, then read them with /agents show <name>. (labels found in the code)
- **Needs:** an existing agent named reviewer
- **Steps:**
  1. Type /agents set reviewer prompt "Check every change for missing tests" and press Enter.
  2. Type /agents show reviewer and press Enter.
  3. Look for the prompt body in the output.
  4. Compare with Expected: the agent's own instructions are the text shown. To see the effect, run the agent with /agents reviewer and ask it for a review.

## S61.08 Shared account-level tools.

- **Expected:** Agents share the account-level tools and connectors, with per-agent limits.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:2947 (quoted code not found in the file now); apps/cli/src/agents.rs:98
- **Where to find it:** not found in the code. No account-level sharing of tools or connectors per agent was found. Agents have their own tools and disallowedTools lists and per-agent maxTurns and maxBudgetUsd (src/agents.rs). A separate /connectors command exists (apps/cli/src/claude_parity.rs) but it is session-level, not per agent. Searched apps/cli for connector and agents.rs for account-level sharing.

## S61.09 Shared account-level Skills.

- **Expected:** Agents can use the account-level Skills, and the user can see which ones.
- **Code:** done. Evidence present: apps/cli/src/agents.rs:67; apps/cli/src/agents.rs:938; apps/cli/src/agents.rs:1332; apps/cli/src/agents.rs:1509
- **Where to find it:** Type /agents show <name> to see the skills line for an agent; type /skills to list the installed skills. (labels found in the code)
- **Needs:** at least one installed skill
- **Steps:**
  1. Type /skills and press Enter and note the installed skill names.
  2. Type /agents set reviewer skills <name> (a comma-separated list of installed skills) and press Enter.
  3. Type /agents show reviewer and read the skills line.
  4. Compare with Expected: the agent shows the skills it can use, and they match the installed skills from /skills.

## S61.13 Agent conversation.

- **Expected:** The user can open a conversation with a specific agent that answers as that agent.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:2947 (quoted code not found in the file now); apps/cli/src/agents.rs:98; apps/cli/src/lib.rs:424
- **Where to find it:** Type /agents in the chat, move to an agent with the arrow keys, and press Enter. Or type /agents <name> directly. (labels found in the code)
- **Needs:** at least one agent
- **Steps:**
  1. Type /agents and press Enter.
  2. Choose an agent and press Enter.
  3. Look for the reply Agent `<name>` activated (with the model name if the agent sets one).
  4. Send a message and compare with Expected: the reply follows that agent's instructions and role.

## S61.14 Agent group conversation.

- **Expected:** Several agents can take part in one conversation with the user.
- **Code:** done. Evidence present: apps/cli/src/teams.rs:412; apps/cli/src/teams.rs:687; apps/cli/src/agent/chat.rs:1866; apps/cli/src/teams.rs:817
- **Where to find it:** Start with agi --team (or set AGI_TEAM=1), ask the lead to bring in teammates, then type /team to see the team. (labels found in the code)
- **Steps:**
  1. Start agi --team in a terminal.
  2. Ask the lead in plain words to bring in two teammates for a task.
  3. Type /team and press Enter to see the team messages and status.
  4. Compare with Expected: several agents post messages in one shared conversation, each message shown with its sender.

## S61.15 Chief-of-staff/coordinator pattern.

- **Expected:** A coordinator agent routes work to other agents and reports back to the user.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:1866; apps/cli/src/teams.rs:396; apps/cli/src/agent/chat.rs:1298
- **Where to find it:** Start agi --team, then ask the lead (named lead in the code) for a task that needs several specialists. The lead routes the work and reports back. (labels found in the code)
- **Steps:**
  1. Start agi --team in a terminal.
  2. Ask the lead for a task that needs two specialists, for example a review and a summary.
  3. Watch the team lines and the lead's final reply.
  4. Compare with Expected: the lead hands parts of the work to the other agents and then reports to you.

## S61.16 Specialist-agent delegation.

- **Expected:** An agent can delegate part of a task to a specialist agent and use its result.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:2955; apps/cli/src/tui/tui_app.rs:6131
- **Where to find it:** Type /agents to see the installed agents, then ask the main agent in plain words to hand part of a task to one of them by name. The main agent calls its agent tool. (labels found in the code)
- **Needs:** at least one installed agent
- **Steps:**
  1. Type /agents and press Enter and note an agent name.
  2. Ask the main agent in plain words to have that agent do one part of a task.
  3. Watch the tool line in the transcript that names the agent.
  4. Compare with Expected: the specialist's result appears and the main agent uses it in its answer.

## S61.17 Inter-agent messages.

- **Expected:** Agents can send each other messages that the receiving agent acts on, visible to the user.
- **Code:** done. Evidence present: apps/cli/src/teams.rs:626; apps/cli/src/teams.rs:687; apps/cli/src/teams.rs:1096
- **Where to find it:** Start agi --team, have the lead or a teammate send a message to another teammate, then type /team to read the message history. (labels found in the code)
- **Steps:**
  1. Start agi --team and ask the lead to have two teammates work together on a task.
  2. Type /team and press Enter.
  3. Look for lines of the form sender to receiver with the message text.
  4. Compare with Expected: the receiving agent acts on the message and the exchange is visible to you.

## S61.18 Human escalation.

- **Expected:** An agent can escalate a decision to the user and wait for the answer.
- **Code:** done. Evidence present: apps/cli/src/teams.rs:630; apps/cli/src/teams.rs:669; apps/cli/src/subagent.rs:1109; apps/cli/src/agent/chat.rs:3005
- **Where to find it:** Start agi --team, ask a teammate to make a decision that needs you, then answer with /team <name> <your answer>. (labels found in the code)
- **Steps:**
  1. Start agi --team and ask the lead to have a teammate check with you before a decision.
  2. Watch for a line saying the teammate asks you, followed by a line Answer with /team <name> <your answer>.
  3. Type /team <name> followed by your answer and press Enter.
  4. Compare with Expected: the teammate receives your answer and continues the work.

## S61.20 Resource-budget controls.

- **Expected:** The user can set resource limits (turns, spend) per agent and they are enforced.
- **Code:** done. Evidence present: apps/cli/src/agents.rs:57; apps/cli/src/agents.rs:1519; apps/cli/src/agents.rs:1215; apps/cli/src/agents.rs:931
- **Where to find it:** Type /agents set <name> maxBudgetUsd <dollars> and /agents set <name> maxTurns <number>, then read them with /agents show <name>. (labels found in the code)
- **Needs:** an existing agent named reviewer; a model account to run it
- **Steps:**
  1. Type /agents set reviewer maxBudgetUsd 0.50 and press Enter.
  2. Type /agents set reviewer maxTurns 5 and press Enter.
  3. Type /agents show reviewer and look for the spend cap per run line and the max_turns line.
  4. Compare with Expected: the limits show for the agent. To check enforcement, run the agent with /agents reviewer on a task that would go over the limit and see that it stops.

## S61.22 Agent activity history.

- **Expected:** The user can review the history of what each agent did.
- **Code:** done. Evidence present: apps/cli/src/agents.rs:624; apps/cli/src/agents.rs:1349; apps/cli/src/subagent_audit.rs:98; apps/cli/src/subagent.rs:734
- **Where to find it:** Type /agents history to see all agents' runs, or /agents history <name> for one agent. (labels found in the code)
- **Needs:** at least one completed agent run
- **Steps:**
  1. Run an agent first with /agents <name> and send one request.
  2. Type /agents history and press Enter.
  3. Look for the runs with outcome, files and spend.
  4. Compare with Expected: each agent's past runs are listed. If nothing ran yet, the text No recorded agent runs yet. appears.
