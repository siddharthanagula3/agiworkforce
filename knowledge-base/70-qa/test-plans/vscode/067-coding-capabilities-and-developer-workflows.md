---
id: "PLAN-vscode-067"
type: "test-plan"
title: "VS Code · 67. Coding capabilities and developer workflows"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "67"
---
# VS Code · 67. Coding capabilities and developer workflows

31 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S67.01 Explain repository structure.

- **Expected:** The agent reads the repository and explains its structure: main parts, entry points, how they fit.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type: Explain the structure of this repository: main parts, entry points and how they fit together.
  3. Press Enter and wait for the answer.
  4. Compare the answer with Expected: it should name the main parts, the entry points and how they connect.

## S67.02 Find implementations.

- **Expected:** Asked where something is implemented, the agent finds the defining code and cites file and line.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type: Where is the main entry point of this project implemented? Give the file and line.
  3. Press Enter and wait for the answer.
  4. Compare the answer with Expected: it should name the defining file and a line number.

## S67.03 Find references.

- **Expected:** Asked where a symbol is used, the agent finds its references across the repository.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type: Where is a function of this project used? Find every reference across the repository.
  3. Press Enter and wait for the answer.
  4. Compare the answer with Expected: it should list the places across the repository that use the symbol.

## S67.04 Trace call paths.

- **Expected:** The agent traces how a call flows through the code from entry point to effect.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type: Trace how a request flows from the first entry point to the place where it takes effect, step by step.
  3. Press Enter and wait for the answer.
  4. Compare the answer with Expected: it should walk the call path from entry point to effect with file references.

## S67.05 Answer repository questions.

- **Expected:** The agent answers free-form questions about the repository by reading its files.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type a free question about the project, for example: How are settings loaded?
  3. Press Enter and wait for the answer.
  4. Compare the answer with Expected: it should answer from the repository's files.

## S67.06 Implement a feature.

- **Expected:** Given a feature request, the agent edits and creates files in the repository to implement it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1104
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type a small feature request, for example: Add a helper file that formats a date as YYYY-MM-DD.
  3. Press Enter and wait for the agent to finish.
  4. Compare with Expected: a new or changed file should appear in the Explorer, and proposed edits show Accept and Reject above the changed lines.

## S67.07 Fix a defect.

- **Expected:** Given a defect, the agent finds the cause and edits the code to fix it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1104; apps/extension-vscode/src/core/commandSetup.ts:1149
- **Where to find it:** Select code in an editor, then Command Palette > "Code: Fix Issue" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up, and a file with a defect
- **Steps:**
  1. Open a file that has a defect, select the code that is wrong, and press Cmd+Shift+P.
  2. Type "Code: Fix Issue" and press Enter.
  3. Wait for the agent to finish in the chat panel.
  4. Compare with Expected: the agent should explain the cause and propose an edit, shown with Accept and Reject above the changed lines.

## S67.08 Refactor code.

- **Expected:** The agent restructures existing code across files without changing behaviour.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1104; apps/extension-vscode/src/core/commandSetup.ts:1153
- **Where to find it:** Select code in an editor, then Command Palette > "Code: Refactor Code" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Open a file, select the code to restructure, and press Cmd+Shift+P.
  2. Type "Code: Refactor Code" and press Enter.
  3. Wait for the agent to finish in the chat panel.
  4. Compare with Expected: the proposed changes should restructure the code across files, and the behaviour should stay the same, with Accept and Reject above each change.

## S67.09 Generate tests.

- **Expected:** The agent writes new test files or cases for existing code.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1104; apps/extension-vscode/src/core/commandSetup.ts:1157
- **Where to find it:** Select code in an editor, then Command Palette > "Code: Generate Tests" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Open a file with existing code, select a function, and press Cmd+Shift+P.
  2. Type "Code: Generate Tests" and press Enter.
  3. Wait for the agent to finish in the chat panel.
  4. Compare with Expected: a new test file or new test cases should appear for the selected code.

## S67.10 Run tests.

- **Expected:** The agent runs the project's test suite and reports the result.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:564; apps/extension-vscode/src/core/commandSetup.ts:1694
- **Where to find it:** Command Palette > "Code: Run Tests" (labels found in the code)
- **Needs:** a trusted workspace folder with a test suite
- **Steps:**
  1. Open the workspace folder, press Cmd+Shift+P, and type "Code: Run Tests".
  2. Press Enter.
  3. Compare with Expected: the project's test command should run and report a result. The command picks npm, pnpm, yarn, cargo or pytest from the project files.

## S67.11 Interpret test failures.

- **Expected:** After a test run fails, the agent reads the failure output and explains or fixes the cause.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder with a failing test
- **Steps:**
  1. Run a test suite that fails, for example with "Code: Run Tests".
  2. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  3. Click the box that says "Describe a task…" and type: Why did the tests fail? Explain the cause and fix it.
  4. Compare with Expected: the answer should read the failure output and explain or fix the cause.

## S67.12 Run type checking.

- **Expected:** The agent runs the project's type checker and reports errors.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type: Run the project's type checker and report the errors.
  3. Press Enter and wait for the answer.
  4. Compare with Expected: the answer should report the type checker output and any errors with their locations.

## S67.13 Run linting.

- **Expected:** The agent runs the project's linter and reports findings.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type: Run the project's linter and report the findings.
  3. Press Enter and wait for the answer.
  4. Compare with Expected: the answer should list the linter findings.

## S67.14 Build applications.

- **Expected:** The agent builds the application with the project's build command.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type: Build the application with the project's build command and report the result.
  3. Press Enter and wait for the answer.
  4. Compare with Expected: the answer should report the build result from the project's build command.

## S67.15 Start development servers.

- **Expected:** The agent starts a development server and keeps it running while it continues working.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:544
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder with a dev server script, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type: Start the development server and keep it running while you continue.
  3. Press Enter and wait for the agent to report that the server started.
  4. Compare with Expected: the server should keep running after the agent moves on to another request.

## S67.16 Inspect browser behavior.

- **Expected:** The agent opens the app in a browser and inspects how it behaves (navigate, click, read, screenshot).
- **Code:** partial. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1459
- **Known to be unfinished:** Needs a CLI-side browser pairing without AGI Desktop (c-cli lane); VS Code has nothing of its own to add.
- **Where to find it:** not found in the code. Searched apps/extension-vscode/src for "browser" and for "Inspect browser" and browser pairing; no control for agent browser inspection was found. The plan says it needs CLI-side browser pairing outside AGI Desktop.
- **Needs:** a browser-driven app to inspect

## S67.20 Review code changes.

- **Expected:** The agent reviews the current code changes and reports issues with file/line references.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:985 (quoted code not found in the file now); apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now)
- **Where to find it:** Command Palette > "Code: Code Review" (labels found in the code)
- **Needs:** a repository with uncommitted changes and an open editor
- **Steps:**
  1. Open a file that has uncommitted changes in the editor.
  2. Press Cmd+Shift+P, type "Code: Code Review" and press Enter.
  3. Wait for the review to finish in the chat panel.
  4. Compare with Expected: the review should list issues with file and line references.

## S67.21 Review pull requests.

- **Expected:** The agent reviews a pull request (fetches its diff) and posts or shows review findings.
- **Code:** done. Evidence present: apps/extension-vscode/src/extension.ts:292; apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts:171
- **Where to find it:** Command Palette > "Code: Review a Pull Request" (labels found in the code)
- **Needs:** a repository with a pull request or branch, and GitHub access
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Review a Pull Request" and press Enter.
  2. In the box that asks "A pull request number, such as 128, or a branch name", type a pull request number or a branch name and press Enter.
  3. Wait for the review to appear in the chat panel.
  4. Compare with Expected: the review should read the pull request's diff and report findings.

## S67.22 Scan for security problems.

- **Expected:** The agent scans the code for security problems and reports them.
- **Code:** done. Evidence present: apps/extension-vscode/src/extension.ts:302; apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts:187
- **Where to find it:** Command Palette > "Code: Security Review of Pending Changes" (labels found in the code)
- **Needs:** a repository with pending changes
- **Steps:**
  1. Make some uncommitted changes in a repository.
  2. Press Cmd+Shift+P, type "Code: Security Review of Pending Changes" and press Enter.
  3. Wait for the review to finish in the chat panel.
  4. Compare with Expected: findings should list the file, line, why it is exploitable, its severity and the fix.

## S67.23 Explain findings.

- **Expected:** After a review or scan, the agent explains each finding in plain language with its location.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:985 (quoted code not found in the file now); apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now)
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a repository with changes to review
- **Steps:**
  1. Run "Code: Code Review" or "Code: Security Review of Pending Changes" first.
  2. Click the box that says "Describe a task…" and type: Explain each finding in plain words, with its file and line.
  3. Press Enter and wait for the answer.
  4. Compare with Expected: each finding should be explained in plain language with its location.

## S67.24 Propose patches.

- **Expected:** The agent proposes a change as a reviewable patch before or as it applies it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2250; apps/extension-vscode/src/providers/diffDecorationProvider.ts:294
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…"; the proposal shows in the editor (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and ask for a small edit to a file, for example: Rename the variable count to total in this file.
  3. Open the changed file in the editor and look above the changed lines.
  4. Compare with Expected: the change should appear as a proposal with Accept and Reject above it, before you accept it.

## S67.25 Apply selected patches.

- **Expected:** The user picks which of the agent's proposed patches to apply, and only those are applied.
- **Code:** done. Evidence present: apps/extension-vscode/src/providers/diffDecorationProvider.ts:175; apps/extension-vscode/src/core/commandSetup.ts:1086
- **Where to find it:** In the editor, above a proposed change, click Accept or Reject; or Command Palette > "Code: Accept Current Diff" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up, and proposed changes
- **Steps:**
  1. Ask the agent for edits in two places, as in the item above, so two proposals appear.
  2. Click Accept above the first change and Reject above the second.
  3. Or click Accept All in File above the proposals in one file.
  4. Compare with Expected: only the changes you picked are applied and the rejected one stays out of the file.

## S67.26 Generate documentation.

- **Expected:** The agent writes or updates documentation (README, doc comments) from the code.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1104; apps/extension-vscode/src/core/commandSetup.ts:1161
- **Where to find it:** Select code in an editor, then Command Palette > "Code: Generate Docs" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Open a file with code, select a function or the whole file, and press Cmd+Shift+P.
  2. Type "Code: Generate Docs" and press Enter.
  3. Wait for the agent to finish in the chat panel.
  4. Compare with Expected: doc comments or a README section should appear or be updated, as proposed changes with Accept and Reject.

## S67.27 Perform migrations.

- **Expected:** The agent performs a code or schema migration across the repository.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1104
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type a migration request, for example: Replace every use of the old function name with the new one across the repository.
  3. Press Enter and wait for the agent to finish.
  4. Compare with Expected: the changes should appear across several files, shown as proposals with Accept and Reject.

## S67.28 Upgrade dependencies.

- **Expected:** The agent upgrades dependencies and adjusts code to the new versions.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1104
- **Where to find it:** Command Palette > "Code: Open Chat", then the box "Describe a task…" (labels found in the code)
- **Needs:** a trusted workspace folder open, with the developer runtime set up
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Chat" and press Enter.
  2. Click the box that says "Describe a task…" and type: Upgrade the dependency named in package.json to its newest version and adjust the code to it.
  3. Press Enter and wait for the agent to finish.
  4. Compare with Expected: the manifest and the affected code should change, shown as proposals with Accept and Reject.

## S67.29 Create commits.

- **Expected:** The agent (or user from the coding surface) commits the session's changes with a message.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1634; apps/extension-vscode/src/core/commandSetup.ts:1649
- **Where to find it:** Command Palette > Code: Git Commit (labels found in the code)
- **Needs:** a git repository open in VS Code with uncommitted changes
- **Steps:**
  1. Open a folder that is a git repository with changes, in VS Code.
  2. Press Cmd+Shift+P and type "Code: Git Commit", then press Enter.
  3. In the box labelled "Commit message", type a message such as "feat: test commit", then press Enter.
  4. Open the Source Control view and the git history, and look for a new commit with that message and the changes in it.

## S67.30 Create branches.

- **Expected:** The agent creates a git branch for its work.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/cli/src/platform/runtime/git_tools.rs:168
- **Where to find it:** Command Palette > Code: New Session in a Worktree (or Code: Session Worktrees, then a name) (labels found in the code)
- **Needs:** a git repository open in VS Code
- **Steps:**
  1. Open a git repository folder in VS Code.
  2. Press Cmd+Shift+P, type "Code: New Session in a Worktree", then press Enter.
  3. Or press Cmd+Shift+P, type "Code: Session Worktrees", choose the named option, and type a name in the box labelled "Enter a worktree name".
  4. A new window opens on the new worktree folder. Check that the branch name shown for it in the list is not the branch you started from.

## S67.31 Create pull requests.

- **Expected:** The agent opens a pull request for its branch on the code host.
- **Code:** done. Evidence present: apps/cli/src/app_server/pull_request.rs:188; apps/extension-vscode/src/features/surfaces/pullRequest.ts:54
- **Where to find it:** Command Palette > Code: Create Pull Request (labels found in the code)
- **Needs:** a branch with commits and an account on the code host (the exact account requirement was not checked)
- **Steps:**
  1. Work on a branch that has commits not yet in the base branch, in a git repository folder.
  2. Press Cmd+Shift+P, type "Code: Create Pull Request", then press Enter.
  3. If a warning appears, it names the reason no pull request can be opened. Otherwise, type a title in the box labelled "Pull request title", then answer the next box for the base branch.
  4. If the branch is not pushed yet, click "Push and Open". If it is already pushed, click "Open Pull Request". Look for the message "Code: pull request opened." with a View button, and check the pull request on the code host.

## S67.37 Persist useful repository-specific Memory.

- **Expected:** The agent saves useful repository-specific facts to memory and reuses them in later sessions on that repository.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/repositoryMemory.ts:9
- **Where to find it:** Command Palette > Code: Remember for This Repository (labels found in the code)
- **Needs:** a trusted workspace folder that is a repository
- **Steps:**
  1. Open a trusted workspace folder that is a repository.
  2. Press Cmd+Shift+P, type "Code: Remember for This Repository", then press Enter.
  3. Choose the repository folder if asked, type a note such as "Run pnpm test:unit before committing" in the box titled "Remember for this repository", then press Enter.
  4. Read the confirmation message. Then start a new session in the same repository and ask the agent what it was told to remember. Compare its answer with the note you saved.

## S67.38 Load repository instruction files.

- **Expected:** The agent loads the repository's instruction files (AGENTS.md, CLAUDE.md) and follows them.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2690; apps/extension-vscode/src/integrations/localRuntimeClient.ts:2122; apps/cli/src/agent/prompt.rs:396 (quoted code not found in the file now)
- **Where to find it:** More actions (the "..." button at the top of the sidebar) > Instructions (labels found in the code)
- **Needs:** a workspace folder with AGENTS.md or CLAUDE.md
- **Steps:**
  1. Open a workspace folder that holds AGENTS.md or CLAUDE.md, and open the AGI sidebar.
  2. Click the "More" (...) button at the top of the sidebar, then click "Instructions".
  3. In the list, pick a file to open it and check it is the repository's instruction file.
  4. Ask the agent a question that one of those rules governs, and check that its answer follows the rule in the file.

## S67.39 Use project-specific Skills and Plugins.

- **Expected:** The agent uses skills and plugins defined in the project and the user can see or toggle them.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:2309 (quoted code not found in the file now); apps/extension-vscode/src/integrations/localRuntimeClient.ts:2136
- **Where to find it:** Command Palette > Code: Show Skills (or More actions > Skills, or type /skills in the chat box) (labels found in the code)
- **Needs:** a workspace folder with project skills; a second check needs a chat question
- **Steps:**
  1. Open a workspace folder and the AGI sidebar.
  2. Press Cmd+Shift+P, type "Code: Show Skills", then press Enter. Or click "More" (...) > "Skills".
  3. If the item "Allow this folder’s project skills" appears, choose it to allow the folder's project skills.
  4. Select a skill, then use its "Turn off" or "Turn on" button (the tooltip on its icon). Ask the agent something a skill covers and compare its answer with the skill's state.
