---
id: "PLAN-desktop-067"
type: "test-plan"
title: "Desktop · 67. Coding capabilities and developer workflows"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "67"
---
# Desktop · 67. Coding capabilities and developer workflows

34 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S67.01 Explain repository structure.

- **Expected:** The agent reads the repository and explains its structure: main parts, entry points, how they fit.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** Code > On this device > Add a folder, then New session in that folder > Start a coding task > Explore the project (labels found in the code)
- **Needs:** Desktop app with a folder on this computer added
- **Steps:**
  1. Click Add a folder and choose a project folder on this computer.
  2. Click New session in that folder.
  3. In the Start a coding task area, click Explore the project.
  4. Read the reply. It should name the main folders, entry points and how they connect, as Expected says.

## S67.02 Find implementations.

- **Expected:** Asked where something is implemented, the agent finds the defining code and cites file and line.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** Code > On this device > open a session > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session
- **Steps:**
  1. Open a local session for the folder.
  2. Click the Continue this session box and type: Where is <function or name> implemented? Give the file and line.
  3. Click Send.
  4. Check that the reply names the defining file and line.

## S67.03 Find references.

- **Expected:** Asked where a symbol is used, the agent finds its references across the repository.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** Code > On this device > open a session > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session
- **Steps:**
  1. Open a local session for the folder.
  2. Type in the Continue this session box: Where is <symbol> used across the repository?
  3. Click Send.
  4. Check that the reply lists references in several files.

## S67.04 Trace call paths.

- **Expected:** The agent traces how a call flows through the code from entry point to effect.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** Code > On this device > open a session > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session
- **Steps:**
  1. Open a local session for the folder.
  2. Type in the Continue this session box: Trace how <button or action> flows from the UI to the code it changes.
  3. Click Send.
  4. Check that the reply walks from the entry point to the final effect, with file names.

## S67.05 Answer repository questions.

- **Expected:** The agent answers free-form questions about the repository by reading its files.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** Code > On this device > open a session > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session
- **Steps:**
  1. Open a local session for the folder.
  2. Type any question about the project in the Continue this session box.
  3. Click Send.
  4. Check that the answer is based on the project's files.

## S67.06 Implement a feature.

- **Expected:** Given a feature request, the agent edits and creates files in the repository to implement it.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:1104
- **Where to find it:** Code > On this device > open a session > Permissions (set to Auto) > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session; a writable test folder
- **Steps:**
  1. Open a local session for the folder.
  2. Set Permissions to Auto. The shortcut is Cmd+Shift+M on a Mac.
  3. Type a feature request in the Continue this session box and click Send.
  4. Click Review changes and check that new or edited files appear.

## S67.07 Fix a defect.

- **Expected:** Given a defect, the agent finds the cause and edits the code to fix it.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:1104
- **Where to find it:** Code > On this device > open a session > Permissions (set to Auto) > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session; a test folder with a known bug
- **Steps:**
  1. Open a local session for the folder.
  2. Set Permissions to Auto.
  3. Type a bug description and the steps to reproduce it in the Continue this session box, then click Send.
  4. Click Review changes and check that the fix touches the file that causes the bug.

## S67.08 Refactor code.

- **Expected:** The agent restructures existing code across files without changing behaviour.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:1104
- **Where to find it:** Code > On this device > open a session > Permissions (set to Auto) > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session
- **Steps:**
  1. Open a local session for the folder.
  2. Set Permissions to Auto.
  3. Type: Refactor <module> into smaller parts without changing behaviour. Click Send.
  4. Click Review changes and run Run tests to check behaviour is unchanged.

## S67.09 Generate tests.

- **Expected:** The agent writes new test files or cases for existing code.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:1104
- **Where to find it:** Code > On this device > open a session > Permissions (set to Auto) > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session
- **Steps:**
  1. Open a local session for the folder.
  2. Set Permissions to Auto.
  3. Type: Write tests for <function>. Click Send.
  4. Click Review changes and check that a new test file or new test cases appear.

## S67.10 Run tests.

- **Expected:** The agent runs the project's test suite and reports the result.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:564; apps/web/features/code/components/LocalSessionPanel.tsx:1135
- **Where to find it:** Code > On this device > open a session > Run tests (header button) (labels found in the code)
- **Needs:** Desktop app with a local folder session; a folder with a test script
- **Steps:**
  1. Open a local session for a folder that has a test command.
  2. Click the Run tests button in the session header.
  3. Watch the status line: Running <command>.
  4. Check the result: <command> passed., or failed with exit code, and read Test output.

## S67.11 Interpret test failures.

- **Expected:** After a test run fails, the agent reads the failure output and explains or fixes the cause.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** Code > On this device > open a session > Run tests (header button) > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app; a folder with a failing test
- **Steps:**
  1. Run tests on a folder where a test fails.
  2. Open Test output and read the failure.
  3. Type in Continue this session: Explain why these tests fail and fix the cause. Click Send.
  4. Check that the reply names the failing test and cause, and that Review changes shows any fix.

## S67.12 Run type checking.

- **Expected:** The agent runs the project's type checker and reports errors.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** Code > On this device > open a session > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session; a folder with a type checker
- **Steps:**
  1. Open a local session for a TypeScript folder.
  2. Type in Continue this session: Run the project's type checker and list the errors. Click Send.
  3. Check that the reply reports the checker's errors with file names, or states there are none.

## S67.13 Run linting.

- **Expected:** The agent runs the project's linter and reports findings.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** Code > On this device > open a session > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session; a folder with a linter
- **Steps:**
  1. Open a local session for the folder.
  2. Type in Continue this session: Run the project's linter and list the findings. Click Send.
  3. Check that the reply reports the lint output with file names.

## S67.14 Build applications.

- **Expected:** The agent builds the application with the project's build command.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** Code > On this device > open a session > Terminal panel > New terminal (labels found in the code)
- **Needs:** Desktop app with a local folder session; a folder with a build command
- **Steps:**
  1. Open a local session for the folder.
  2. Click the Terminal panel button in the session header.
  3. Click New terminal and type the project's build command, then press Return.
  4. Check that the terminal ends with the build's output and exit status.

## S67.15 Start development servers.

- **Expected:** The agent starts a development server and keeps it running while it continues working.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:179; apps/desktop/electron/runtime/dispatcher.ts:2397
- **Where to find it:** Code > On this device > open a session > Terminal panel > New terminal (labels found in the code)
- **Needs:** Desktop app with a local folder session; a folder with a dev server command
- **Steps:**
  1. Open a local session and click the Terminal panel button.
  2. Click New terminal and type the project's dev server command, then press Return.
  3. Ask the agent in Continue this session for a small edit and click Send, while the server keeps running.
  4. Check that the server stays up. Closing its tab should ask: Close this terminal? and say it is still running here.

## S67.16 Inspect browser behavior.

- **Expected:** The agent opens the app in a browser and inspects how it behaves (navigate, click, read, screenshot).
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:1459
- **Where to find it:** Code > On this device > open a session > Browser (header button) (labels found in the code)
- **Needs:** Desktop app with a local folder session; a running local web app for the URL
- **Steps:**
  1. Open a local session and click the Browser button in the header.
  2. Click Web address, type a local URL such as localhost:3000, and press Return.
  3. Use Back, Forward and Reload to check the pages load.
  4. Ask the agent in Continue this session to check the page, and read the reply.

## S67.17 Inspect console errors.

- **Expected:** The agent reads the browser console errors of the app under test.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:289; packages/contracts/local-runtime/src/device-steps.ts:294; apps/web/features/desktop-host/lib/device-steps.ts:216; apps/desktop/electron/browser/browserSteps.ts:53
- **Where to find it:** not found in the code. No console panel found in apps/web/features/code/components/LocalBrowserPanel.tsx. The console step exists as device_browser_console in packages/contracts/local-runtime/src/device-steps.ts:289 for the paired Chrome browser, and the user is asked before it runs. Not confirmed as a visible control.
- **Needs:** a paired Chrome browser for the agent step

## S67.18 Inspect network failures.

- **Expected:** The agent inspects failed network requests of the app under test.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:289; packages/contracts/local-runtime/src/device-steps.ts:294; apps/web/features/desktop-host/lib/device-steps.ts:216; apps/desktop/electron/browser/browserSteps.ts:53
- **Where to find it:** not found in the code. The network step exists as device_browser_network in packages/contracts/local-runtime/src/device-steps.ts:294 for the paired Chrome browser. No network panel found in LocalBrowserPanel.tsx.
- **Needs:** a paired Chrome browser for the agent step

## S67.20 Review code changes.

- **Expected:** The agent reviews the current code changes and reports issues with file/line references.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/platform/runtime/git_tools.rs:100
- **Where to find it:** Code > On this device > open a session > Continue this session (composer) > type /review (labels found in the code)
- **Needs:** Desktop app with a local folder session that has uncommitted changes
- **Steps:**
  1. Make a change in the folder, then open a local session.
  2. Click Review changes in the header and check the changed files.
  3. Type /review in Continue this session and click Send.
  4. Check that the findings name file and line, as Expected says.

## S67.21 Review pull requests.

- **Expected:** The agent reviews a pull request (fetches its diff) and posts or shows review findings.
- **Code:** done. Evidence present: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:987; apps/web/app/api/github/webhook/route.ts:299
- **Where to find it:** Settings > Connectors > GitHub > Review pull requests (labels found in the code)
- **Needs:** A GitHub account with the AGI GitHub App installed on a repository, and a pull request
- **Steps:**
  1. Open Settings and click Connectors.
  2. Find the GitHub connector and turn on Review pull requests.
  3. Open a pull request on that repository and wait for it to open.
  4. Check that AGI posts a review as a comment on the pull request.

## S67.22 Scan for security problems.

- **Expected:** The agent scans the code for security problems and reports them.
- **Code:** done. Evidence moved: apps/cli/src/app_server/surfaces.rs:1116 (quoted code not found in the file now); apps/cli/src/app_server/developer_host.rs:1665
- **Where to find it:** Code > Cloud sessions > open a session > Continue (composer) > type /security-review (labels found in the code)
- **Needs:** A paid plan with Code, and a cloud session with a repository
- **Steps:**
  1. Click Code in the sidebar and open a cloud session that has changes.
  2. In the composer, type /security-review and pick it from the list.
  3. Click Send.
  4. Check that the reply lists security problems with their location.

## S67.23 Explain findings.

- **Expected:** After a review or scan, the agent explains each finding in plain language with its location.
- **Code:** done. Evidence present: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:987; apps/web/app/api/github/webhook/route.ts:447
- **Where to find it:** Code > open the session after a review or scan > read the reply in the transcript (labels found in the code)
- **Needs:** A session that has run /review or /security-review
- **Steps:**
  1. After S67.20 or S67.22 finishes, open the same session.
  2. Read the reply in the transcript.
  3. Check that each finding has a plain explanation and a file and line.

## S67.24 Propose patches.

- **Expected:** The agent proposes a change as a reviewable patch before or as it applies it.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:230 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:3011; apps/web/features/code/local-code.ts:447 (quoted code not found in the file now)
- **Where to find it:** Code > On this device > open a session > Permissions (set to Plan) > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session
- **Steps:**
  1. Open a local session and set Permissions to Plan.
  2. Type in Continue this session: Propose a fix for <issue>, do not change any files. Click Send.
  3. Read the proposed change in the reply. Check Review changes shows no edits.
  4. Set Permissions to Ask, ask again, and check the Approval required card with Approve and continue appears before any edit.

## S67.25 Apply selected patches.

- **Expected:** The user picks which of the agent's proposed patches to apply, and only those are applied.
- **Code:** done. Evidence present: apps/web/features/code/components/LocalChangesPanel.tsx:76; apps/web/features/code/components/LocalChangesPanel.tsx:187; apps/desktop/electron/runtime/dispatcher.ts:3103; apps/desktop/electron/runtime/gitService.ts:623
- **Where to find it:** Code > On this device > open a session > Review changes > Stage file or Revert file (labels found in the code)
- **Needs:** Desktop app with a local folder session that has several changed files
- **Steps:**
  1. Open a local session with several changed files and click Review changes.
  2. Click Stage file on one file only.
  3. Check the status says Staged 1 change. and that other files are not staged.
  4. Click Revert file on another file, confirm Revert these changes?, and check only that file changes back.

## S67.26 Generate documentation.

- **Expected:** The agent writes or updates documentation (README, doc comments) from the code.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:1104
- **Where to find it:** Code > On this device > open a session > Continue this session (composer) (labels found in the code)
- **Needs:** Desktop app with a local folder session
- **Steps:**
  1. Open a local session with Permissions set to Auto.
  2. Type in Continue this session: Write or update the README section for <module> from the code. Click Send.
  3. Click Review changes and open the README or doc comment changes.
  4. Check the new text matches the code.

## S67.27 Perform migrations.

- **Expected:** The agent performs a code or schema migration across the repository.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:1104
- **Where to find it:** Code > Add a folder (if none is open) > New session in [folder name] > type the migration task and send (labels found in the code)
- **Needs:** the desktop app and a git repository folder on this Mac
- **Steps:**
  1. Sign in to the desktop app and click Code in the sidebar.
  2. If no folder is listed, click Add a folder and pick a git repository folder on this Mac.
  3. Click New session in [folder name] under that folder.
  4. Type a migration task, for example: Rename every use of the old config key to the new key, and send.
  5. Look at the reply and the Changes pane: the agent names the files it changed, and those files now show the new name.

## S67.28 Upgrade dependencies.

- **Expected:** The agent upgrades dependencies and adjusts code to the new versions.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/features/exec/tools/mod.rs:1104
- **Where to find it:** Code > Add a folder (if none is open) > New session in [folder name] > type the upgrade task and send (labels found in the code)
- **Needs:** the desktop app, a folder on this Mac with a package manifest, and network access for the package registry
- **Steps:**
  1. Sign in to the desktop app, click Code and open a session in a folder that has a package manifest (for example package.json).
  2. Type an upgrade task, for example: Upgrade one outdated dependency to its latest version and fix any code that breaks, and send.
  3. Wait for the agent to finish, then open the Changes pane.
  4. Compare: the manifest and the code files the agent changed are listed, and the agent reports the new version it installed.

## S67.29 Create commits.

- **Expected:** The agent (or user from the coding surface) commits the session's changes with a message.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/platform/runtime/git_tools.rs:135
- **Where to find it:** Code > New session in [folder name] > type a commit request in the message box and send (labels found in the code)
- **Needs:** the desktop app and a git repository folder on this Mac
- **Steps:**
  1. Click Code, then New session in [folder name].
  2. Type a small change request, for example: Add one line to README.md, and send. Wait for the change.
  3. Type: Commit these changes with the message Add README note, and send.
  4. If a commit hook runs, a prompt asks you to allow it. Answer it.
  5. Compare: the agent reports the commit. Open Changes: a line reads Stages and reverts changes. Run git commit in your terminal to commit. when you commit by hand.

## S67.30 Create branches.

- **Expected:** The agent creates a git branch for its work.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/platform/runtime/git_tools.rs:168
- **Where to find it:** Code > New session in [folder name] > type a branch request in the message box and send (labels found in the code)
- **Needs:** the desktop app and a git repository folder on this Mac
- **Steps:**
  1. Click Code, then New session in [folder name] on a folder that is a git repository.
  2. Type: Create a branch named qa-branch-test for this work, and send.
  3. Compare: the agent reports the new branch name.
  4. Open Changes and check the branch name shown in the session group in the sidebar, or ask the agent: Which branch are we on?

## S67.31 Create pull requests.

- **Expected:** The agent opens a pull request for its branch on the code host.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalPullRequest.tsx:115; apps/web/features/code/components/LocalPullRequest.tsx:63 (quoted code not found in the file now); apps/desktop/electron/runtime/gitService.ts:241 (quoted code not found in the file now); apps/web/app/api/code/local-pull-requests/route.ts:44
- **Where to find it:** Code > [session in a folder] > Changes > Push and open a pull request (labels found in the code)
- **Needs:** a GitHub account connected to AGI, and a git folder with a GitHub remote; without the AGI GitHub App on that repository, the button opens the GitHub compare page instead
- **Steps:**
  1. Click Code and open a session in a git folder that is on a branch other than the default branch and has a GitHub remote.
  2. Make a change with the agent so there is something to push.
  3. Click Changes in the session header.
  4. Click Push and open a pull request below the file list.
  5. Compare: a Pull request # link appears with a checks status. Clicking it opens the pull request on GitHub.

## S67.34 Work from issues or team mentions.

- **Expected:** Work starts from an issue or a team mention (e.g. @agent on GitHub or Slack) and the agent does the coding task.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Code line says partial: the switch-on is an E2B sandbox gate (apps/web/lib/e2b/gate.ts). I searched apps/web for issue_comment, app_mention and mention triggers and found no UI path that starts coding from a GitHub issue or team mention.

## S67.37 Persist useful repository-specific Memory.

- **Expected:** The agent saves useful repository-specific facts to memory and reuses them in later sessions on that repository.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalMemoryControl.tsx:49; apps/web/features/code/components/LocalSessionPanel.tsx:1068; apps/desktop/electron/runtime/dispatcher.ts:3087; apps/desktop/electron/runtime/developerSessionService.ts:3429; apps/cli/src/app_server/surfaces.rs:1646; apps/cli/src/agent/prompt.rs:401 (quoted code not found in the file now)
- **Where to find it:** Code > [session in a folder] > Memory button (brain icon, tooltip Memory) > What to remember > Save to memory (labels found in the code)
- **Needs:** a folder on this computer, and memory turned on for the account (the Memory button is hidden otherwise and in remote SSH sessions)
- **Steps:**
  1. Click Code and open a session in a folder.
  2. Click the Memory button in the session header (brain icon, tooltip Memory).
  3. Type a repository fact, for example: Tests run with the npm test script. Choose Project memory and click Save to memory.
  4. Compare: the line Saved to appears with a file path.
  5. Open a new session in the same folder and ask: How do we run the tests? The answer should use the saved fact.

## S67.38 Load repository instruction files.

- **Expected:** The agent loads the repository's instruction files (AGENTS.md, CLAUDE.md) and follows them.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionPanel.tsx:160 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2943; apps/cli/src/agent/prompt.rs:396 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The instruction files are loaded by the CLI loader (apps/cli/src/compaction.rs load_instructions); the desktop app path was not confirmed in the cited dispatcher lines.
- **Needs:** a folder on this computer with an AGENTS.md or CLAUDE.md file
- **Steps:**
  1. Create AGENTS.md in a test folder with one rule, for example: Always answer in one word.
  2. Click Code and open a new session in that folder.
  3. Ask a question such as: What is the capital of France?
  4. Compare: the reply follows the rule from AGENTS.md. In the terminal CLI, /memory shows what the session loads.

## S67.39 Use project-specific Skills and Plugins.

- **Expected:** The agent uses skills and plugins defined in the project and the user can see or toggle them.
- **Code:** done. Evidence present: apps/web/features/code/components/LocalExtensionsControl.tsx:143; apps/web/features/code/components/LocalExtensionsControl.tsx (text found, layout changed); apps/desktop/electron/runtime/dispatcher.ts:3077; crates/agiworkforce-protocol/src/developer_session.rs:177
- **Where to find it:** Code > [session in a folder] > Skills and plugins button (sparkle icon, tooltip Skills and plugins) > turn a switch on or off (labels found in the code)
- **Needs:** the desktop app, a folder open in a local session, and a folder or account that has at least one skill or plugin
- **Steps:**
  1. Click Code and open a session in a folder that has a skill or plugin.
  2. Click the Skills and plugins button in the session header (sparkle icon).
  3. If a project skill is listed and not trusted, read the note and click Trust this folder's skills.
  4. Turn one skill's switch off, then on. Each row shows the name and its scope, under Skills or Plugins.
  5. Compare: a switched-off skill is not used when you ask for it, and a failed change shows That change could not be saved.
