---
id: "PLAN-mobile-067"
type: "test-plan"
title: "Mobile · 67. Coding capabilities and developer workflows"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "67"
---
# Mobile · 67. Coding capabilities and developer workflows

30 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S67.01 Explain repository structure.

- **Expected:** The agent reads the repository and explains its structure: main parts, entry points, how they fit.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open the side menu and tap AGI Code.
  2. Tap New session, choose the repository under Where it runs, and make sure a folder is picked.
  3. In the box Describe a task or ask a question, type: Explain this repository's structure: main parts, entry points, and how they fit.
  4. Tap send and wait for the reply to finish.
  5. Compare the reply with Expected: it should name main parts, entry points and how they connect.

## S67.02 Find implementations.

- **Expected:** Asked where something is implemented, the agent finds the defining code and cites file and line.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open the side menu, tap AGI Code, then tap New session and pick the repository.
  2. In Describe a task or ask a question, type: Where is the function that starts a session implemented? Give the file and line.
  3. Tap send and wait for the reply.
  4. Compare with Expected: the reply should cite a file and line number.

## S67.03 Find references.

- **Expected:** Asked where a symbol is used, the agent finds its references across the repository.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open AGI Code, tap New session, and pick the repository.
  2. In Describe a task or ask a question, type: Find every place that uses the name of a chosen function or type, across the repository.
  3. Tap send and wait for the reply.
  4. Compare with Expected: the reply should list references from across the repository.

## S67.04 Trace call paths.

- **Expected:** The agent traces how a call flows through the code from entry point to effect.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open AGI Code, tap New session, and pick the repository.
  2. In Describe a task or ask a question, type: Trace how a request flows from its entry point to the place where it takes effect.
  3. Tap send and wait for the reply.
  4. Compare with Expected: the reply should follow the call path step by step.

## S67.05 Answer repository questions.

- **Expected:** The agent answers free-form questions about the repository by reading its files.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open AGI Code, tap New session, and pick the repository.
  2. In Describe a task or ask a question, type a free question about the repository, for example: Which package holds the login code?
  3. Tap send and wait for the reply.
  4. Compare with Expected: the answer should come from reading the repository files.

## S67.06 Implement a feature.

- **Expected:** Given a feature request, the agent edits and creates files in the repository to implement it.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open AGI Code, tap New session, and pick the repository.
  2. In Describe a task or ask a question, type the feature request, for example: Add a copy button to the settings page.
  3. Tap send and wait until the turn finishes.
  4. Tap the branch icon labelled Changes in the top bar to see which files were created or edited.
  5. Compare with Expected: new or edited files should appear in Changes.

## S67.07 Fix a defect.

- **Expected:** Given a defect, the agent finds the cause and edits the code to fix it.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open AGI Code, tap New session, and pick the repository.
  2. In Describe a task or ask a question, describe the defect and the steps that show it.
  3. Tap send and wait until the turn finishes.
  4. Tap Changes in the top bar to see the edited files.
  5. Compare with Expected: the cause should be named and the code changed to fix it.

## S67.08 Refactor code.

- **Expected:** The agent restructures existing code across files without changing behaviour.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open AGI Code, tap New session, and pick the repository.
  2. In Describe a task or ask a question, type a refactor request, for example: Move the shared date helper into one module and update its callers, with no change in behaviour.
  3. Tap send and wait until the turn finishes.
  4. Tap Changes in the top bar and check that several files changed.
  5. Compare with Expected: the files were restructured and the behaviour stays the same.

## S67.09 Generate tests.

- **Expected:** The agent writes new test files or cases for existing code.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open AGI Code, tap New session, and pick the repository.
  2. In Describe a task or ask a question, type: Write tests for the function in a chosen file.
  3. Tap send and wait until the turn finishes.
  4. Tap Changes in the top bar to see the new test file.
  5. Compare with Expected: a new test file or new test cases should appear.

## S67.10 Run tests.

- **Expected:** The agent runs the project's test suite and reports the result.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > open a cloud session > Changes > Commands > Run a command (labels found in the code)
- **Needs:** a cloud session with a repository and a plan that includes managed environments
- **Steps:**
  1. Open AGI Code and tap an existing cloud session with a repository.
  2. Tap the branch icon in the top bar (labelled Changes).
  3. Scroll down to the Commands section.
  4. Type the repository's test command in Run a command, then tap Run.
  5. Compare with Expected: the output should show the test result.

## S67.11 Interpret test failures.

- **Expected:** After a test run fails, the agent reads the failure output and explains or fixes the cause.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > open a cloud session > Describe a task or ask a question (labels found in the code)
- **Needs:** a cloud session with a repository and a plan that includes managed environments
- **Steps:**
  1. Run the tests as in S67.10 (Changes > Commands > Run a command) so that a failure is shown.
  2. Open the cloud session's composer, Describe a task or ask a question.
  3. Type: Explain why the last test run failed and fix the cause.
  4. Tap send and wait until the turn finishes.
  5. Compare with Expected: the reply should explain the failure and the fix should appear in Changes.

## S67.12 Run type checking.

- **Expected:** The agent runs the project's type checker and reports errors.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > open a cloud session > Changes > Commands > Run a command (labels found in the code)
- **Needs:** a cloud session with a repository and a plan that includes managed environments
- **Steps:**
  1. Open a cloud session with a repository and tap the branch icon in the top bar (Changes).
  2. Scroll to the Commands section.
  3. Type the repository's type-check command in Run a command, then tap Run.
  4. Compare with Expected: type errors, if any, should be reported in the output.

## S67.13 Run linting.

- **Expected:** The agent runs the project's linter and reports findings.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > open a cloud session > Changes > Commands > Run a command (labels found in the code)
- **Needs:** a cloud session with a repository and a plan that includes managed environments
- **Steps:**
  1. Open a cloud session with a repository and tap the branch icon in the top bar (Changes).
  2. Scroll to the Commands section.
  3. Type the repository's lint command in Run a command, then tap Run.
  4. Compare with Expected: lint findings should be listed in the output.

## S67.14 Build applications.

- **Expected:** The agent builds the application with the project's build command.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > open a cloud session > Changes > Commands > Run a command (labels found in the code)
- **Needs:** a cloud session with a repository and a plan that includes managed environments
- **Steps:**
  1. Open a cloud session with a repository and tap the branch icon in the top bar (Changes).
  2. Scroll to the Commands section.
  3. Type the repository's build command in Run a command, then tap Run.
  4. Compare with Expected: the build output should report success or the errors.

## S67.16 Inspect browser behavior.

- **Expected:** The agent opens the app in a browser and inspects how it behaves (navigate, click, read, screenshot).
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched apps/mobile for browser control in cloud-code, companion and settings/code: found only opening a pull request link in an in-app browser, no way to navigate, click or screenshot a running app.

## S67.20 Review code changes.

- **Expected:** The agent reviews the current code changes and reports issues with file/line references.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > open a cloud session > Changes, then Describe a task or ask a question (labels found in the code)
- **Needs:** a cloud session with changes and a plan that includes managed environments
- **Steps:**
  1. Open a cloud session that has changes and tap the branch icon in the top bar (Changes) to read the diff.
  2. Close Changes, then in Describe a task or ask a question type: Review the current changes and list issues with file and line.
  3. Tap send and wait for the reply.
  4. Compare with Expected: each issue should cite a file and line.

## S67.22 Scan for security problems.

- **Expected:** The agent scans the code for security problems and reports them.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > open a cloud session > Describe a task or ask a question (labels found in the code)
- **Needs:** a cloud session with a repository and a plan that includes managed environments
- **Steps:**
  1. Open a cloud session with a repository.
  2. In Describe a task or ask a question, type: Scan the code for security problems and list each one with its location.
  3. Tap send and wait for the reply.
  4. Compare with Expected: each security problem should be reported with a location.

## S67.23 Explain findings.

- **Expected:** After a review or scan, the agent explains each finding in plain language with its location.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > open a cloud session > Describe a task or ask a question (labels found in the code)
- **Needs:** a cloud session that already has a review or scan reply
- **Steps:**
  1. After a review or scan reply, read the reply in the transcript.
  2. If findings need more detail, type in Describe a task or ask a question: Explain each finding in plain language with its location.
  3. Tap send and wait for the reply.
  4. Compare with Expected: each finding should have a plain explanation and a location.

## S67.24 Propose patches.

- **Expected:** The agent proposes a change as a reviewable patch before or as it applies it.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:446 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx:148
- **Where to find it:** AGI Code > open a cloud session > Task options and usage > Mode > Plan (labels found in the code)
- **Needs:** a cloud session where the phone sets the mode, and a plan that includes managed environments
- **Steps:**
  1. Open a cloud session and tap Task options and usage in the composer.
  2. Under Mode, tap Plan (it says it reads the code and proposes changes without making any).
  3. Close the options, type a change request in Describe a task or ask a question, and tap send.
  4. Tap the branch icon in the top bar (Changes) to see the proposed diff.
  5. Compare with Expected: the proposal should be shown before or without any file being changed.

## S67.25 Apply selected patches.

- **Expected:** The user picks which of the agent's proposed patches to apply, and only those are applied.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:269 (quoted code not found in the file now); apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx:148; apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx:381
- **Where to find it:** AGI Code > open a cloud session > Changes > Include in the commit: > Commit and push (labels found in the code)
- **Needs:** a cloud session with a repository and changed files
- **Steps:**
  1. Open a cloud session that has changed files and tap the branch icon in the top bar (Changes).
  2. Untick the files you do not want under Include in the commit:, leaving only the ones you choose.
  3. Type a message in Commit message and tap Commit and push.
  4. Compare with Expected: only the ticked files are committed and the sheet says Commits X of Y changed files.

## S67.26 Generate documentation.

- **Expected:** The agent writes or updates documentation (README, doc comments) from the code.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open AGI Code, tap New session, and pick the repository.
  2. In Describe a task or ask a question, type: Write or update the README for this project from the code.
  3. Tap send and wait until the turn finishes.
  4. Tap Changes in the top bar to see the updated documentation file.
  5. Compare with Expected: the README or doc comments should be written or updated.

## S67.27 Perform migrations.

- **Expected:** The agent performs a code or schema migration across the repository.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open AGI Code, tap New session, and pick the repository.
  2. In Describe a task or ask a question, type the migration request, for example: Rename this field in every file that uses it and update the schema.
  3. Tap send and wait until the turn finishes.
  4. Tap Changes in the top bar and check that files across the repository changed.
  5. Compare with Expected: the migration should touch every affected file.

## S67.28 Upgrade dependencies.

- **Expected:** The agent upgrades dependencies and adjusts code to the new versions.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > New session > Describe a task or ask a question (labels found in the code)
- **Needs:** a plan that includes managed environments, a GitHub account with a connected repository
- **Steps:**
  1. Open AGI Code, tap New session, and pick the repository.
  2. In Describe a task or ask a question, type: Upgrade the dependencies named in the package manifest and fix any code that breaks.
  3. Tap send and wait until the turn finishes.
  4. Tap Changes in the top bar and check the manifest and lock file changes.
  5. Compare with Expected: the dependency versions and affected code should have been updated.

## S67.29 Create commits.

- **Expected:** The agent (or user from the coding surface) commits the session's changes with a message.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** AGI Code > open a cloud session > Changes > Commit message > Commit and push (labels found in the code)
- **Needs:** a cloud session with a repository and changed files
- **Steps:**
  1. Open a cloud session that has changes and tap the branch icon in the top bar (Changes).
  2. Make sure the files you want are ticked under Include in the commit:.
  3. Type a message in Commit message.
  4. Tap Commit and push.
  5. Compare with Expected: the commit appears and the notice Pushed to the repository. is shown.

## S67.30 Create branches.

- **Expected:** The agent creates a git branch for its work.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Agent-side. The phone shows the working branch name (cloudCodeWorkspaceLabel in apps/mobile/src/features/cloud-code/presentation.ts) and lets you pick a start branch in New session (Branch heading), but I found no control to ask for a new branch and could not confirm where an agent-created branch is shown.
- **Needs:** a cloud session with a repository

## S67.31 Create pull requests.

- **Expected:** The agent opens a pull request for its branch on the code host.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** Side menu > AGI Code > open a session > Changes (branch icon, top right) > Create pull request (labels found in the code)
- **Needs:** a signed-in AGI Cloud account, and an open AGI Code session with a repository and working branch
- **Steps:**
  1. Open the side menu and tap AGI Code. The sessions list opens.
  2. Tap a session that has a repository and a working branch and is not closed or archived.
  3. Tap the branch icon at the top right of the session. The sheet titled Changes opens.
  4. Scroll to the Create pull request button and tap it once. Nothing asks you to confirm first.
  5. Look for a pull request link and checks status in the same sheet, and for the link in the session header, then compare with Expected: a pull request should exist on the code host.

## S67.36 Run bounded goal/completion loops.

- **Expected:** The user sets a goal and a bound (turns/time) and the agent loops until done or the bound is hit.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No turn, step or time bound control was found in apps/mobile (searched for max steps, turn limit, budget, maxTurns and time bound in src/features/cloud-code and src/features/companion/components). A goal is sent from the AGI Code session composer and can be stopped with the Stop the task control (packages/contracts/types/src/cloud-code.ts), but no bound is set on the phone.

## S67.37 Persist useful repository-specific Memory.

- **Expected:** The agent saves useful repository-specific facts to memory and reuses them in later sessions on that repository.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No repository-specific memory was found in apps/mobile. Searched for memory in src/features/cloud-code, src/features/companion, src/features/settings/code, src/features/skills and src/features/plugins, and found nothing.

## S67.38 Load repository instruction files.

- **Expected:** The agent loads the repository's instruction files (AGENTS.md, CLAUDE.md) and follows them.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No reference to AGENTS.md or CLAUDE.md, or to loading repository instruction files, was found in apps/mobile (searched the whole app folder for AGENTS, CLAUDE.md and instruction).

## S67.39 Use project-specific Skills and Plugins.

- **Expected:** The agent uses skills and plugins defined in the project and the user can see or toggle them.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57 (quoted code not found in the file now); packages/platform/utils/src/remoteControl/codeRemoteController.ts:651; packages/platform/utils/src/remoteControl/codeRemoteController.ts:700; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (quoted code not found in the file now); apps/mobile/src/features/companion/components/CodeSessionView.tsx:377 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Customize > Skills (or Plugins) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account; the Customize row only appears when the skills feature is switched on
- **Steps:**
  1. Open Settings and find the Cloud section.
  2. Tap Customize, then tap Skills (or Plugins).
  3. Find a skill and tap Install or Uninstall to change whether it is added.
  4. Look at the added or not-added state shown on the skill row and detail screen, and compare with Expected: the user can see and toggle skills.
