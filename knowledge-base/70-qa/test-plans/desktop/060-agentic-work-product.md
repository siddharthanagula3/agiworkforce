---
id: "PLAN-desktop-060"
type: "test-plan"
title: "Desktop · 60. Agentic work product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "60"
---
# Desktop · 60. Agentic work product

28 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S60.01 Work-task composer.

- **Expected:** The user can open a dedicated entry to describe and start an agentic work task (not a plain chat turn) and it starts a real agent run.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6173; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1066; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3937; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1463
- **Where to find it:** Composer > "Work" (the Chat | Work switch above the composer) > type the task > Send (labels found in the code)
- **Needs:** a paid account with Work access, a project available
- **Steps:**
  1. Sign in on a paid account and open or start a project chat (the Chat | Work switch only appears when the project picker is shown).
  2. Click "Work" in the Chat | Work switch.
  3. Type a task in the composer and click Send.
  4. Look for the "Review the plan" panel (a Work run starts, not a plain chat reply). Compare with Expected.

## S60.02 Task title.

- **Expected:** Each work task shows a readable title in the task list, and the user can set or change it.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:728; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:500; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Task titles come from the goal summary in TasksPage.tsx and TaskDetailPanel.tsx, but I found no control to set or change a task title in those files.

## S60.03 Objective.

- **Expected:** The user states the objective of the task, and the objective is stored with the run and shown back.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3937; apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:27; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:552
- **Where to find it:** Work history (desktop: Sidebar > "Work"; web: "Work history" link on Home) > click a task (labels found in the code)
- **Needs:** a paid account with at least one Work task
- **Steps:**
  1. Open "Work history" from the sidebar (desktop "Work") or the Home page link.
  2. Click any task in the list.
  3. Read the goal text at the top of the task detail.
  4. Compare the text with the objective you typed in the composer.

## S60.04 Deliverable selection.

- **Expected:** The user can specify what deliverable the task should produce (e.g. a report or file) and the run receives it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7258; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3937; apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:27
- **Where to find it:** Composer > "Work" > "Add scope (optional)" > "Deliverable" field (labels found in the code)
- **Needs:** a paid account with Work access
- **Steps:**
  1. Click "Work" in the Chat | Work switch.
  2. Click "Add scope (optional)".
  3. Type the expected output (for example a report) in the field under "Deliverable".
  4. Send the task, then open it in Work history and check the deliverable text is recorded (for example via "Re-run this task").

## S60.05 Source selection.

- **Expected:** While composing a task the user can choose which sources it may use (project, files, connectors).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2765; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5266 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3927
- **Where to find it:** not found in the code. The composer has a "Work tools" palette with "Connected apps", "Folders" and "Skills" headings (packages/ui/i18n/locales/en/v3.json), but I did not find the control that opens it.

## S60.06 Tool selection.

- **Expected:** The user can choose which tools the task may use before it runs.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7296; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1468; apps/desktop/electron/windowPolicy.ts:174
- **Where to find it:** Composer > "Work" > "Add scope (optional)" > "Tools this task may use" (labels found in the code)
- **Needs:** a paid account with Work access
- **Steps:**
  1. Click "Work" in the Chat | Work switch.
  2. Click "Add scope (optional)".
  3. Look at "Tools this task may use" and tick or untick "Web search and browsing" or "Code execution".
  4. Send the task and compare which tools it uses with the ticks you set.

## S60.07 Execution-location selection.

- **Expected:** The user can choose where the task executes (cloud sandbox versus this computer or another device).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1293; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6033; apps/web/lib/device-steps/host-headers.ts:40; apps/web/lib/hooks/useChatStream.ts:4542
- **Where to find it:** not found in the code. Searched ComposerPlusMenu.tsx and ChatComposerNew.tsx: the only location-like control is the desktop-only "Device steps" toggle, not a cloud-versus-computer choice with visible words.

## S60.08 Model/profile selection.

- **Expected:** The user can pick the model (or profile) the task runs on, and the run records it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:746; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3937
- **Where to find it:** Composer footer > model selector (at the bottom of the composer, next to the Work switch) (path not confirmed in the code; trust the screen)
- **Needs:** a paid account with Work access
- **Steps:**
  1. Click "Work" in the Chat | Work switch.
  2. Open the model selector in the composer footer and choose a model.
  3. Send the task.
  4. Open the task in Work history and compare the model shown with the one you chose.

## S60.09 Effort selection.

- **Expected:** The user can set reasoning effort for the task and it is sent with the run.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1889; apps/web/lib/hooks/useChatStream.ts:3466 (quoted code not found in the file now)
- **Where to find it:** Composer footer > "Reasoning effort" button (brain icon) (labels found in the code)
- **Needs:** a paid account, and a model that supports effort control
- **Steps:**
  1. Click "Work" in the Chat | Work switch.
  2. Click the button with the brain icon titled "Reasoning effort" in the composer footer.
  3. Pick an effort level with the slider.
  4. Send the task and compare the effort shown with your choice.

## S60.13 Reviewable task plan.

- **Expected:** Before the agent acts, the user sees its plan and can approve, edit or reject it.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6257; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6187; apps/web/lib/hooks/useChatStream.ts:4669; apps/web/features/chat/components/work-session/AgiWorkPlanReview.tsx:88; apps/web/features/chat/pages/WebChatPage.tsx:6304
- **Where to find it:** Composer > "Work" > send a task > "Review the plan" panel (labels found in the code)
- **Needs:** a paid account with Work access
- **Steps:**
  1. Click "Work" in the Chat | Work switch and send a task.
  2. Wait for the "Review the plan" panel before the agent acts.
  3. Edit a step, click "Add a step" or "Remove this step" as needed.
  4. Click "Start work" to approve or "Cancel" to reject, then check that the agent did not act before Start work.

## S60.14 Step list.

- **Expected:** The task view lists its steps with an accurate per-step status.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:832
- **Where to find it:** Work history > click a task > step list (labels found in the code)
- **Needs:** a paid account with a Work task that has steps
- **Steps:**
  1. Open "Work history" and click a task that has steps.
  2. Read the numbered step list in the task detail.
  3. Compare each step's status word with what happened.

## S60.16 Running-step indicator.

- **Expected:** While a task runs, the view marks which step is currently executing.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6298; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7017; apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:192
- **Where to find it:** Work history > click a running task > step marked "In progress" (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Start a Work task and let it run.
  2. Open "Work history" and click the running task.
  3. Look for the step marked "In progress" and check it matches the step being worked on.

## S60.17 Parallel-work indicator.

- **Expected:** When the agent works on several things at once, the view shows the parallel work.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5422; apps/web/features/chat/components/messages/ToolTimeline.tsx:737; apps/desktop/electron/windowPolicy.ts:174
- **Where to find it:** not found in the code. Parallel tool calls are grouped by parallelGroup in apps/web/features/chat/components/messages/ToolTimeline.tsx, but I found no visible words for a parallel-work indicator.

## S60.18 Clarification request.

- **Expected:** The agent can pause a task to ask the user a clarifying question and continue with the answer.
- **Code:** done. Evidence moved: apps/web/lib/services/clarify-tool-service.ts:55 (quoted code not found in the file now); apps/desktop/electron/windowPolicy.ts:174
- **Where to find it:** not found in the code. Server code exists in apps/web/lib/services/clarify-tool-service.ts; I found no visible UI text for a clarifying question in the Work history or task components.

## S60.19 Approval request.

- **Expected:** When the agent needs permission for an action, the task pauses and the user can approve or deny it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:891; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:477; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:140
- **Where to find it:** Work history > "Needs you" filter > task card showing "Wants to run ..." > Approve or Deny (labels found in the code)
- **Needs:** a paid account and a Work task that asks for a tool permission
- **Steps:**
  1. Open "Work history".
  2. Click the "Needs you" filter.
  3. On a card that says "Wants to run" followed by a tool name, click the approve or deny button.
  4. Check the task continues after Approve, or stops after Deny.

## S60.20 Task steering.

- **Expected:** The user can redirect a running task with new guidance without starting over.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx:83; packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx:93; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:399; apps/web/features/tasks/components/TasksPage.tsx:50; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]/route.ts:70; apps/web/lib/services/cloud-agent-run-service.ts:2878
- **Where to find it:** Work history > click a running task > "Message the agent" box > Send (labels found in the code)
- **Needs:** a paid account and a running Work task
- **Steps:**
  1. Open "Work history" and click a running task.
  2. Click the box with the placeholder "Message the agent to add instructions or change course".
  3. Type the new guidance and click "Send".
  4. Check the message shows as queued and the task continues without restarting.

## S60.21 Pause.

- **Expected:** The user can pause a running task at a step boundary and it keeps its work.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:619 (quoted code not found in the file now); packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:368; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.ts:30
- **Where to find it:** Work history > running task card > "Pause" (labels found in the code)
- **Needs:** a paid account and a running Work task
- **Steps:**
  1. Open "Work history" and find a running task card.
  2. Click "Pause" on the card.
  3. Wait for the card to show "Pausing" and then the paused state.
  4. Check the task keeps its finished steps.

## S60.22 Resume.

- **Expected:** The user can resume a paused or stopped task from where it left off.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:636 (quoted code not found in the file now); packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:411; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:140
- **Where to find it:** Work history > paused task card > "Resume" (labels found in the code)
- **Needs:** a paid account and a paused Work task
- **Steps:**
  1. Open "Work history" and find a paused task card.
  2. Click "Resume".
  3. Check the task continues from where it stopped.

## S60.23 Cancel.

- **Expected:** The user can stop a running task and the run is cancelled on the server.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:653 (quoted code not found in the file now); packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:340; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:69
- **Where to find it:** Work history > running task card > "Stop" (labels found in the code)
- **Needs:** a paid account and a running Work task
- **Steps:**
  1. Open "Work history" and find a running task card.
  2. Click the stop button (labelled "Stop" with the task title).
  3. Wait for the "Stopping task" spinner to finish.
  4. Check the task state changes to stopped and the run no longer progresses.

## S60.24 Retry failed step.

- **Expected:** After a step fails, the user can retry just that step and the task continues.
- **Code:** done. Evidence present: apps/web/features/chat/components/work-session/AgiWorkPlanReview.tsx:62; apps/web/features/chat/pages/WebChatPage.tsx:6363; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6187
- **Where to find it:** Work session in chat > plan review > step marked "Failed" > "Retry from this step" (labels found in the code)
- **Needs:** a paid account and a Work task that fails a step
- **Steps:**
  1. Run a Work task until a step shows "Failed".
  2. Open the step's menu or the plan review.
  3. Click "Retry from this step" (also labelled "Retry a step").
  4. Check that only that step runs again and the task continues.

## S60.25 Restart task.

- **Expected:** The user can restart a finished task with the same inputs.
- **Code:** done. Evidence present: apps/desktop/src/features/tasks/DesktopTasks.tsx:24; apps/desktop/src/features/v3/DesktopShellV3.tsx:801
- **Where to find it:** Work history > click a finished task > "Re-run this task" (labels found in the code)
- **Needs:** a paid account and a finished Work task
- **Steps:**
  1. Open "Work history" and click a finished task (not running).
  2. Click "Re-run this task".
  3. Check a new chat opens in Work mode with the same goal, deliverable and constraints in the composer.
  4. Send it and check it runs again from the start.

## S60.26 Duplicate task.

- **Expected:** The user can duplicate a task into a new editable task.
- **Code:** done. Evidence present: apps/web/features/tasks/components/TasksPage.tsx:59; apps/desktop/src/features/tasks/DesktopTasks.tsx:24
- **Where to find it:** Work history > click a finished task > "Re-run this task" (labels found in the code)
- **Needs:** a paid account and a finished Work task
- **Steps:**
  1. Open "Work history" and click a finished task.
  2. Click "Re-run this task".
  3. Check the goal, deliverable and constraints appear in an editable composer draft in a new chat.
  4. Edit the text and send, then compare with the original task.

## S60.29 Results summary.

- **Expected:** When a task ends the user sees a summary of the result.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:678
- **Where to find it:** Work history > click a finished task > "Result" section (labels found in the code)
- **Needs:** a paid account and a finished Work task with a result
- **Steps:**
  1. Open "Work history" and click a finished task.
  2. Find the section labelled "Result".
  3. Compare its text with what the task produced.

## S60.30 Generated deliverables.

- **Expected:** Files the task produced are listed and can be opened or downloaded.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:307; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:750; apps/web/app/api/files/[id]/route.ts:194
- **Where to find it:** Work history > click a finished task > "Outputs" section > "Download and open" (labels found in the code)
- **Needs:** a paid account and a finished Work task that produced a file
- **Steps:**
  1. Open "Work history" and click a finished task that produced a file.
  2. Find the "Outputs · N" section.
  3. Click "Download and open" on a file.
  4. Check the file opens or downloads.

## S60.31 Partial-outcome summary.

- **Expected:** When a task stops short, the user sees what was done and what remains.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5224; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:634
- **Where to find it:** Work history > click a task that stopped short > plan section with "Remaining:" (labels found in the code)
- **Needs:** a paid account and a Work task that stopped short
- **Steps:**
  1. Open "Work history" and click a task that stopped before its last step.
  2. Find the line "Done N of M steps before it stopped."
  3. Read the "Remaining:" line below it.
  4. Compare with the steps you expected to finish.

## S60.32 Task history.

- **Expected:** The user can browse past tasks with their state and open any of them.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx (text found, layout changed); packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:247; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120 (quoted code not found in the file now)
- **Where to find it:** Desktop: Sidebar > Work (opens the "Work history" page). Web: Command palette > "Work history". (labels found in the code)
- **Needs:** a signed-in account with past work tasks; on desktop, privacy mode must not be Local
- **Steps:**
  1. Sign in with an account that already has past work tasks, then click "Work" in the left sidebar.
  2. Check that the page heading reads "Work history" and the subtitle reads "Your Cloud work sessions".
  3. Click the filter "Active", then "Needs you", "All" and "Archived" in turn, and check that the list changes to match each filter.
  4. Scroll to the bottom of the list and, if a "Load more" control appears, click it to load older tasks.
  5. Click any task row and check that its detail panel opens with that task's title and state.

## S60.33 Task sharing.

- **Expected:** The user can share a task (its plan, steps and results) with someone else.
- **Code:** done. Evidence present: apps/web/features/tasks/components/TasksPage.tsx:40; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:804; packages/contracts/types/src/product-routes.ts:28
- **Where to find it:** Web only: Work history > open a finished task > "Share task" (opens "Share conversation"). On the desktop Work page the button is not passed in, so it does not appear there. (labels found in the code)
- **Needs:** a signed-in web account with a finished task that has a source conversation
- **Steps:**
  1. On the web app, open "Work history" and click a finished task row (not one that is still running).
  2. In the task detail panel, find the button "Share task" under the source conversation line and click it.
  3. Check that the dialog title reads "Share conversation" and that it offers a share link with an expiry choice.
  4. Note: the dialog shares the source chat, not a separate plan or step list. Confirm whether the shared link shows the task's steps and results.

## S60.34 Cross-device task continuation.

- **Expected:** A task started on one device can be followed and acted on from another device.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:247; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:178; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120 (quoted code not found in the file now)
- **Where to find it:** Sign in to the same account on a second device or browser, then Sidebar > Work (web: Work history) and look for the task under "Active" or "Needs you". (labels found in the code)
- **Needs:** two devices or two browsers signed into the same account, and a running task
- **Steps:**
  1. On device A, start a work task and leave it running or waiting for approval.
  2. On device B (or a second browser), sign in to the same account and open "Work" in the sidebar.
  3. Find the task in the "Active" filter, or in "Needs you" if it waits for input, and click it.
  4. Use the task's own controls (for example Pause, Resume or approve) and check that device A shows the new state after a refresh.
  5. If a decision conflicts, check that the message reads "Another device already answered this approval." or "Another device already resumed this task."
