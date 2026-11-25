---
id: "PLAN-web-060"
type: "test-plan"
title: "Web · 60. Agentic work product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "60"
---
# Web · 60. Agentic work product

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S60.01 Work-task composer.

- **Expected:** The user can open a dedicated entry to describe and start an agentic work task (not a plain chat turn) and it starts a real agent run.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6173; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1066; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3937; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1463
- **Where to find it:** Chat composer > Chat | Work switch > Work (Work tools palette appears under the Add attachments and tools button) (labels found in the code)
- **Needs:** a paid account (Pro or above), a project to select
- **Steps:**
  1. Sign in on a paid plan (Free trial is excluded) and open a chat with a project selected so the project picker shows.
  2. In the composer, click the segment labelled Work next to Chat.
  3. Type a goal in the composer and send it.
  4. Look for a task that starts as a Work run (a plan review or activity appears), not a plain chat reply. Compare with Expected.

## S60.02 Task title.

- **Expected:** Each work task shows a readable title in the task list, and the user can set or change it.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:728; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:500; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Chats and tasks > Tasks filter > select a task row (title shown on the row) (labels found in the code)
- **Needs:** a Free or paid account with at least one task
- **Steps:**
  1. Sign in and click Chats and tasks in the sidebar.
  2. Choose the Tasks filter.
  3. Read the title on each task row.
  4. Open a task and click Open source chat; compare the title shown there with the row title.

## S60.03 Objective.

- **Expected:** The user states the objective of the task, and the objective is stored with the run and shown back.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3937; apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:27; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:552
- **Where to find it:** Command palette (Cmd+K) > Work history > open a task > Goal section (labels found in the code)
- **Needs:** a task that was started with a goal
- **Steps:**
  1. Press Cmd+K and choose Work history.
  2. Click a task row.
  3. Read the Goal block at the top of the task details.
  4. Compare the goal text with what you typed when starting the task.

## S60.04 Deliverable selection.

- **Expected:** The user can specify what deliverable the task should produce (e.g. a report or file) and the run receives it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7258; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3937; apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:27
- **Where to find it:** Composer > Add attachments and tools (+) > Add scope (optional) > Deliverable (labels found in the code)
- **Needs:** a paid account, a project selected
- **Steps:**
  1. In a Work composer, click the + button labelled Add attachments and tools.
  2. Click Add scope (optional).
  3. Type in the Deliverable field, for example a report or a file.
  4. Send the goal and open the task; check that the deliverable appears in the task details.

## S60.05 Source selection.

- **Expected:** While composing a task the user can choose which sources it may use (project, files, connectors).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2765; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5266 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3927
- **Where to find it:** Composer > Add attachments and tools (+) > Work tools palette > Connected apps, Folders, Skills, Plugins (labels found in the code)
- **Needs:** a paid account, connected apps or folders for the sections to fill
- **Steps:**
  1. In a Work composer, click Add attachments and tools (+).
  2. Read the Work tools palette.
  3. Look at the sections Connected apps, Folders, Skills and Plugins and tick the ones the task may use.
  4. Compare the ticked sources with the sources shown in the task after it starts.

## S60.06 Tool selection.

- **Expected:** The user can choose which tools the task may use before it runs.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1468; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1470; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7296
- **Where to find it:** Composer > Add attachments and tools (+) > Add scope (optional) > Tools this task may use (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. In a Work composer, click Add attachments and tools (+) and then Add scope (optional).
  2. Read the Tools this task may use group.
  3. Tick or untick Web search and browsing and Code execution.
  4. Send the goal and check the task only uses the ticked tools.

## S60.08 Model/profile selection.

- **Expected:** The user can pick the model (or profile) the task runs on, and the run records it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:746; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3937
- **Where to find it:** Composer footer > model button (aria label Change model) (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. In a Chat or Work composer, look at the composer footer.
  2. Click the model name button (its accessible name ends with Change model).
  3. Pick another model and close the list.
  4. Send a Work goal and open the task; check the model is shown on the task row.

## S60.09 Effort selection.

- **Expected:** The user can set reasoning effort for the task and it is sent with the run.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1889; apps/web/lib/hooks/useChatStream.ts:3466 (quoted code not found in the file now)
- **Where to find it:** Composer footer > Reasoning effort button > Reasoning effort slider (labels found in the code)
- **Needs:** a model that supports reasoning effort
- **Steps:**
  1. In the composer footer, click the button titled Reasoning effort.
  2. Move the Reasoning effort slider to another level.
  3. Send the goal.
  4. Check the level on the task after it starts; compare with Expected.

## S60.13 Reviewable task plan.

- **Expected:** Before the agent acts, the user sees its plan and can approve, edit or reject it.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6257; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6187; apps/web/lib/hooks/useChatStream.ts:4669; apps/web/features/chat/components/work-session/AgiWorkPlanReview.tsx:88; apps/web/features/chat/pages/WebChatPage.tsx:6304
- **Where to find it:** Work chat > send a goal > Review the plan card (Start work or Cancel) (labels found in the code)
- **Needs:** a paid account, a project selected, the agent must produce a plan
- **Steps:**
  1. Send a Work goal in a project chat.
  2. Wait for the Review the plan card to appear.
  3. Edit a step text, or click Add a step or Remove this step.
  4. Click Start work, or Cancel, and compare with Expected.

## S60.14 Step list.

- **Expected:** The task view lists its steps with an accurate per-step status.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:832
- **Where to find it:** Command palette (Cmd+K) > Work history > click a task > Task plan section (labels found in the code)
- **Needs:** a task with a plan
- **Steps:**
  1. Open Work history and click a task.
  2. Find the Task plan section, headed Plan with the step count.
  3. Read the steps and the coloured dot next to each one.
  4. Compare each dot with the step result after the run finishes.

## S60.16 Running-step indicator.

- **Expected:** While a task runs, the view marks which step is currently executing.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6298; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7017; apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:192
- **Where to find it:** Command palette (Cmd+K) > Work history > click a running task > Task plan section (labels found in the code)
- **Needs:** a task that is running
- **Steps:**
  1. Open Work history and click a task that is still running.
  2. Look at the Task plan section.
  3. Find the step with the filled dot in the running colour.
  4. Wait and check that the marked step moves forward as the run continues.

## S60.17 Parallel-work indicator.

- **Expected:** When the agent works on several things at once, the view shows the parallel work.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5422; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1203; apps/web/lib/hooks/useChatStream.ts:3487
- **Where to find it:** Work chat > tool activity list > group labelled parallel (labels found in the code)
- **Needs:** a Work task that runs tools in parallel
- **Steps:**
  1. Start a Work task that runs several tools at once.
  2. Open the tool activity list in the chat while the task runs.
  3. Look for a group marked with the word parallel and a branch icon.
  4. Compare the grouped tools with what ran at the same time.

## S60.18 Clarification request.

- **Expected:** The agent can pause a task to ask the user a clarifying question and continue with the answer.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1288; apps/web/lib/services/clarify-tool-service.ts:56 (quoted code not found in the file now)
- **Where to find it:** Work chat > clarifying question card (Send answers) (labels found in the code)
- **Needs:** a paid account, a project selected
- **Steps:**
  1. Send a short, vague Work request.
  2. If the agent asks a question, read the card with its options.
  3. Pick an option or type in Something else…, then click Send answers.
  4. Check the agent continues the task with your answer.

## S60.19 Approval request.

- **Expected:** When the agent needs permission for an action, the task pauses and the user can approve or deny it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:891; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:477; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:140
- **Where to find it:** Tasks (Work history) > Needs you filter > task card: Waiting for your approval > Approve or Deny (labels found in the code)
- **Needs:** a task that needs approval
- **Steps:**
  1. Open Work history and choose the Needs you filter.
  2. Find a task with the card Waiting for your approval.
  3. Read the tool call shown on the card.
  4. Click Approve or Deny, then check the task resumes or stops.

## S60.20 Task steering.

- **Expected:** The user can redirect a running task with new guidance without starting over.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx:83; packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx:93; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:399; apps/web/features/tasks/components/TasksPage.tsx:50; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]/route.ts:70; apps/web/lib/services/cloud-agent-run-service.ts:2878
- **Where to find it:** Work history > open a running task > Message the agent box > Send (labels found in the code)
- **Needs:** a task that is still running
- **Steps:**
  1. Open Work history and click a running task.
  2. Click into the box Message the agent to add instructions or change course.
  3. Type new guidance and click Send.
  4. Check the queued message appears and the task changes course without restarting.

## S60.21 Pause.

- **Expected:** The user can pause a running task at a step boundary and it keeps its work.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:619 (quoted code not found in the file now); packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:368; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.ts:30
- **Where to find it:** Work history > List or Board > task > Pause (labels found in the code)
- **Needs:** a running task
- **Steps:**
  1. Open Work history on a running task.
  2. Click Pause on the task row (List) or card (Board).
  3. Watch the badge change to Pausing and then Paused.
  4. Check that the task keeps its completed steps when it stops.

## S60.22 Resume.

- **Expected:** The user can resume a paused or stopped task from where it left off.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:636 (quoted code not found in the file now); packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:411; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:140
- **Where to find it:** Work history > Active filter > paused task > Resume (labels found in the code)
- **Needs:** a paused or stopped task
- **Steps:**
  1. Open Work history and choose the Active filter.
  2. Find a task with the badge Paused.
  3. Click Resume on the row or card.
  4. Check the task continues from its last completed step.

## S60.23 Cancel.

- **Expected:** The user can stop a running task and the run is cancelled on the server.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:653 (quoted code not found in the file now); packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:340; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:69
- **Where to find it:** Work history > Board > task card > Stop (labels found in the code)
- **Needs:** a running task
- **Steps:**
  1. Open Work history and click the Board layout.
  2. Find a running task card.
  3. Click Stop on the card.
  4. Check the task ends as Stopped and the run stops on the server.

## S60.24 Retry failed step.

- **Expected:** After a step fails, the user can retry just that step and the task continues.
- **Code:** done. Evidence present: apps/web/features/chat/components/work-session/AgiWorkPlanReview.tsx:62; apps/web/features/chat/pages/WebChatPage.tsx:6363; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6187
- **Where to find it:** Work chat > plan review card > Retry from this step (labels found in the code)
- **Needs:** a Work task with a failed step
- **Steps:**
  1. Run a Work task until a step fails.
  2. Find the plan review card for that run.
  3. Click Retry from this step on the step that failed.
  4. Check the task continues from that step.

## S60.25 Restart task.

- **Expected:** The user can restart a finished task with the same inputs.
- **Code:** done. Evidence present: apps/web/features/tasks/components/TasksPage.tsx:59; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1133
- **Where to find it:** Work history > click a finished task > Re-run this task (labels found in the code)
- **Needs:** a finished task
- **Steps:**
  1. Open Work history and click a finished task (not a live one).
  2. Find the Goal block and click Re-run this task.
  3. A new Work chat opens with the goal, constraints and deliverable filled in.
  4. Send it and compare the new run with the old one.

## S60.26 Duplicate task.

- **Expected:** The user can duplicate a task into a new editable task.
- **Code:** done. Evidence present: apps/web/features/tasks/components/TasksPage.tsx:59; apps/desktop/src/features/tasks/DesktopTasks.tsx:24
- **Where to find it:** not found in the code. No Duplicate label was found in the tasks UI (searched TasksPage.tsx, TaskDetailPanel.tsx and the tasks folder). The nearest control is Re-run this task (TaskDetailPanel.tsx), which loads the goal into a new Work chat; desktop DesktopTasks.tsx was not opened.
- **Needs:** a finished task

## S60.29 Results summary.

- **Expected:** When a task ends the user sees a summary of the result.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:678
- **Where to find it:** Work history > click a finished task > Result section (labels found in the code)
- **Needs:** a completed task
- **Steps:**
  1. Open Work history and click a completed task.
  2. Find the section labelled Result.
  3. Read the result text.
  4. Compare it with what the task produced.

## S60.30 Generated deliverables.

- **Expected:** Files the task produced are listed and can be opened or downloaded.
- **Code:** done. Evidence moved: apps/web/app/api/files/[id]/route.ts:194; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:307; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:750; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:562 (quoted code not found in the file now)
- **Where to find it:** Work history > click a task > Outputs section > Download and open (labels found in the code)
- **Needs:** a task that produced files
- **Steps:**
  1. Open Work history and click a task that produced files.
  2. Open the Outputs section.
  3. Click Download and open on a file.
  4. Check the file opens or downloads and matches the name and size shown.

## S60.31 Partial-outcome summary.

- **Expected:** When a task stops short, the user sees what was done and what remains.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5224; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:634
- **Where to find it:** Work history > Archived or All filter > task with state Partially completed > Task plan section (labels found in the code)
- **Needs:** a task that stopped short
- **Steps:**
  1. Open Work history and choose the All filter.
  2. Click a task whose state is Partially completed.
  3. Read the line Done X of Y steps before it stopped.
  4. Read the Remaining: list and compare with what was done.

## S60.32 Task history.

- **Expected:** The user can browse past tasks with their state and open any of them.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx (text found, layout changed); packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:247; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120 (quoted code not found in the file now)
- **Where to find it:** Command palette (Cmd+K) > Work history, or sidebar Chats and tasks > Tasks filter; then Work history filters Active, Needs you, All, Archived (labels found in the code)
- **Needs:** none (more tasks make it easier to test)
- **Steps:**
  1. Press Cmd+K and choose Work history.
  2. Click each filter: Active, Needs you, All, Archived.
  3. Switch between List and Board.
  4. Click Show more if it appears, then open any task and compare its state with the badge.

## S60.33 Task sharing.

- **Expected:** The user can share a task (its plan, steps and results) with someone else.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:804; apps/web/features/tasks/components/TasksPage.tsx:40
- **Where to find it:** Work history (route /tasks, also reached from the command palette action or the "Work history" link on the home screen) > open a finished task in the list > open the details panel > expand the details disclosure > Share task (labels found in the code)
- **Needs:** a Free or paid account with at least one finished work task that has a source chat
- **Steps:**
  1. Sign in and open Work history from the home screen link "Work history" or the command palette.
  2. Click a task that has a source chat and is not live (a finished one), so its details open on the right.
  3. Expand the details section of the task panel.
  4. Click the button "Share task" (it only appears when the task has a source chat and is not running).
  5. Look for the share dialog on the source chat (the app opens /chat/<id>?share=true, which opens the chat's share dialog) and compare with Expected: the task's plan, steps and results should be shareable. Note: the handler shares the source conversation, not a separate task record.

## S60.34 Cross-device task continuation.

- **Expected:** A task started on one device can be followed and acted on from another device.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:247; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:178; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120 (quoted code not found in the file now)
- **Where to find it:** Work history (route /tasks) > open a task from the list, or open a link with ?run=<id>; the list is loaded from the server, so the same account on another device shows the same tasks (labels found in the code)
- **Needs:** a paid account (signed in on two devices) and a running task; a Free account may not have work tasks
- **Steps:**
  1. On device A, start a work task and note its title in Work history.
  2. On device B (same account, signed in), open Work history.
  3. Find the same task in the list (the list filter defaults to "active") and click it.
  4. On device B, try a running control such as "Pause", "Cancel", or a pending approval ("Approve" or "Deny").
  5. Compare with Expected: device B should show the same task state as device A and be able to act on it. A message such as "Another device already resumed this task." or "Another device already answered this approval." means the action was refused because device A acted first.
