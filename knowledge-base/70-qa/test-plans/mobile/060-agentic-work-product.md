---
id: "PLAN-mobile-060"
type: "test-plan"
title: "Mobile · 60. Agentic work product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "60"
---
# Mobile · 60. Agentic work product

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S60.01 Work-task composer.

- **Expected:** The user can open a dedicated entry to describe and start an agentic work task (not a plain chat turn) and it starts a real agent run.
- **Code:** done. Evidence moved: apps/mobile/src/features/tasks/CloudTasksScreen.tsx:93 (quoted code not found in the file now); apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:135; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:574; apps/mobile/src/features/tasks/startWork.ts:44
- **Where to find it:** Open menu > AGI Work > New task (labels found in the code)
- **Needs:** A signed-in account that has AGI Work (the capability canUseAgiWork); the plan that grants it was not verified from the code.
- **Steps:**
  1. On the chat screen, tap the "Open menu" button.
  2. Tap "AGI Work" in the menu.
  3. Tap the "New task" button (bottom right). On an empty list, the "Hand off a task" card also has a "New task" button.
  4. In the sheet, type what the task should do in "What should it accomplish?", then tap "Start task".
  5. Look for a new task card in the AGI Work list that shows it is running, and compare with Expected.

## S60.02 Task title.

- **Expected:** Each work task shows a readable title in the task list, and the user can set or change it.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunCard.tsx:63; apps/mobile/src/features/tasks/startWork.ts:33; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:574
- **Where to find it:** Open menu > AGI Work (labels found in the code)
- **Needs:** A signed-in account with at least one AGI Work task.
- **Steps:**
  1. On the chat screen, tap "Open menu", then tap "AGI Work".
  2. Read the title in bold on each task card.
  3. Compare the title with Expected.

## S60.03 Objective.

- **Expected:** The user states the objective of the task, and the objective is stored with the run and shown back.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:135; apps/mobile/src/features/tasks/startWork.ts:44
- **Where to find it:** Open menu > AGI Work > New task (labels found in the code)
- **Needs:** A signed-in account that has AGI Work.
- **Steps:**
  1. Open "AGI Work" from the menu, then tap "New task".
  2. Type the objective in "What should it accomplish?" and tap "Start task".
  3. Open the new task card and read the preview line under its title.
  4. Compare the objective you typed with what the card or task shows.

## S60.04 Deliverable selection.

- **Expected:** The user can specify what deliverable the task should produce (e.g. a report or file) and the run receives it.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:178; apps/mobile/src/features/tasks/startWork.ts:44
- **Where to find it:** Open menu > AGI Work > New task (labels found in the code)
- **Needs:** A signed-in account that has AGI Work.
- **Steps:**
  1. Open "AGI Work" from the menu, then tap "New task".
  2. Type a goal in "What should it accomplish?".
  3. Type a deliverable in "Deliverable (optional)", for example "A one-page summary".
  4. Tap "Start task", open the task, and compare the result with the deliverable you asked for.

## S60.13 Reviewable task plan.

- **Expected:** Before the agent acts, the user sees its plan and can approve, edit or reject it.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2381; apps/mobile/stores/chat/chatExecutionStore.ts:5932
- **Where to find it:** Chat screen > "Work" mode switch > send a message > "Plan" card (labels found in the code)
- **Needs:** A signed-in account with AGI Work, on Cloud mode (the plan card is shown only when the app mode is cloud).
- **Steps:**
  1. On a chat, tap "Work" in the mode switch above the input (it is the Work tab).
  2. Type a multi-step request and send it.
  3. When the "Plan" card appears, read the steps. Tap a step to edit it, or use "Add a step" or "Remove this step".
  4. Tap "Start work" to approve, or "Cancel" to reject. Compare with Expected.

## S60.14 Step list.

- **Expected:** The task view lists its steps with an accurate per-step status.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/runPresentation.ts:340; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:505
- **Where to find it:** Open menu > AGI Work > tap a task card > Plan section (labels found in the code)
- **Needs:** A signed-in account with an AGI Work task that has a plan.
- **Steps:**
  1. Open "AGI Work" from the menu and tap a task card.
  2. Scroll to the "Plan" section (its heading reads Plan with a step count).
  3. Read each step line: number, description, then a status.
  4. Compare each status with the work the run has done.

## S60.16 Running-step indicator.

- **Expected:** While a task runs, the view marks which step is currently executing.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:505
- **Where to find it:** Open menu > AGI Work > tap a running task card > Plan section (labels found in the code)
- **Needs:** A task that is still running.
- **Steps:**
  1. Start a task with "New task" in "AGI Work" or open one that is in the Running filter.
  2. Tap its card and scroll to the "Plan" section while it runs.
  3. Look for the one step whose status reads "In progress".
  4. Wait a moment and check that the marked step moves on.

## S60.18 Clarification request.

- **Expected:** The agent can pause a task to ask the user a clarifying question and continue with the answer.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:456; apps/mobile/src/features/tasks/store.ts:356; packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:437; apps/web/app/api/llm/v1/chat/completions/resume-input/route.ts:538
- **Where to find it:** Open menu > AGI Work > Needs you > tap the task > answer the form (labels found in the code)
- **Needs:** A task where the agent asked a question. The tester cannot force this.
- **Steps:**
  1. Open "AGI Work" and tap the "Needs you" filter.
  2. Tap a task that is waiting for a question.
  3. Fill in the questions in the form that appears.
  4. Tap "Send answer" (or "Continue" when there are no fields).
  5. Check that the task moves back to Running and continues.

## S60.19 Approval request.

- **Expected:** When the agent needs permission for an action, the task pauses and the user can approve or deny it.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:428; apps/mobile/src/features/tasks/service.ts:64
- **Where to find it:** Open menu > AGI Work > Needs you > tap the task > Approve or Deny (labels found in the code)
- **Needs:** A task that is waiting for approval. The tester cannot force this.
- **Steps:**
  1. Open "AGI Work" and tap the "Needs you" filter.
  2. Tap a task that is waiting for approval.
  3. Read the pending action rows.
  4. Tap "Approve" or "Deny", then check that the task continues or stops.

## S60.20 Task steering.

- **Expected:** The user can redirect a running task with new guidance without starting over.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunSteerSection.tsx:18; apps/mobile/src/features/tasks/components/CloudRunSteerSection.tsx:54; packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:246
- **Where to find it:** Open menu > AGI Work > tap a running task > Message the agent (labels found in the code)
- **Needs:** A task that is still running, queued or paused.
- **Steps:**
  1. Open "AGI Work" and tap a task that is Running.
  2. Scroll to the "Message the agent" section at the bottom of the task.
  3. Type in "Add instructions or change course" and tap "Send to the agent".
  4. Check that your message appears and that the task keeps going without starting over.

## S60.23 Cancel.

- **Expected:** The user can stop a running task and the run is cancelled on the server.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:640; apps/mobile/src/features/tasks/service.ts:77
- **Where to find it:** Open menu > AGI Work > tap a running task > Stop this task (labels found in the code)
- **Needs:** A task that is still running.
- **Steps:**
  1. Open "AGI Work" and tap a task that is Running.
  2. Scroll to the bottom and tap "Stop this task".
  3. Read the dialog, then tap "Stop task" (or "Keep it running" to cancel).
  4. Check that the task state changes to stopped, and compare with Expected.

## S60.29 Results summary.

- **Expected:** When a task ends the user sees a summary of the result.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:544; apps/mobile/src/features/tasks/runPresentation.ts:240
- **Where to find it:** Open menu > AGI Work > Finished > tap a finished task > Latest output (labels found in the code)
- **Needs:** A finished AGI Work task.
- **Steps:**
  1. Open "AGI Work" and tap the "Finished" filter.
  2. Tap a finished task card.
  3. Scroll to the "Latest output" section.
  4. Read the result text and compare it with Expected.

## S60.30 Generated deliverables.

- **Expected:** Files the task produced are listed and can be opened or downloaded.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:36
- **Where to find it:** Open menu > AGI Work > tap a task with files > Files section (labels found in the code)
- **Needs:** A task that produced a file. A file to produce one may need to be asked for in the task.
- **Steps:**
  1. Open "AGI Work" and tap a finished task that produced files.
  2. Scroll to the Files section and read the file names and sizes.
  3. Tap a file row to open or share it.
  4. If it fails, read the alert text. Compare with Expected.

## S60.31 Partial-outcome summary.

- **Expected:** When a task stops short, the user sees what was done and what remains.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:536
- **Where to find it:** Open menu > AGI Work > Finished > tap a stopped task > plan list (labels found in the code)
- **Needs:** A task that was stopped before it finished.
- **Steps:**
  1. Open "AGI Work" and tap a task that was stopped (for example, one you stopped with "Stop this task").
  2. Scroll to the "Plan" section and read the step statuses.
  3. Read the line that says how many steps were done before it stopped.
  4. Compare with Expected.

## S60.32 Task history.

- **Expected:** The user can browse past tasks with their state and open any of them.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/CloudTasksScreen.tsx:695; apps/mobile/src/features/tasks/service.ts:45
- **Where to find it:** Open menu > AGI Work (labels found in the code)
- **Needs:** A signed-in account with several past AGI Work tasks.
- **Steps:**
  1. On the chat screen, tap "Open menu", then tap "AGI Work".
  2. Tap each filter pill: "All", "Needs you", "Running", "Finished".
  3. Scroll down and tap "Load more" if it appears.
  4. Tap any card to open its detail, and compare with Expected.

## S60.34 Cross-device task continuation.

- **Expected:** A task started on one device can be followed and acted on from another device.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:368; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:428; apps/mobile/src/features/tasks/service.ts:45
- **Where to find it:** Open menu > AGI Work > tap the task > Resume this task (on the second device) (labels found in the code)
- **Needs:** Two devices (or a phone and the web or desktop app) signed in to the same account.
- **Steps:**
  1. On device A, start a task from "AGI Work" > "New task".
  2. On device B, signed in to the same account, open "Open menu" and tap "AGI Work".
  3. Find the same task card, tap it, and read its state and steps.
  4. Tap "Resume this task" or "Pause this task" on device B, then check device A shows the change.
