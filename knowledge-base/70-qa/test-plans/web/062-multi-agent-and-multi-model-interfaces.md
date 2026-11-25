---
id: "PLAN-web-062"
type: "test-plan"
title: "Web · 62. Multi-agent and multi-model interfaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "62"
---
# Web · 62. Multi-agent and multi-model interfaces

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S62.09 Concurrent task view.

- **Expected:** The user can watch several running tasks or agents at once in one view.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:71; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:247; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120 (quoted code not found in the file now)
- **Where to find it:** Settings > Notifications > Manage tasks (opens Work history, the /tasks page). The page title is Work history; the default filter is Active and the default layout is List. Home > Work history appears only when there are more than 5 active runs. (labels found in the code)
- **Needs:** An account with two or more Cloud work sessions running or active at the same time.
- **Steps:**
  1. Sign in and open Settings, then open the Notifications section.
  2. Find the row titled Scheduled task finished and click Manage tasks.
  3. On the Work history page, keep the filter on Active and the layout on List.
  4. Look at the list: each running session should appear as its own row with its state label, and several rows can show running states at the same time.
  5. Click Board in the Task layout control and compare the same sessions in the board view.

## S62.10 Needs-input prioritization.

- **Expected:** Tasks or agents that need the user's input are surfaced first.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:72; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:235
- **Where to find it:** Work history > filter Needs you (also: the Active list puts sessions that need input first). (labels found in the code)
- **Needs:** At least one session that is waiting for input or approval, and one that is running, if possible.
- **Steps:**
  1. Open Work history as in S62.09.
  2. Keep the filter on Active and look at the top rows of the list.
  3. Sessions that are waiting for you (awaiting input, awaiting approval or paused) should be listed above the others.
  4. Click Needs you in the filter control and check that only those waiting sessions are shown.
  5. Compare with Expected: waiting sessions come first and can be filtered alone.

## S62.11 Inline unblock response.

- **Expected:** The user can unblock a waiting task or agent inline without leaving the overview.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:891; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:477; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:140
- **Where to find it:** Work history > click a session row (View details for <title>) > Approve or Deny in the Waiting for your approval card. A paused session shows a Resume button in the same panel. (labels found in the code)
- **Needs:** A Cloud work session that is waiting for a tool approval, or is paused.
- **Steps:**
  1. Open Work history and click a session that is waiting for approval.
  2. In the details panel, read the Waiting for your approval card and the listed tool calls.
  3. Optionally type in the box Tell the agent what to change when it resumes (optional) or Add guidance to steer this run (optional).
  4. Click Approve (or Deny) and watch the card show a spinner, then leave the card.
  5. Check that the page stayed on Work history and the session state changed. For a paused session, click Resume.

## S62.12 Full-transcript drill-down.

- **Expected:** From an overview the user can drill into the full transcript of a task.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:789; apps/web/features/tasks/components/TasksPage.tsx:39
- **Where to find it:** Work history > click a session row > Open source chat, in the details panel. (labels found in the code)
- **Needs:** A Cloud work session that was started from a chat (so it has a source chat).
- **Steps:**
  1. Open Work history and click a session row to open its details panel.
  2. Read the panel sections: Task goal, Task plan and Latest output or Result.
  3. Find the button Open source chat (it shows only when the session has a source chat).
  4. Click Open source chat.
  5. Compare with Expected: the chat opens on its full conversation at /chat/<id>, showing the messages of that task.

## S62.17 Interactive branch.

- **Expected:** The user can branch the conversation from a point and continue interactively in the branch.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3932; apps/web/features/chat/pages/WebChatPage.tsx:7752; apps/web/features/chat/hooks/use-conversation-branches.ts:109
- **Where to find it:** Chat > open an existing chat > move the pointer over an assistant reply and click the Branch conversation from here icon (tooltip Branch conversation: this chat stays unchanged). User messages have the same action in More message actions. (labels found in the code)
- **Needs:** A Free or paid account with a chat that has at least one reply.
- **Steps:**
  1. Open an existing chat with at least one reply from the assistant.
  2. Move the pointer over the reply (on touch, tap it) to show its action buttons.
  3. Click the branch icon, with the tooltip Branch conversation: this chat stays unchanged.
  4. Wait for the toast Conversation branch created and the new chat page to open.
  5. Type a new message in the new chat and compare with Expected: the original chat stays unchanged and the new chat continues from that point.
