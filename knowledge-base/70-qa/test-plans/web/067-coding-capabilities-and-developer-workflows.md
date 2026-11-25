---
id: "PLAN-web-067"
type: "test-plan"
title: "Web · 67. Coding capabilities and developer workflows"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "67"
---
# Web · 67. Coding capabilities and developer workflows

29 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S67.01 Explain repository structure.

- **Expected:** The agent reads the repository and explains its structure: main parts, entry points, how they fit.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar.
  2. Click "Change repository" and choose a repository you can reach.
  3. Type "Explain the structure of this repository: main parts, entry points and how they fit" and send it.
  4. Check the reply names the main folders, the entry points and how they connect, as Expected says.

## S67.02 Find implementations.

- **Expected:** Asked where something is implemented, the agent finds the defining code and cites file and line.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Where is <a function or type name from the repo> implemented? Give the file and line." and send it.
  3. Open the file and line the reply names and check the definition is really there.

## S67.03 Find references.

- **Expected:** Asked where a symbol is used, the agent finds its references across the repository.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Where is <a symbol name> used across this repository? List every reference." and send it.
  3. Check the reply lists references from more than one file, as Expected says.

## S67.04 Trace call paths.

- **Expected:** The agent traces how a call flows through the code from entry point to effect.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Trace how a request to <an endpoint or feature> flows from its entry point to its effect." and send it.
  3. Check the reply walks through the files in order, from entry point to effect.

## S67.05 Answer repository questions.

- **Expected:** The agent answers free-form questions about the repository by reading its files.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type a free question about the repo, for example "How do users sign in here?", and send it.
  3. Check the answer cites files from the repository.

## S67.06 Implement a feature.

- **Expected:** Given a feature request, the agent edits and creates files in the repository to implement it.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" > open "Changes" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type a small feature request and send it.
  3. When the turn ends, open "Changes" and look for the new or edited files.
  4. Check the files match the feature asked for, as Expected says.

## S67.07 Fix a defect.

- **Expected:** Given a defect, the agent finds the cause and edits the code to fix it.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" > open "Changes" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Describe a defect in one sentence, for example "Clicking Save twice creates two records. Find the cause and fix it." and send it.
  3. Open "Changes" and check the edited file contains the fix.
  4. Compare the reply's stated cause with the diff.

## S67.08 Refactor code.

- **Expected:** The agent restructures existing code across files without changing behaviour.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" > open "Changes" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Refactor <a named module> to <goal> without changing behaviour." and send it.
  3. Open "Changes" and read the edited files.
  4. Ask the agent to run the tests, then check they still pass.

## S67.09 Generate tests.

- **Expected:** The agent writes new test files or cases for existing code.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" > open "Changes" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Write tests for <an existing function> covering success and failure." and send it.
  3. Open "Changes" and check a new test file or new test cases appear.
  4. Run them as in S67.10 and check they execute.

## S67.10 Run tests.

- **Expected:** The agent runs the project's test suite and reports the result.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question"; or open "Terminal" and type a command in "Run a command" then "Run" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Run the project's test suite and report the result." and send it.
  3. Or open "Terminal", type the test command in "Run a command" and click "Run".
  4. Check the reply or the output reports the pass and fail counts from the suite.

## S67.11 Interpret test failures.

- **Expected:** After a test run fails, the agent reads the failure output and explains or fixes the cause.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" (after a failing run) (labels found in the code)
- **Needs:** a repository with a failing test (Cloud) or a Local folder on the desktop app
- **Steps:**
  1. After a test run fails, look at the failure output in "Terminal".
  2. Type "Explain why the last test run failed and fix the cause." in "Describe a task or ask a question" and send it.
  3. Check the reply quotes the failing test and names the cause.
  4. Re-run the tests to see whether the fix works.

## S67.12 Run type checking.

- **Expected:** The agent runs the project's type checker and reports errors.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Run the project's type checker and list every error." and send it.
  3. Check the reply reports the type checker output, errors included.

## S67.13 Run linting.

- **Expected:** The agent runs the project's linter and reports findings.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Run the project's linter and report every finding." and send it.
  3. Check the reply lists the linter findings with their files.

## S67.14 Build applications.

- **Expected:** The agent builds the application with the project's build command.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Build the application with the project's build command and report the result." and send it.
  3. Check the reply states whether the build passed, and shows the build output if it failed.

## S67.20 Review code changes.

- **Expected:** The agent reviews the current code changes and reports issues with file/line references.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > open a session with changes > type "/review" in "Describe a task or ask a question" (labels found in the code)
- **Needs:** a session with changes in a repository (Cloud), or a Local session with changes
- **Steps:**
  1. Click "Code" in the sidebar and open a session that has changes.
  2. Click the composer, type "/" and choose "/review" ("Review the changes in this session for bugs").
  3. Send it and wait for the reply.
  4. Check the reply lists issues with file and line references.

## S67.21 Review pull requests.

- **Expected:** The agent reviews a pull request (fetches its diff) and posts or shows review findings.
- **Code:** done. Evidence moved: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:987; apps/web/app/api/github/webhook/route.ts:236 (quoted code not found in the file now); apps/web/app/api/github/webhook/route.ts:299
- **Where to find it:** Settings > Connectors > GitHub > "Review pull requests" (turn on for the account); or comment "@agi-workforce review" on a pull request in a connected repository on GitHub (labels found in the code)
- **Needs:** a GitHub account with the app installed on a repository, and a pull request
- **Steps:**
  1. Open Settings, then Connectors, then the GitHub card.
  2. Turn on "Review pull requests" for the account you want.
  3. Open a pull request in that repository on GitHub, or comment "@agi-workforce review" on it.
  4. Check a review comment appears on the pull request with findings.

## S67.22 Scan for security problems.

- **Expected:** The agent scans the code for security problems and reports them.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > open a session with changes > type "/security-review" in "Describe a task or ask a question" (labels found in the code)
- **Needs:** a session with changes (Cloud), or a Local session with changes
- **Steps:**
  1. Click "Code" in the sidebar and open a session that has changes.
  2. Click the composer, type "/" and choose "/security-review" ("Check the changes in this session for security problems").
  3. Send it and wait for the reply.
  4. Check the reply lists security problems with their file and line.

## S67.23 Explain findings.

- **Expected:** After a review or scan, the agent explains each finding in plain language with its location.
- **Code:** done. Evidence present: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:987; apps/web/app/api/github/webhook/route.ts:447
- **Where to find it:** Code (sidebar) > open a session > type "/review" in "Describe a task or ask a question" > read the reply (labels found in the code)
- **Needs:** a session with changes (Cloud), or a Local session with changes
- **Steps:**
  1. Run "/review" as in S67.20 and wait for the reply.
  2. Read each finding in the reply, which names its file and line.
  3. Ask "Explain finding 2 in plain language." in "Describe a task or ask a question" and send it.
  4. Check each finding is explained with its location.

## S67.24 Propose patches.

- **Expected:** The agent proposes a change as a reviewable patch before or as it applies it.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > open a Cloud session > "Approval mode" > "Plan" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud); the Plan row shows only on Cloud sessions
- **Steps:**
  1. Click "Code" in the sidebar and open or start a Cloud session.
  2. Click the "Approval mode" button and choose "Plan" ("Reads the code and proposes changes without making any").
  3. Type a change request and send it.
  4. Check the reply proposes changes and the Changes panel does not change the files.

## S67.25 Apply selected patches.

- **Expected:** The user picks which of the agent's proposed patches to apply, and only those are applied.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. No control that applies one chosen proposed patch was found. Searched apps/web/features/code for accept, reject, apply and keep. Only whole-file commit selection ("Include in the commit:"), per-section "Revert" and "Apply to local" for a worktree were found, and none is a patch picker.
- **Needs:** a session that has proposed patches

## S67.26 Generate documentation.

- **Expected:** The agent writes or updates documentation (README, doc comments) from the code.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" > open "Changes" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Update the README for this feature from the code." and send it.
  3. Open "Changes" and check the documentation file was edited.
  4. Read the new text against the code it describes.

## S67.27 Perform migrations.

- **Expected:** The agent performs a code or schema migration across the repository.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" > open "Changes" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Apply the schema migration for <change> across the repository." and send it.
  3. Open "Changes" and check the migration and each caller were edited.
  4. Run the build or tests as in S67.14 to check.

## S67.28 Upgrade dependencies.

- **Expected:** The agent upgrades dependencies and adjusts code to the new versions.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > Change repository > pick a repository > type in "Describe a task or ask a question" > open "Changes" (labels found in the code)
- **Needs:** a repository the GitHub app can reach (Cloud), or a Local folder on the desktop app
- **Steps:**
  1. Click "Code" in the sidebar and choose a repository with "Change repository".
  2. Type "Upgrade <package name> to the latest version and adjust the code to it." and send it.
  3. Open "Changes" and check the manifest and lock file changed.
  4. Run the build and tests to check the upgrade.

## S67.29 Create commits.

- **Expected:** The agent (or user from the coding surface) commits the session's changes with a message.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > open a Cloud session with changes > "Changes" > type in "Commit message" > tick files under "Include in the commit:" > "Commit and push" (labels found in the code)
- **Needs:** a Cloud session with a repository and changed files; a Local session has no commit button
- **Steps:**
  1. Open a Cloud session that has a repository and changed files.
  2. Open "Changes".
  3. Type a message in "Commit message" and tick the files under "Include in the commit:".
  4. Click "Commit and push" and check "Pushed to the repository." appears.

## S67.30 Create branches.

- **Expected:** The agent creates a git branch for its work.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code (sidebar) > open a Cloud session > "Change the branch" > type a new name in "Search or type a branch name" > "Use branch" (labels found in the code)
- **Needs:** a Cloud session with a repository
- **Steps:**
  1. Open a Cloud session with a repository.
  2. Click "Change the branch" and type a new branch name in "Search or type a branch name".
  3. Click "Use branch".
  4. Check the branch name shown in "Changes" is the new one.

## S67.31 Create pull requests.

- **Expected:** The agent opens a pull request for its branch on the code host.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > open a session with a repository and a working branch > Changes > Create pull request (labels found in the code)
- **Needs:** a GitHub account with the GitHub App installed, and a session whose branch has commits
- **Steps:**
  1. Click Code in the left sidebar.
  2. Open a session that has a repository and a branch with commits.
  3. Click Changes at the top of the session.
  4. Click Create pull request. If it is greyed out, read the small text under it for the reason.
  5. Look for a link to the new pull request on GitHub and a Checks status next to it, and compare with Expected.

## S67.33 Investigate CI failures.

- **Expected:** The agent investigates a failed CI run (reads logs, finds the cause, proposes a fix).
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code > open a session with a pull request > Changes > Checks failing (labels found in the code)
- **Needs:** a GitHub account with the GitHub App installed, and a pull request with a failing check
- **Steps:**
  1. Click Code in the left sidebar.
  2. Open a session that already has a pull request.
  3. Click Changes.
  4. Look at the checks row. A failing run shows the Checks failing chip and the failed check names beside it. Click the refresh icon to reload.
  5. Compare with Expected: the app only shows the failing checks; the investigation itself needs the GitHub mention in S67.34.

## S67.34 Work from issues or team mentions.

- **Expected:** Work starts from an issue or a team mention (e.g. @agent on GitHub or Slack) and the agent does the coding task.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** no screen of its own. No Slack mention or in-app control for coding tasks was found; Slack appears only as an inbound trigger source in apps/web/lib/triggers with no screen.
- **Needs:** an outside account (GitHub) with the GitHub App installed on a repository
- **Steps:**
  1. On GitHub, open an issue or pull request in a repository where the GitHub App is installed.
  2. Write a comment that starts with @agi-workforce followed by a request, such as a bug to fix, and post it.
  3. Wait for the reply comment from the app.
  4. Check that the reply links to a Code session, and compare with Expected: the agent does the coding task from the mention.

## S67.36 Run bounded goal/completion loops.

- **Expected:** The user sets a goal and a bound (turns/time) and the agent loops until done or the bound is hit.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Found only fixed bounds (HARNESS_MAX_TURNS = 24 in apps/web/lib/e2b/harnesses/budget.ts, CLOUD_CODE_AGENT_MAX_STEPS in apps/web/lib/services/cloud-code-agent-loop.ts) and the one-shot goal commands /review and /security-review (apps/web/features/code/code-surface.ts); searched apps/web/features/code for maxTurns, max turns, deadline and time limit and found no field where a user sets a goal with its own turn or time bound.
