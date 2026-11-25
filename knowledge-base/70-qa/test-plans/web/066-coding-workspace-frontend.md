---
id: "PLAN-web-066"
type: "test-plan"
title: "Web · 66. Coding-workspace frontend"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "66"
---
# Web · 66. Coding-workspace frontend

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S66.01 Repository picker.

- **Expected:** The user chooses which repository or folder a coding session works on before it starts.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Earlier check in the running app:** UI_ONLY: E055 [UI_ONLY; coding home and repository form]: AGI Code opens cloud isolated task composer, repository picker, branch field, approvals/model controls. No repository connected and no coding runtime executed; cannot infer execution works from shell.
- **Where to find it:** Code > new session composer > "Select repository" chip > "Repository URL" or the list, then "Use this repository" (labels found in the code)
- **Needs:** a GitHub App installation or a public GitHub repository URL; a cloud sandbox may not start until the deployment gate in the plan is switched on
- **Steps:**
  1. Sign in and open Code (the /code page).
  2. In the new-session composer, click the "Select repository" chip.
  3. Pick a repository from the list, or click "Use a repository URL instead" and type an owner/repository URL.
  4. Click "Use this repository".
  5. Look for the chosen repository name on the composer chip and compare with Expected (the repository is chosen before the session starts).

## S66.02 Branch picker.

- **Expected:** The user chooses the git branch a coding session starts from or works on.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Earlier check in the running app:** UI_ONLY: E055 [UI_ONLY; coding home and repository form]: AGI Code opens cloud isolated task composer, repository picker, branch field, approvals/model controls. No repository connected and no coding runtime executed; cannot infer execution works from shell.
- **Where to find it:** Code > new session composer > "Select repository" > "Branch" field, or "Change the branch" > "Use this branch" (labels found in the code)
- **Needs:** a repository already chosen (see S66.01)
- **Steps:**
  1. Open Code and choose a repository as in S66.01.
  2. Read the "Branch" field, or click the branch chip and choose a branch from the "Branches" list.
  3. Type a branch name in "Search or type a branch name" if needed, then click "Use this branch".
  4. Compare the branch shown on the chip with Expected (the session starts from that git branch).

## S66.04 Local/cloud execution selector.

- **Expected:** Before starting, the user chooses whether the coding session runs locally or in a cloud sandbox.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > new session composer > environment chip > "Local" or "Cloud" (labels found in the code)
- **Needs:** a Desktop folder for the Local option; a signed-in account for Cloud
- **Steps:**
  1. Open Code and look at the new-session composer.
  2. Click the environment chip (it shows "Cloud" or "Local" with the network mode).
  3. In the menu, choose "Local" (runs in a chosen folder on this computer) or "Cloud" (runs in an isolated cloud sandbox).
  4. Check that the chip now shows the choice, and compare with Expected (chosen before the session starts).

## S66.05 Coding-session list.

- **Expected:** The user sees a list of their coding sessions and can open one.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > left list "Cloud sessions" (sessions group) > click a session title (labels found in the code)
- **Needs:** at least one earlier cloud session (empty state shows "No cloud sessions yet.")
- **Steps:**
  1. Open Code.
  2. Look at the session list on the left under "Cloud sessions".
  3. Use the "Filter sessions" menu or "Search sessions" to narrow the list if needed.
  4. Click a session title to open it.
  5. Compare the list and the opened session with Expected (a list of the user's sessions that can be opened).

## S66.06 Coding-session title.

- **Expected:** Each coding session shows a readable title, and the user can rename it where the surface offers renaming.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > open a session > "Session actions" icon menu > "Rename" > type title > "Rename the session" (labels found in the code)
- **Needs:** a cloud session you can open
- **Steps:**
  1. Open a cloud session from the session list.
  2. Click the session actions button at the top of the session (it has no visible text; its accessible name is "Session actions").
  3. Click "Rename".
  4. Type a new title in the "Session title" field and click "Rename the session" (or "Keep the current title" to cancel).
  5. Compare the title shown in the list and header with Expected (a readable title that can be renamed).

## S66.07 Session status.

- **Expected:** Each coding session shows whether it is running, waiting for approval, idle, failed or closed.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > left list ("Cloud sessions") > group headings "Running", "Ready", "Idle", and the "Open" badge; closed sessions show the banner "This session is closed." (labels found in the code)
- **Needs:** sessions in different states (a running one is hard to set up on demand)
- **Steps:**
  1. Open Code and look at the session list.
  2. Find sessions under the group heading "Ready" or "Idle", and any running dot labelled "Running".
  3. Open a session and read its status line or banner.
  4. Compare with Expected (running, waiting for approval, idle, failed or closed).

## S66.15 Integrated terminal.

- **Expected:** The user runs shell commands in a terminal attached to the coding session and sees their output.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > open a cloud session > "Changes" panel > "Terminal" section > "Command" field > "Run" (labels found in the code)
- **Needs:** a cloud session with its environment running
- **Steps:**
  1. Open a cloud session.
  2. Open the "Changes" panel.
  3. Scroll to the "Terminal" section.
  4. Type a short command (for example ls) in the "Command" field and click "Run".
  5. Compare the output that appears in the Terminal with Expected (the command output is shown in the session).

## S66.17 Command-history view.

- **Expected:** The user can review the commands run in the session with their output and exit status.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > open a cloud session > "Changes" panel > "Terminal" section (list of commands) and the "Show exit codes" toggle (labels found in the code)
- **Needs:** a session where commands have already run
- **Steps:**
  1. Open a cloud session that has run a command (the Terminal section says "No commands have run in this session." when empty).
  2. Open the "Changes" panel and go to "Terminal".
  3. Turn on "Show exit codes" if you want exit status shown.
  4. Compare the commands, their output and the exit status with Expected.

## S66.18 Diff viewer.

- **Expected:** The user views a line-level diff of the changes the agent made.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > open a cloud session > "Changes" panel > click a changed file (labels found in the code)
- **Needs:** a session where the agent changed files
- **Steps:**
  1. Open a cloud session that has changed files.
  2. Open the "Changes" panel and click a file in the list.
  3. Read the line-by-line diff shown for that file (added and removed lines).
  4. Compare with Expected (a line-level diff of the agent's changes).

## S66.19 File-change summary.

- **Expected:** The user sees a summary of which files the session created, modified or deleted.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > open a cloud session > "Changes" panel (heading "Changes", count "N added, M removed", then a row per file with its state) (labels found in the code)
- **Needs:** a session where files were created, modified and deleted
- **Steps:**
  1. Open a cloud session that has changed files.
  2. Open the "Changes" panel.
  3. Read the count line "N added, M removed" and the state word on each file row (Added, Modified, Deleted, Renamed, Untracked or Conflicted).
  4. Compare which files are shown and their state with Expected (created, modified or deleted files).

## S66.25 Edit/agent mode.

- **Expected:** The user chooses a mode in which the agent may edit files and run tools on its own (edit/agent mode) versus asking first.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > new session or open session > composer "Mode" control (the approval control, labelled "Approval mode") > choose one of "Ask before every action", "Run read-only actions without asking", "Skip approvals" or "Plan" (labels found in the code)
- **Needs:** none for reading the options; a running session is needed to see the effect
- **Steps:**
  1. Open Code and look at the composer below the message box.
  2. Click the approval/mode control (accessible name "Approval mode"; it shows "Plan" or the short label Ask, Auto or Skip).
  3. Under the heading "Mode", read the options and their hints.
  4. Pick one, then compare the choice and its hint with Expected (agent may act on its own, or asks first).

## S66.26 Permission-mode control.

- **Expected:** The user sets how much the agent must ask before acting (ask every time / auto-approve safe / autonomous), and the running session honours it.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Earlier check in the running app:** UI_ONLY: E056 [UI_ONLY; Approval and network mode controls; runtime enforcement not exercised]: Isolated, Trusted hosts and Full internet choices visible. Kept Isolated; no security setting changed and no network isolation enforcement claim.
- **Where to find it:** Code > composer "Approval mode" control > "Ask before every action" / "Run read-only actions without asking" / "Skip approvals"; network choice "Isolated", "Trusted hosts", "Full internet" in the environment settings (labels found in the code)
- **Needs:** a running cloud or local session; a task that uses tools
- **Steps:**
  1. Open the composer approval control and pick one option, for example "Ask before every action".
  2. Start a task that needs a tool or a write, and see whether the agent waits for an approval card.
  3. Change the option to "Skip approvals" and start another task.
  4. Compare what the agent does with Expected (the chosen mode is honoured while the session runs).

## S66.27 Context-usage indicator.

- **Expected:** The workspace shows how much of the model's context window the session has used.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > composer > the small usage ring (button named "Usage") > popover "Context window" (labels found in the code)
- **Needs:** a session with some messages so a context figure exists
- **Steps:**
  1. Open a session in Code and type in the composer.
  2. Look for the small ring icon near the composer (its accessible name is "Usage").
  3. Click it and read the "Context window" value.
  4. Compare the used amount with Expected (how much of the model context is used).

## S66.28 Usage/cost indicator.

- **Expected:** The coding surface shows how much plan usage or money the user has spent.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeComposer.tsx:1521; apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Code > composer "Usage" button > popover "Plan usage limits" ("Five hour limit", "Weekly, all models", "Weekly, top model"); also the Usage settings page (labels found in the code)
- **Needs:** a signed-in account on a paid plan (the popover hides plan usage heading for free plans)
- **Steps:**
  1. Open Code and find the "Usage" button in the composer.
  2. Click it to open the popover.
  3. Read "Plan usage limits" and the "Five hour limit" and "Weekly, all models" figures.
  4. Click "See detailed breakdown" if you want more detail.
  5. Compare the figures with Expected (plan usage or money spent is shown).

## S66.36 Pull-request panel.

- **Expected:** The workspace shows the session's pull request (open one, see its number/link and state).
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > open a cloud session > "Changes" panel > "Create pull request"; then the pull-request area shows status (labels found in the code)
- **Needs:** a repository, a working branch and a GitHub connection; the feature is gated by the deployment (see the plan's switch-on note)
- **Steps:**
  1. Open a session that has a repository and a working branch.
  2. Open the "Changes" panel and click "Create pull request".
  3. Wait for "Opening the pull request" to finish, then look for the pull request state (Merged, Closed without merging, Checks passing, Checks failing, Checks running).
  4. Compare the number, link and state with Expected (session's pull request is shown).

## S66.40 Share session.

- **Expected:** The user shares a coding session with someone else, who can open it.
- **Code:** done. Evidence present: apps/web/features/code/SharedCodeSessionPage.tsx:136; apps/web/lib/services/cloud-code-session-sharing.ts:108
- **Where to find it:** Code > open a cloud session > "Session actions" icon menu > "Share" > dialog "Share session" > "Who can open this session" (Private, Team, Public) > "Done" (labels found in the code)
- **Needs:** a second account in the same workspace for Team, or any second signed-in account for Public
- **Steps:**
  1. Open a cloud session.
  2. Click the session actions button (accessible name "Session actions"), then click "Share".
  3. In the "Share session" dialog, pick "Team" or "Public" under "Who can open this session".
  4. Copy the link from the "Session link" field (copy button under the link).
  5. Open the link in a private window signed in as another account and check that the session opens (the shared page is at /code/shared/[token]).
  6. Compare with Expected (the other person can open it).
