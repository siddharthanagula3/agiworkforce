---
id: "PLAN-mobile-062"
type: "test-plan"
title: "Mobile · 62. Multi-agent and multi-model interfaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "62"
---
# Mobile · 62. Multi-agent and multi-model interfaces

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S62.04 Model labels.

- **Expected:** Each participating agent or model is labelled with the model it runs on.
- **Code:** done. Evidence moved: apps/mobile/src/features/compare/index.tsx:557; apps/mobile/src/features/compare/index.tsx:497; apps/mobile/src/features/compare/index.tsx:191 (quoted code not found in the file now)
- **Where to find it:** Chat > type "/" in the message box > "compare" > the "Compare Models" screen, read the two model pills at the top (name, then provider name under it) (labels found in the code)
- **Needs:** an AGI Cloud account, signed in, on a plan that has at least two cloud models
- **Steps:**
  1. Sign in and switch the chat to AGI Cloud mode (Local Mode shows a notice and no compare command).
  2. In the message box type "/" and tap "compare" in the list that appears.
  3. On the "Compare Models" screen, look at the pill labelled A and the pill labelled B, separated by "vs".
  4. Check that each pill shows a model name and, under it, the provider name, and compare with Expected.

## S62.05 Per-agent status.

- **Expected:** The view shows the live status of each participating agent or model.
- **Code:** done. Evidence moved: apps/mobile/src/features/compare/index.tsx:659; apps/mobile/src/features/compare/index.tsx:497; apps/mobile/src/features/compare/index.tsx:191 (quoted code not found in the file now)
- **Where to find it:** Chat > type "/" > "compare" > type a prompt and tap send > watch panel A and panel B on the "Compare Models" screen (labels found in the code)
- **Needs:** an AGI Cloud account, signed in, with two cloud models
- **Steps:**
  1. Open "compare" from the "/" list as in S62.04.
  2. Type a short prompt in the message box and send it.
  3. Watch each panel while it works: the panel shows "Generating..." while its model is streaming.
  4. When an answer finishes, check the panel shows its status (ms to first token, approximate tokens, total time) and compare with Expected.

## S62.06 Per-agent transcript.

- **Expected:** The user can read each participating agent's own transcript.
- **Code:** done. Evidence moved: apps/mobile/src/features/compare/index.tsx:663; apps/mobile/src/features/compare/index.tsx:191 (quoted code not found in the file now)
- **Where to find it:** Chat > type "/" > "compare" > send a prompt > read the text inside panel A and panel B on the "Compare Models" screen (labels found in the code)
- **Needs:** an AGI Cloud account, signed in, with two cloud models
- **Steps:**
  1. Open "compare" from the "/" list.
  2. Send a prompt and wait until both panels stop showing "Generating...".
  3. Scroll the screen and read the answer text inside panel A, then inside panel B.
  4. Check that each panel shows only its own model's answer and compare with Expected.

## S62.07 Per-agent result.

- **Expected:** Each participating agent's result is shown separately.
- **Code:** done. Evidence moved: apps/mobile/src/features/compare/index.tsx:663; apps/mobile/src/features/compare/index.tsx:247 (quoted code not found in the file now)
- **Where to find it:** Chat > type "/" > "compare" > send a prompt > read each panel's result and the "Faster" or "tie" tag on the "Compare Models" screen (labels found in the code)
- **Needs:** an AGI Cloud account, signed in, with two cloud models
- **Steps:**
  1. Open "compare" from the "/" list and send one prompt.
  2. Wait until both panels finish.
  3. Read panel A and panel B separately, each with its own answer.
  4. Look for the "Faster" badge on one panel or "tie" in the model pills, and compare with Expected.

## S62.09 Concurrent task view.

- **Expected:** The user can watch several running tasks or agents at once in one view.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/CloudTasksScreen.tsx:695; apps/mobile/src/features/tasks/service.ts:45
- **Where to find it:** AGI Work (drawer) > Filter chip "Running" > task cards in one list, grouped under "Today", "Yesterday", "This Week" or "Older" (labels found in the code)
- **Needs:** an AGI Cloud account with AGI Work, and two or more tasks running at once
- **Steps:**
  1. Open the side menu and tap "AGI Work" (shown only in AGI Cloud mode on a plan that includes AGI Work).
  2. Start two or more tasks, or use tasks already running.
  3. Tap the filter chip "Running" to see only running tasks.
  4. Check that several running tasks appear together in the list, each with its state label, and compare with Expected.

## S62.10 Needs-input prioritization.

- **Expected:** Tasks or agents that need the user's input are surfaced first.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/runPresentation.ts:23; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:695; apps/mobile/src/features/tasks/service.ts:45
- **Where to find it:** AGI Work (drawer) > filter chip "Needs you" (labels found in the code)
- **Needs:** an AGI Cloud account with AGI Work, and at least one task waiting for input or approval
- **Steps:**
  1. Open the side menu and tap "AGI Work".
  2. Tap the filter chip "Needs you" to show only tasks that wait for you.
  3. Check that tasks in "Waiting for input" or waiting for approval are listed, and compare with Expected.

## S62.11 Inline unblock response.

- **Expected:** The user can unblock a waiting task or agent inline without leaving the overview.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:428; apps/mobile/src/features/tasks/service.ts:64
- **Where to find it:** AGI Work (drawer) > tap a task card that is waiting > in the detail sheet, answer with "Send answer" or tap "Approve" or "Deny" (labels found in the code)
- **Needs:** an AGI Cloud account with AGI Work, and a task waiting for input or for approval
- **Steps:**
  1. Open "AGI Work" from the side menu and tap the filter chip "Needs you".
  2. Tap a task card that shows a waiting state.
  3. If the sheet shows "Waiting for your approval", tap "Approve" or "Deny". If it shows an input form, fill it and tap "Send answer".
  4. Check that the task updates while you are still on the task list behind the sheet, and compare with Expected.

## S62.12 Full-transcript drill-down.

- **Expected:** From an overview the user can drill into the full transcript of a task.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:583; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:595
- **Where to find it:** AGI Work (drawer) > tap a task card > in the detail sheet scroll to "Latest output" and "Activity" (labels found in the code)
- **Needs:** an AGI Cloud account with AGI Work, and a task that has run
- **Steps:**
  1. Open "AGI Work" from the side menu.
  2. Tap any task card.
  3. Scroll the detail sheet to the section "Latest output" and then to "Activity".
  4. Check that the task's output and activity lines match the task's history, and compare with Expected.

## S62.19 Model-comparison view.

- **Expected:** The user can open a view that runs one prompt on several models side by side.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:1577; apps/mobile/src/features/compare/index.tsx:497; apps/mobile/src/features/compare/index.tsx:191 (quoted code not found in the file now)
- **Where to find it:** Chat > type "/" in the message box > "compare" > the "Compare Models" screen with two model panels (labels found in the code)
- **Needs:** an AGI Cloud account, signed in
- **Steps:**
  1. Sign in and switch to AGI Cloud mode.
  2. Type "/" in the message box; the command list appears.
  3. Tap "compare".
  4. Check that the "Compare Models" screen opens with two model pills, A and B, and a message box, and compare with Expected.

## S62.20 Independent parallel answers.

- **Expected:** Each model answers the same prompt independently and in parallel.
- **Code:** done. Evidence moved: apps/mobile/src/features/compare/index.tsx:497; apps/mobile/src/features/compare/index.tsx:191 (quoted code not found in the file now); apps/mobile/src/features/compare/index.tsx:247 (quoted code not found in the file now)
- **Where to find it:** Chat > type "/" > "compare" > type a prompt and send > both panels show "Generating..." together on the "Compare Models" screen (labels found in the code)
- **Needs:** an AGI Cloud account, signed in; a plan that allows two answers at once to see true parallel answers
- **Steps:**
  1. Open "compare" from the "/" list.
  2. Type one prompt and tap send.
  3. Check that panel A and panel B both show "Generating..." at the same time.
  4. On a plan that allows one answer at a time, check that panel B shows "Your plan runs one answer at a time, so the second waits for the first." instead, and compare with Expected.

## S62.26 Selected model set.

- **Expected:** The user chooses which set of models takes part in the comparison.
- **Code:** done. Evidence present: apps/mobile/src/features/compare/index.tsx:557; apps/mobile/src/features/compare/index.tsx:347
- **Where to find it:** Chat > type "/" > "compare" > tap the model pill A or B on the "Compare Models" screen > choose a model in the picker sheet (labels found in the code)
- **Needs:** an AGI Cloud account, signed in, with at least two cloud models
- **Steps:**
  1. Open "compare" from the "/" list.
  2. Tap the pill labelled A (or B) at the top of the screen.
  3. A model picker sheet opens; choose another model.
  4. Check that the pill now shows the new model's name and that the choice is kept for the next prompt, and compare with Expected.
