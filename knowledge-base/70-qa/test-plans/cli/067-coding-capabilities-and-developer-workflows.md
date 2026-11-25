---
id: "PLAN-cli-067"
type: "test-plan"
title: "CLI · 67. Coding capabilities and developer workflows"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "67"
---
# CLI · 67. Coding capabilities and developer workflows

32 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S67.01 Explain repository structure.

- **Expected:** The agent reads the repository and explains its structure: main parts, entry points, how they fit.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder
- **Steps:**
  1. Open a terminal in a project folder and run: agi
  2. At the box "Message AGI...  / for commands" type: Explain the structure of this repository: main parts, entry points and how they fit together
  3. Press Enter and wait for the answer
  4. Check that the answer names the main folders, the entry points and how they connect, in plain words

## S67.02 Find implementations.

- **Expected:** Asked where something is implemented, the agent finds the defining code and cites file and line.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:436; apps/cli/src/features/exec/tools/mod.rs:640 (quoted code not found in the file now)
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder
- **Steps:**
  1. Run: agi in a project folder
  2. At the box "Message AGI...  / for commands" type: Where is the main chat loop implemented? Give file and line.
  3. Press Enter and wait
  4. Check that the answer gives a file path and line number and the code there matches

## S67.03 Find references.

- **Expected:** Asked where a symbol is used, the agent finds its references across the repository.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder
- **Steps:**
  1. Run: agi in a project folder
  2. At the box "Message AGI...  / for commands" type: Where is the function named run_review used across the repository?
  3. Press Enter and wait
  4. Check that the answer lists each use with file and line, and that they match a search of the folder

## S67.04 Trace call paths.

- **Expected:** The agent traces how a call flows through the code from entry point to effect.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:436; apps/cli/src/features/exec/tools/mod.rs:640 (quoted code not found in the file now)
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder
- **Steps:**
  1. Run: agi in a project folder
  2. At the box "Message AGI...  / for commands" type: Trace how the /review command flows from the input box to the review prompt, step by step, with file and line
  3. Press Enter and wait
  4. Check that the steps follow the code in order, from the command handler to the prompt it sends

## S67.05 Answer repository questions.

- **Expected:** The agent answers free-form questions about the repository by reading its files.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:436
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder
- **Steps:**
  1. Run: agi in a project folder
  2. At the box "Message AGI...  / for commands" type a free question about the project, for example: How are project instructions files like AGENTS.md loaded?
  3. Press Enter and wait
  4. Check that the answer is based on the files and matches what the files say

## S67.06 Implement a feature.

- **Expected:** Given a feature request, the agent edits and creates files in the repository to implement it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:1104; apps/cli/src/features/exec/tools/mod.rs:1125
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a copy of a git project to change
- **Steps:**
  1. Run: agi in a copy of a git project (not your real work)
  2. At the box "Message AGI...  / for commands" type a small feature request, for example: Add a function that returns the project name, in a new file
  3. Press Enter; when an approval box appears, read it and press Enter on "Yes" or choose "No"
  4. After the turn, look for the line "Files changed this turn" and check that the new or edited file exists in the folder

## S67.07 Fix a defect.

- **Expected:** Given a defect, the agent finds the cause and edits the code to fix it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:1104; apps/cli/src/features/exec/tools/mod.rs:1125
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a copy of a git project that has a known defect
- **Steps:**
  1. Run: agi in a copy of a git project (not your real work)
  2. At the box "Message AGI...  / for commands" type a defect to fix, for example: The total is off by one in the sum function; find the cause and fix it
  3. Press Enter; on each approval box press "Yes" or choose "No"
  4. Check the answer names the cause and the line changed, and the "Files changed this turn" line lists the file

## S67.08 Refactor code.

- **Expected:** The agent restructures existing code across files without changing behaviour.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:1104; apps/cli/src/features/exec/tools/mod.rs:1125
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a copy of a git project to change
- **Steps:**
  1. Run: agi in a copy of a git project (not your real work)
  2. At the box "Message AGI...  / for commands" type: Move the helper functions in this file into a new module, without changing behaviour
  3. Press Enter; on each approval box press "Yes" or choose "No"
  4. Check the new module exists, the old file calls it, and the tests still pass when you run them yourself

## S67.09 Generate tests.

- **Expected:** The agent writes new test files or cases for existing code.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:1104; apps/cli/src/features/exec/tools/mod.rs:1125
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a copy of a git project with an existing test file
- **Steps:**
  1. Run: agi in a copy of a git project (not your real work)
  2. At the box "Message AGI...  / for commands" type: Write new unit tests for the sum function in the existing test file
  3. Press Enter; on each approval box press "Yes" or choose "No"
  4. Check that the new test cases appear in the file and that they match the function's behaviour

## S67.10 Run tests.

- **Expected:** The agent runs the project's test suite and reports the result.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder with a test suite
- **Steps:**
  1. Run: agi in a project folder that has a test suite
  2. At the box "Message AGI...  / for commands" type: Run the project's test suite and tell me the result
  3. Press Enter; if an approval box appears for the command, press "Yes"
  4. Check that the answer reports the command it ran and the pass or fail counts, and that they match the terminal output

## S67.11 Interpret test failures.

- **Expected:** After a test run fails, the agent reads the failure output and explains or fixes the cause.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a copy of a project with a failing test
- **Steps:**
  1. Run: agi in a project folder whose tests fail (a copy made for testing)
  2. At the box "Message AGI...  / for commands" type: Run the tests, then explain why the first failing test fails
  3. Press Enter; press "Yes" on any command approval box
  4. Check that the answer quotes the failure message and names the file and line it points to

## S67.12 Run type checking.

- **Expected:** The agent runs the project's type checker and reports errors.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder with a type checker
- **Steps:**
  1. Run: agi in a project folder that uses a type checker
  2. At the box "Message AGI...  / for commands" type: Run the type checker and report the errors
  3. Press Enter; press "Yes" on any command approval box
  4. Check that the answer lists the errors with file and line, and that they match the checker output in the terminal

## S67.13 Run linting.

- **Expected:** The agent runs the project's linter and reports findings.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder with a linter
- **Steps:**
  1. Run: agi in a project folder that has a linter
  2. At the box "Message AGI...  / for commands" type: Run the linter and report the findings
  3. Press Enter; press "Yes" on any command approval box
  4. Check that the answer lists the findings and that they match the linter output in the terminal

## S67.14 Build applications.

- **Expected:** The agent builds the application with the project's build command.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder with a build step
- **Steps:**
  1. Run: agi in a project folder that has a build step
  2. At the box "Message AGI...  / for commands" type: Build the application and report whether it succeeded
  3. Press Enter; press "Yes" on any command approval box
  4. Check that the answer says success or failure and that it matches the build output in the terminal

## S67.15 Start development servers.

- **Expected:** The agent starts a development server and keeps it running while it continues working.
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/bash/mod.rs:74
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands"; then /tasks (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder with a development server
- **Steps:**
  1. Run: agi in a project folder that has a development server
  2. At the box "Message AGI...  / for commands" type: Start the development server and keep it running while you work on something else
  3. Press Enter and wait for the answer; then type: /tasks and press Enter
  4. Check that the server is listed as a background command with an id, and that the app it serves responds in a browser

## S67.16 Inspect browser behavior.

- **Expected:** The agent opens the app in a browser and inspects how it behaves (navigate, click, read, screenshot).
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:1756; apps/cli/src/browser_bridge.rs:151
- **Where to find it:** agi, then /chrome (labels found in the code)
- **Needs:** A paired AGI Desktop with the AGI Chrome extension
- **Steps:**
  1. Open AGI Desktop, install the AGI Chrome extension and pair it, as the Chrome status message asks
  2. Run: agi, then type: /chrome and press Enter
  3. Read the "Chrome integration" block; it should say the browser is paired
  4. Type at the box "Message AGI...  / for commands": Open the page in the paired browser, read its main heading, and take a screenshot
  5. Check that the answer shows the heading and a screenshot is taken, and that the page matches the browser

## S67.20 Review code changes.

- **Expected:** The agent reviews the current code changes and reports issues with file/line references.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6430; apps/cli/src/review.rs:44
- **Where to find it:** agi, then /review (labels found in the code)
- **Needs:** An AGI CLI signed in; a git project with uncommitted changes
- **Steps:**
  1. In a git project, change one file without committing
  2. Run: agi, then type: /review and press Enter
  3. Wait for the answer; read the overall verdict and each issue
  4. Check that each issue names a file and line, and that the lines match the uncommitted change

## S67.21 Review pull requests.

- **Expected:** The agent reviews a pull request (fetches its diff) and posts or shows review findings.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:788; apps/cli/src/review.rs:227; apps/cli/src/review.rs:174
- **Where to find it:** agi review --pr <number> (in a terminal) (labels found in the code)
- **Needs:** GitHub CLI signed in with access to a test pull request; --post writes a real comment, so use a test pull request only
- **Steps:**
  1. In a project folder with the GitHub CLI signed in, run: agi review --pr <number of a test pull request>
  2. Wait for the review; read the findings it prints
  3. Check that the findings match the pull request's diff on GitHub
  4. Only for a test pull request, add --post to post the review as a comment and check the comment appears on the pull request

## S67.22 Scan for security problems.

- **Expected:** The agent scans the code for security problems and reports them.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:301; apps/cli/src/claude_parity.rs:1964
- **Where to find it:** agi, then /security-review (labels found in the code)
- **Needs:** An AGI CLI signed in; a project folder
- **Steps:**
  1. Run: agi, then type: /security-review and press Enter
  2. In the "Security review scope" box choose "Changed files only" or "Whole repository" and press Enter
  3. Wait for the answer
  4. Check that it lists security findings with file and line, and that they match the code

## S67.23 Explain findings.

- **Expected:** After a review or scan, the agent explains each finding in plain language with its location.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:781; apps/cli/src/review.rs:44
- **Where to find it:** agi, then /security-review (or /review) (labels found in the code)
- **Needs:** An AGI CLI signed in; a project with a known issue
- **Steps:**
  1. Run /review or /security-review in a project with a known issue
  2. Wait for the answer
  3. Read each finding; it should give the file, the line and a plain-language explanation
  4. Check that each explanation matches the code at that location

## S67.24 Propose patches.

- **Expected:** The agent proposes a change as a reviewable patch before or as it applies it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6582; apps/cli/src/features/exec/tools/mod.rs:1125
- **Where to find it:** agi, then /diff-review (review the agent's changed files before they are kept) (labels found in the code)
- **Needs:** An AGI CLI signed in; a throwaway copy of a git project (the discard key is destructive)
- **Steps:**
  1. Run: agi in a throwaway copy of a git project
  2. At the box "Message AGI...  / for commands" ask for a change to a file
  3. When an approval box appears, read the file name and the lines shown before choosing "Yes" or "No"
  4. After the change, type: /diff-review and press Enter
  5. In the "Diff Review" box, read the file and its diff before pressing y or n

## S67.25 Apply selected patches.

- **Expected:** The user picks which of the agent's proposed patches to apply, and only those are applied.
- **Code:** done. Evidence present: apps/cli/src/diff_model.rs:154; apps/cli/src/tui/widgets/diff_review.rs:355; apps/cli/src/tui/tui_app.rs:1298
- **Where to find it:** agi, then /diff-review (labels found in the code)
- **Needs:** An AGI CLI signed in; a throwaway copy of a git project (d twice discards an unstaged hunk and cannot be undone)
- **Steps:**
  1. In a throwaway copy of a git project, make changes to two files
  2. Run: agi, then type: /diff-review and press Enter
  3. In the "Diff Review" box press y on the file to keep, n to reject, s to skip; move with the arrow keys
  4. Press Enter to finish, then run git status in the folder
  5. Check that only the files you pressed y on are staged

## S67.26 Generate documentation.

- **Expected:** The agent writes or updates documentation (README, doc comments) from the code.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:1104; apps/cli/src/features/exec/tools/mod.rs:1125
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands"; /init makes AGENTS.md (labels found in the code)
- **Needs:** An AGI CLI signed in; a copy of a project folder to change
- **Steps:**
  1. Run: agi in a copy of a project folder
  2. At the box "Message AGI...  / for commands" type: Update the README with a short section that explains the main commands, from the code
  3. Press Enter; press "Yes" on any file approval box
  4. Check that the README changed and that each new statement matches the code

## S67.27 Perform migrations.

- **Expected:** The agent performs a code or schema migration across the repository.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:1104; apps/cli/src/features/exec/tools/mod.rs:1125
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a copy of a project with migrations (do not run against a real database)
- **Steps:**
  1. Run: agi in a copy of a project that has a schema or migration step
  2. At the box "Message AGI...  / for commands" type: Add a migration that adds a new column, following the existing migration pattern
  3. Press Enter; press "Yes" on each approval box
  4. Check that a new migration file exists and the existing migrations were not changed

## S67.28 Upgrade dependencies.

- **Expected:** The agent upgrades dependencies and adjusts code to the new versions.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/features/exec/tools/mod.rs:1104; apps/cli/src/features/exec/tools/mod.rs:1125
- **Where to find it:** agi, then type in the box "Message AGI...  / for commands" (labels found in the code)
- **Needs:** An AGI CLI signed in; a copy of a project with a dependency to upgrade
- **Steps:**
  1. Run: agi in a copy of a project with an out-of-date dependency
  2. At the box "Message AGI...  / for commands" type: Upgrade the dependency named X to its latest version and adjust the code that breaks
  3. Press Enter; press "Yes" on each approval box
  4. Check that the manifest version changed, the lock file was updated by the package manager, and the code still builds when you run it yourself

## S67.29 Create commits.

- **Expected:** The agent (or user from the coding surface) commits the session's changes with a message.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/platform/runtime/git_tools.rs:135; apps/cli/src/features/exec/tools/mod.rs:564
- **Where to find it:** agi, then ask the agent in the chat to commit the staged changes (there is no /commit command; the agent runs its git_commit tool) (labels found in the code)
- **Needs:** a git repository with a staged change, and a signed-in account that can run the agent
- **Steps:**
  1. Start agi in a git repository and stage a small change, for example with git add outside agi.
  2. Type a request such as: commit the staged changes with the message "docs: fix typo".
  3. When the approval line appears, read it. It should begin with "Commit:" and show the message subject.
  4. Approve it, then run git log -1 in another terminal and compare the commit message with what was approved and with Expected.

## S67.30 Create branches.

- **Expected:** The agent creates a git branch for its work.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/platform/runtime/git_tools.rs:168
- **Where to find it:** agi, then ask the agent in the chat to create a branch (there is no branch slash command; the agent runs its git_branch_create tool) (labels found in the code)
- **Needs:** a git repository, and a signed-in account that can run the agent
- **Steps:**
  1. Start agi in a git repository.
  2. Type a request such as: create a branch named feature/test-branch from HEAD.
  3. When the approval line appears, check it mentions "branch create".
  4. Approve it, then run git branch in another terminal and compare with Expected. Note that git_branch_create does not switch to the new branch.

## S67.32 Respond to review feedback.

- **Expected:** The agent reads review comments on a pull request and changes the code to address them.
- **Code:** done. Evidence moved: apps/cli/src/pr_feedback.rs:212; apps/cli/src/pr_feedback.rs:338; apps/cli/src/claude_parity.rs:312 (quoted code not found in the file now)
- **Where to find it:** agi, then type /pr-comments <number> to read review comments, or /autofix-pr <number> to have the agent change the code (labels found in the code)
- **Needs:** GitHub CLI signed in, a pull request with review comments, and its branch checked out
- **Steps:**
  1. On a checkout of a pull request branch with review comments, start agi in that folder.
  2. Type /pr-comments 123 (use your pull request number) and read the feedback the agent shows.
  3. Type /autofix-pr 123 and add an instruction such as: address the review comments.
  4. Check that the agent edits files, and compare the result with Expected. If the checkout is on another branch, the message asks you to run gh pr checkout first.

## S67.36 Run bounded goal/completion loops.

- **Expected:** The user sets a goal and a bound (turns/time) and the agent loops until done or the bound is hit.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:304; apps/cli/src/agent/chat.rs:1447
- **Where to find it:** agi --max-turns 5, then type /workflow <goal> in the chat; the turn bound also comes from agi --effort low|medium|high|max and /budget <credits> (labels found in the code)
- **Needs:** a signed-in account and a project folder
- **Steps:**
  1. Start agi with agi --max-turns 5 in a project folder.
  2. Type /workflow followed by a goal, such as: add a short README section about setup.
  3. Watch the stages and subagent steps the agent shows.
  4. Check that the run ends when the goal is done or stops at the turn limit, and compare with Expected. For a spend bound, type /budget 50 first and see the confirmation text.

## S67.37 Persist useful repository-specific Memory.

- **Expected:** The agent saves useful repository-specific facts to memory and reuses them in later sessions on that repository.
- **Code:** done. Evidence moved: apps/cli/src/memory.rs:243; apps/cli/src/agent/prompt.rs:399 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:6330; apps/cli/src/repl/registry.rs:1990
- **Where to find it:** Type /memory add project <text> in the chat, then start agi again in the same folder and ask about it (labels found in the code)
- **Needs:** a project folder (a project root is required for the project tier)
- **Steps:**
  1. In a project folder, type /memory add project Use tabs for indentation.
  2. Read the confirmation text, which starts with "Appended to" and shows the file path.
  3. Quit agi, start it again in the same folder, and ask: what indentation style should you use?
  4. Check that the answer uses the saved fact, and compare with Expected.

## S67.38 Load repository instruction files.

- **Expected:** The agent loads the repository's instruction files (AGENTS.md, CLAUDE.md) and follows them.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7799; apps/cli/src/agent/prompt.rs:396 (quoted code not found in the file now); apps/cli/src/app_server/surfaces.rs:64
- **Where to find it:** no screen of its own. Instruction files are loaded by compaction::load_instructions and the app_server surfaces code; no screen lists the loaded files was found.
- **Needs:** a test folder you create yourself, outside the project folder, and a signed-in account
- **Steps:**
  1. In an empty test folder outside the project, create a file named AGENTS.md that says: always end every reply with the word DONE.
  2. Start agi in that folder and ask a simple question.
  3. Check that the reply ends with DONE, and compare with Expected.

## S67.39 Use project-specific Skills and Plugins.

- **Expected:** The agent uses skills and plugins defined in the project and the user can see or toggle them.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6198; apps/cli/src/skills.rs:144
- **Where to find it:** agi, then type /skills to list skills, /skills-toggle to turn them on or off, and /plugin to see plugins (labels found in the code)
- **Needs:** a test folder you create, and a signed-in account
- **Steps:**
  1. Create a skill file ending in .md in .agiworkforce/skills/ in a test folder, then start agi there.
  2. Type /skills and find the skill name in the list headed Skills (N).
  3. Type /skills-toggle, move to the skill with the arrow keys, press Space to turn it off, then Enter to save.
  4. Type /skills again and check that it is gone from the list, then type /plugin and compare with Expected.
