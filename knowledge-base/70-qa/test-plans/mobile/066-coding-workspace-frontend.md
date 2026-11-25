---
id: "PLAN-mobile-066"
type: "test-plan"
title: "Mobile · 66. Coding-workspace frontend"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "66"
---
# Mobile · 66. Coding-workspace frontend

9 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S66.05 Coding-session list.

- **Expected:** The user sees a list of their coding sessions and can open one.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:74 (quoted code not found in the file now); apps/mobile/src/features/companion/remote-code/service.ts:31
- **Where to find it:** Side menu > AGI Code > tap a session row (labels found in the code)
- **Needs:** a paired computer with at least one coding session, or a cloud session
- **Steps:**
  1. Open the side menu on the first screen after sign-in.
  2. Tap AGI Code.
  3. Look for a list of sessions. Each row shows a title, a status badge, and a line with the time and a location such as On <computer name> or In the cloud.
  4. Tap one session. Its page should open, with the session title at the top.

## S66.06 Coding-session title.

- **Expected:** Each coding session shows a readable title, and the user can rename it where the surface offers renaming.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:105 (quoted code not found in the file now); apps/mobile/src/features/companion/remote-code/service.ts:35
- **Where to find it:** Side menu > AGI Code > tap a session > title at the top of the page (labels found in the code)
- **Needs:** a paired computer with at least one coding session, or a cloud session
- **Steps:**
  1. Open the side menu and tap AGI Code.
  2. Read the title on each session row.
  3. Tap a session and read the title in the header. It should match the row.
  4. If the title is empty, the header shows AGI Code instead.

## S66.07 Session status.

- **Expected:** Each coding session shows whether it is running, waiting for approval, idle, failed or closed.
- **Code:** done. Evidence present: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:142
- **Where to find it:** Side menu > AGI Code > badge on each row, and the badge next to the title inside a session (labels found in the code)
- **Needs:** a paired computer with coding sessions in different states, or cloud sessions
- **Steps:**
  1. Open the side menu and tap AGI Code.
  2. Read the badge on each computer session row: Idle, Running, Needs approval, Failed or Unknown.
  3. Read the badge on each cloud session row: Ready, Running a command, Provisioning, Needs attention or Closed.
  4. Tap a session. A spinner shows while it runs; a badge shows for Needs approval or Failed. Compare with Expected.

## S66.17 Command-history view.

- **Expected:** The user can review the commands run in the session with their output and exit status.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:61 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:1166
- **Where to find it:** Side menu > AGI Code > open a cloud session > Changes icon (top right) > Commands. For a computer session, tap the Ran N steps row in the transcript. (labels found in the code)
- **Needs:** a session where commands have run
- **Steps:**
  1. Open the side menu and tap AGI Code.
  2. Open a cloud session that has run commands, then tap the Changes icon at the top right.
  3. Scroll to the Commands section. Each entry shows the command with a $ prefix, its output, and exit N.
  4. For a computer session, tap the Ran N steps row in the transcript to expand the steps. Compare with Expected.

## S66.18 Diff viewer.

- **Expected:** The user views a line-level diff of the changes the agent made.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:334 (quoted code not found in the file now)
- **Where to find it:** Side menu > AGI Code > open a computer session > Changes pill under the transcript. For a cloud session, Changes icon at the top right. (labels found in the code)
- **Needs:** a session in which the agent changed files
- **Steps:**
  1. Open the side menu and tap AGI Code.
  2. Open a session where files changed.
  3. Tap the Changes pill under the transcript (cloud sessions: the Changes icon at the top right).
  4. Scroll to a file's diff. Added and removed lines should appear marked inside that file's section. Compare with Expected.

## S66.19 File-change summary.

- **Expected:** The user sees a summary of which files the session created, modified or deleted.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:82 (quoted code not found in the file now)
- **Where to find it:** Side menu > AGI Code > open a computer session > Changes pill > Files (labels found in the code)
- **Needs:** a paired computer with a session in which files were created or changed
- **Steps:**
  1. Open the side menu and tap AGI Code.
  2. Open a computer session where files changed.
  3. Tap the Changes pill under the transcript.
  4. Look at the Files section: each file path is listed. Created files show a New file label, and modified files show an edit icon. Compare with Expected.

## S66.28 Usage/cost indicator.

- **Expected:** The coding surface shows how much plan usage or money the user has spent.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:108 (quoted code not found in the file now); apps/mobile/src/features/cloud-code/components/CloudCodeTaskOptionsSheet.tsx:222
- **Where to find it:** Side menu > AGI Code > open a cloud session > the Task options control under the message box. For a computer session: More about this session (top right) > Plan usage. (labels found in the code)
- **Needs:** a signed-in account with a cloud session
- **Steps:**
  1. Open the side menu and tap AGI Code, then open a cloud session.
  2. Tap the small control under the message box (accessibility name: Task options and usage).
  3. Read the Usage section in Task options: Context window and usage buckets with percentages, plus See detailed usage.
  4. For a computer session, tap the More about this session icon at the top right and choose Plan usage. Compare with Expected.

## S66.38 Test-results panel.

- **Expected:** The workspace shows the results of test runs (pass/fail, counts, failing output).
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:272 (quoted code not found in the file now)
- **Where to find it:** Side menu > AGI Code > open a computer session where tests ran > Tests passed or Tests failed pill under the transcript > Test results (labels found in the code)
- **Needs:** a paired computer with a session in which tests were run
- **Steps:**
  1. Open the side menu and tap AGI Code.
  2. Open a computer session where tests were run.
  3. Read the Tests passed or Tests failed text in the pill under the transcript.
  4. Tap the pill. Under Test results, check each command, its Passed or Failed badge, the counts such as N passed · N failed, and the output of a failed run.
  5. Compare with Expected.

## S66.41 Continue in another client.

- **Expected:** The user moves an ongoing coding session to another client (terminal, editor, desktop, phone) and continues it there.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:89 (quoted code not found in the file now); apps/mobile/src/features/companion/remote-code/service.ts:42
- **Where to find it:** not found in the code. Searched apps/mobile for continue, handoff, hand off, open on, pick up and move session in the cloud-code and companion folders. The only match is the text You can continue here, which refers to the same session. The More menu item This computer only opens the companion screen and does not move the session. No way to continue in another client was found.
