---
id: "PLAN-desktop-062"
type: "test-plan"
title: "Desktop · 62. Multi-agent and multi-model interfaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "62"
---
# Desktop · 62. Multi-agent and multi-model interfaces

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S62.09 Concurrent task view.

- **Expected:** The user can watch several running tasks or agents at once in one view.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:71; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:247; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120 (quoted code not found in the file now)
- **Where to find it:** Command+K (Ctrl+K on Windows) > type "Work history" > Work history. Then look at the list (the default filter is "Active"); "Board" is the second layout button, next to the "List" one. (labels found in the code)
- **Needs:** two or more Work tasks running or queued at the same time
- **Steps:**
  1. Press Command+K to open the command palette, then type "Work history" in the "Search chats and actions" box and press Enter on the "Work history" result.
  2. On the Work history page, keep the filter on "Active" and check that each running or queued Work task has its own row, with a small live dot on the running ones.
  3. Click the "Board" button in the layout control at the top right of the list.
  4. Compare the rows or cards: several running tasks should be visible together in one view, not one at a time.

## S62.10 Needs-input prioritization.

- **Expected:** Tasks or agents that need the user's input are surfaced first.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:72; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:235
- **Where to find it:** Work history > filter "Needs you" (or the unfiltered list, where these tasks are placed first) (labels found in the code)
- **Needs:** one Work task that is waiting for approval and one that is still running
- **Steps:**
  1. Start two Work tasks, one that will ask for approval and one that keeps running, then open Work history from Command+K > "Work history".
  2. With the filter on "Active", look at the top of the list: a task waiting for approval or paused should appear above the running ones.
  3. Click the "Needs you" button in the filter control at the top of the list.
  4. Compare: only tasks that need your input should be shown, and they should be the first rows.

## S62.11 Inline unblock response.

- **Expected:** The user can unblock a waiting task or agent inline without leaving the overview.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:891; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:477; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:140
- **Where to find it:** Work history > a task card showing "Waiting for your approval" > Approve or Deny buttons on that card (labels found in the code)
- **Needs:** a Work task that is waiting for your approval
- **Steps:**
  1. Open Work history (Command+K > "Work history") and keep the list on the first page.
  2. Find the task whose card says "Waiting for your approval". Optionally type a note in the box "Guidance for this work session".
  3. Click "Approve" (or "Deny") on that card, without opening the task details.
  4. Compare: the card should show a short busy spinner, then the task should move on, and you should still be on the Work history list.

## S62.12 Full-transcript drill-down.

- **Expected:** From an overview the user can drill into the full transcript of a task.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:789; apps/web/features/tasks/components/TasksPage.tsx:39
- **Where to find it:** Work history > click a task row > "Task details" panel > "Open source chat" (labels found in the code)
- **Needs:** a Work task that has already run, ideally one with more than 4,000 events
- **Steps:**
  1. Open Work history and click the title of any task row (it has an "View details for" label for screen readers).
  2. On the right, the "Task details" panel opens with the goal, the plan, the latest output or result, and the activity list.
  3. Scroll the panel to the bottom and read the note about events; if it says "Showing the first 4,000 events", click "Open source chat".
  4. Compare: the chat that ran the task should open and show the conversation the task came from.

## S62.17 Interactive branch.

- **Expected:** The user can branch the conversation from a point and continue interactively in the branch.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3932; apps/web/features/chat/pages/WebChatPage.tsx:7752; apps/web/features/chat/hooks/use-conversation-branches.ts:109
- **Where to find it:** Chat > open a conversation with an answer > hover under an assistant reply and click the branch icon (tooltip "Branch conversation: this chat stays unchanged"); or the conversation's "Conversation options" menu > "Duplicate as branch" (labels found in the code)
- **Needs:** a conversation with at least one reply
- **Steps:**
  1. Open a conversation that has at least two messages and one assistant reply.
  2. Hover under the assistant reply and click the icon button labelled "Branch conversation from here" (or click "More message actions" on a user message and choose "Branch conversation from here").
  3. Wait for the toast "Conversation branch created"; the app opens the new chat.
  4. Type a new message in the new chat and send it, then go back to the original chat.
  5. Compare: the new branch should continue on its own and the original chat should be unchanged. The arrows "Previous branch" and "Next branch" should move between versions.
