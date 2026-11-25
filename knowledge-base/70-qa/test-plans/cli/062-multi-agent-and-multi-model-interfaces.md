---
id: "PLAN-cli-062"
type: "test-plan"
title: "CLI · 62. Multi-agent and multi-model interfaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "62"
---
# CLI · 62. Multi-agent and multi-model interfaces

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S62.01 Parent task.

- **Expected:** A parent task visibly owns child agents it spawned, and the user can see that relationship.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7551; apps/cli/src/repl/registry.rs:484
- **Where to find it:** agi, then type /tasks (labels found in the code)
- **Needs:** a session where subagents can start (a model run that can call the task tool)
- **Steps:**
  1. Start agi and send a request that makes the model spawn subagents, for example /workflow <goal>.
  2. When subagents have started, type /tasks and press Enter.
  3. Look for the line "Subagent tasks (N)" and the rows under it.
  4. Compare with Expected: the rows are the child tasks of this session. No line on screen names a parent task.

## S62.02 Child-agent list.

- **Expected:** The user sees a list of the child agents working under a task.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7551; apps/cli/src/repl/registry.rs:484
- **Where to find it:** agi, then type /tasks (labels found in the code)
- **Needs:** a session with at least one subagent
- **Steps:**
  1. Start a run with at least one subagent, for example /workflow <goal>.
  2. Type /tasks and press Enter.
  3. Look for "Subagent tasks (N)" with one row per child: id, role, status and description.
  4. Compare with Expected: each child working under the task appears as a row.

## S62.03 Role labels.

- **Expected:** Each child agent is labelled with its role.
- **Code:** done. Evidence present: apps/cli/src/subagent.rs:885
- **Where to find it:** agi, then type /tasks (labels found in the code)
- **Needs:** a session with at least one subagent
- **Steps:**
  1. Run /tasks and read the second column of each row, for example reviewer or general-purpose.
  2. Type /tasks show <id> with a row id from the list.
  3. Look for the header "Task <id> [status] role: description".
  4. Compare with Expected: each child shows its role label. The list has no column heading for role.

## S62.04 Model labels.

- **Expected:** Each participating agent or model is labelled with the model it runs on.
- **Code:** done. Evidence present: apps/cli/src/subagent.rs:136
- **Where to find it:** agi, then type /tasks show <id> (labels found in the code)
- **Needs:** a finished subagent
- **Steps:**
  1. Run /tasks and copy the id of a finished subagent.
  2. Type /tasks show <id> and press Enter.
  3. Look for the line starting with "Model" that gives the model name, tokens and cost.
  4. Compare with Expected: the model name labels that agent. The list view does not show the model.

## S62.05 Per-agent status.

- **Expected:** The view shows the live status of each participating agent or model.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7551; apps/cli/src/repl/registry.rs:484
- **Where to find it:** agi, then type /tasks (labels found in the code)
- **Needs:** a session where two or more subagents run at the same time
- **Steps:**
  1. Start a run that spawns subagents and, while they are still working, type /tasks.
  2. Read the [running] status on each row.
  3. Wait, then type /tasks again and read the status change, for example [completed] or [failed: ...].
  4. Compare with Expected: each agent has its own status. Also watch the working line above the prompt for the count of subagents working at once.

## S62.07 Per-agent result.

- **Expected:** Each participating agent's result is shown separately.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7456; apps/cli/src/repl/registry.rs:484
- **Where to find it:** agi, then type /tasks show <id> (labels found in the code)
- **Needs:** two or more finished subagents
- **Steps:**
  1. Run /tasks and copy the id of a finished subagent.
  2. Type /tasks show <id> and press Enter.
  3. Read the block under the header: it holds that task's result text, then Files modified if any.
  4. Repeat for a second id and compare with Expected: each agent's result is its own block.

## S62.08 Per-agent usage.

- **Expected:** The user sees usage or cost per participating agent or model.
- **Code:** done. Evidence present: apps/cli/src/subagent.rs:136
- **Where to find it:** agi, then type /tasks show <id> (labels found in the code)
- **Needs:** two or more finished subagents
- **Steps:**
  1. Run /tasks show <id> for a finished subagent.
  2. Read the Model line: input and output tokens, then the cost in credits or "on your subscription".
  3. Run the same for a second finished subagent.
  4. Compare with Expected: usage is shown per agent. No session total per agent appears in this view.

## S62.09 Concurrent task view.

- **Expected:** The user can watch several running tasks or agents at once in one view.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7551; apps/cli/src/repl/registry.rs:484
- **Where to find it:** not found in the code. Searched apps/cli/src for a live multi-task panel. Found only the /tasks text list (a snapshot) and the working-line count "working at once" in tui_app.rs. No single live overview of several running tasks was found.
- **Needs:** two or more subagents running at the same time

## S62.11 Inline unblock response.

- **Expected:** The user can unblock a waiting task or agent inline without leaving the overview.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/approval_overlay.rs:548; apps/cli/src/tui/tui_app.rs:8270
- **Where to find it:** Any request that needs approval > "Tool Approval" box (labels found in the code)
- **Needs:** a subagent that asks for a permission
- **Steps:**
  1. Start a run where a subagent needs permission, for example /workflow <goal> that edits files, in a permission mode that asks.
  2. When the "Tool Approval" box appears over the chat, read its key list.
  3. Press the key that approves the request.
  4. Type /tasks and check the waiting task now shows [running] or a later status. Compare with Expected: unblocked without leaving the view.

## S62.12 Full-transcript drill-down.

- **Expected:** From an overview the user can drill into the full transcript of a task.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6002; apps/cli/src/tui/tui_app.rs:4304
- **Where to find it:** agi, then type /tasks transcript <id> (labels found in the code)
- **Needs:** a finished subagent that kept a transcript
- **Steps:**
  1. Run /tasks and copy the id of a finished subagent.
  2. Type /tasks show <id> and read the last line, which gives the step count and the command.
  3. Type /tasks transcript <id> and press Enter.
  4. Compare with Expected: the full conversation of that task appears, step by step.

## S62.16 Background fork.

- **Expected:** The user can fork a side task that runs in the background without disturbing the main one.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7304
- **Where to find it:** agi, then type /btw <question> (labels found in the code)
- **Needs:** a request that takes a while to answer
- **Steps:**
  1. Send a long request to the main chat so it keeps working.
  2. While it is working, type /btw <question>, for example /btw what is the project name, and press Enter.
  3. Read the status "answering the side question" and the side answer in the chat.
  4. Compare with Expected: the side question is answered while the main request keeps running.

## S62.17 Interactive branch.

- **Expected:** The user can branch the conversation from a point and continue interactively in the branch.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6014; apps/cli/src/repl/registry.rs:1353
- **Where to find it:** agi, then type /fork (also /branch) (labels found in the code)
- **Needs:** a conversation with messages and session saving on (not --no-session-persistence)
- **Steps:**
  1. Send a few messages so the conversation has content.
  2. Type /fork and press Enter.
  3. Read the reply "Branched conversation '<name>' as managed session <id>. Resume with: agiworkforce --session <id>".
  4. Compare with Expected: the branch is not continued on the same screen; resume it with the printed command in a new run.

## S62.18 Advisor consultation.

- **Expected:** The user or agent can consult an advisor model on a side question and see its answer.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6671; apps/cli/src/tui/tui_app.rs:7831
- **Where to find it:** agi, then type /advisor <question> (labels found in the code)
- **Needs:** an advisor model available in the catalog
- **Steps:**
  1. Type /advisor followed by a question, for example /advisor is this plan safe to ship?, and press Enter.
  2. Wait for the advisor reply in the chat.
  3. Read the end of the reply, which shows the line "[advisor model: <name>]".
  4. Compare with Expected: the answer from the advisor model is shown. If it fails, the chat shows "Advisor failed:".
