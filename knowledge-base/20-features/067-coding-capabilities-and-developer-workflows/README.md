---
id: "AREA-067"
type: "area"
title: "Coding capabilities and developer workflows"
features: ["F067-01", "F067-02", "F067-03", "F067-04", "F067-05", "F067-06", "F067-07", "F067-08", "F067-09", "F067-10", "F067-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 67. Coding capabilities and developer workflows

This area lets a person hand a coding task to the AI agent: read a project, answer questions about it, change files, run the project's checks, review changes, and turn the result into a branch, a commit or a pull request. It matters because the agent does the reading, editing and checking inside the person's own folder or a managed sandbox, and the person stays in control of each change. Most of the work runs on the user's computer (Desktop app and CLI); the managed cloud version is gated and mostly off.

**Who uses it.** Every signed-in user who opens a coding session on a folder (Desktop, Web via the paired desktop host, CLI, VS Code and Mobile as a remote view). The managed cloud coding path is for users on a plan, and it is off unless the deployment switches are set (see switches). Workspace admins and developers are not separately gated in the code read for this area; GitHub actions need a connected GitHub account (apps/web/app/api/code/local-pull-requests/route.ts:63). The brief's "developers" framing is not a separate role in the code.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F067-01](F067-01-understand-the-repository.md) | Understand the repository | partly | built | built | built | built | n/a |
| [F067-02](F067-02-change-code-implement-fix-refactor-write-tests-and.md) | Change code: implement, fix, refactor, write tests and docs, migrate, upgrade | partly | built | built | built | built | n/a |
| [F067-03](F067-03-run-checks-tests-type-checker-linter-build.md) | Run checks: tests, type checker, linter, build | partly | built | built | built | built | n/a |
| [F067-04](F067-04-start-dev-servers-and-inspect-a-running-app.md) | Start dev servers and inspect a running app | no | partly | no | partly | partly | built |
| [F067-05](F067-05-review-code-changes-pull-requests-and-security.md) | Review code changes, pull requests and security | partly | partly | partly | partly | partly | n/a |
| [F067-06](F067-06-propose-and-apply-patches.md) | Propose and apply patches | partly | built | built | built | built | n/a |
| [F067-07](F067-07-git-work-commits-branches-pull-requests.md) | Git work: commits, branches, pull requests | partly | built | no | built | built | n/a |
| [F067-08](F067-08-work-from-an-issue-or-a-team-mention.md) | Work from an issue or a team mention | partly | no | no | no | no | n/a |
| [F067-09](F067-09-bounded-goal-loops.md) | Bounded goal loops | partly | n/a | no | built | n/a | n/a |
| [F067-10](F067-10-repository-memory-instruction-files-and-skills.md) | Repository memory, instruction files and skills | no | built | no | built | built | n/a |
| [F067-11](F067-11-reports-slides-and-designs-from-the-repository.md) | Reports, slides and designs from the repository | no | no | no | no | no | n/a |

Requirement items for this area: [10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md).

## How this area works in the code

1. **1. The person starts or continues a session in the UI.** The coding panel on Web is a local-folder session panel. It takes the composer text and sends it through the local session pipeline. (`apps/web/features/code/components/LocalSessionPanel.tsx:210-254 (props, including planTier and onForked)`, `apps/web/features/code/components/LocalSessionPanel.tsx:159 (Enter submits)`)
2. **2. The desktop host or the cloud route receives the command.** On Desktop the command is a developer_* command handled by the dispatcher. On Web for a Cloud session, the request first passes the cloud gate; if the gate is off the request is refused with a message to use the desktop app. (`apps/desktop/electron/runtime/dispatcher.ts:880-948 (command to capability and reason table)`, `apps/web/lib/services/cloud-code-session-open.ts:44-53 (refusal when the switch is off or the beta is unavailable)`)
3. **3. The permission check decides what is asked first.** Each command has a capability (for example git.read, git.write, shell.execute, filesystem.read). Most developer commands ask for the agent grant first; git-only commands on this app's own git are answered without starting an agent. (`apps/desktop/electron/runtime/dispatcher.ts:954-960 (commands answered by the app's own git)`, `apps/desktop/electron/runtime/dispatcher.ts:1004-1011 (agent-first rule)`, `apps/desktop/electron/runtime/dispatcher.ts:1013-1024 (requirement per command)`)
4. **4. The agent runs in the folder.** The folder's CLI runs the agent. Its tools are read, write, edit, glob, grep, bash and git tools; mutating tools ask for approval by permission class. (`apps/cli/src/features/exec/tools/mod.rs:320 (tool execution entry)`, `apps/cli/src/platform/runtime/tool_catalog.rs:115-123 (tool names)`, `apps/cli/src/platform/runtime/git_tools.rs:135 (git_commit spec)`)
5. **5. Instruction files and memory are loaded into the prompt.** The CLI reads the folder's instruction files, always-on rules, and the skill catalog and builds the system prompt. (`apps/cli/src/agent/prompt.rs:390-405 (instructions, memory, skills, rules into the prompt)`)
6. **6. Device steps for the desktop and browser.** Screen, shell and browser actions are described as named steps, each with a capability and a short reason shown to the person. The shell steps are: run one command (wait for exit) or start one that keeps running, read its output, and stop it. (`packages/contracts/local-runtime/src/device-steps.ts:158-199 (file and shell steps)`, `packages/contracts/local-runtime/src/device-steps.ts:200-264 (screen and browser steps)`, `apps/web/features/desktop-host/lib/device-steps.ts:392-410 (start and read command handlers on Web)`)
7. **7. Changes are shown and applied only when chosen.** The agent's file changes are listed in the changes panel. The person picks the changes to keep; discard needs a git-write grant. (`apps/web/features/code/components/LocalChangesPanel.tsx:79 and :132`, `apps/desktop/electron/runtime/dispatcher.ts:910-913 (discard capability)`)
8. **8. Git and GitHub actions.** Branch, commit and push go through the app's git service. Opening a pull request on Web calls the local pull request route, which requires a connected GitHub account and records an audit event. (`apps/desktop/electron/runtime/gitService.ts:157 (path list used for write checks)`, `apps/web/app/api/code/local-pull-requests/route.ts:63-80 (auth, GitHub check, open call, audit)`, `apps/web/features/code/components/LocalPullRequest.tsx:120 (button)`)
9. **9. GitHub mentions start a task later.** The GitHub webhook checks the mention, answers at once, and schedules the review or task in the background. The task itself checks the cloud switch and the beta. (`apps/web/app/api/github/webhook/route.ts:236-276 (mention checks, schedule, queued answer)`, `apps/web/lib/services/cloud-code-github-task.ts:221 (switch and beta check)`)
10. **10. Result returns to the screen.** The transcript shows the agent's messages, command output and review findings. Mobile shows the same session as a remote view through the remote control controller. (`packages/platform/utils/src/remoteControl/codeRemoteController.ts:319 and :366 (remote control of sessions)`, `apps/mobile/src/features/companion/components/CodeSessionView.tsx:493 (session view)`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/e2b/gate.ts` | Reads the managed sandbox switch (AGI_E2B_EXECUTION and E2B_API_KEY) and decides whether cloud coding can be provisioned. |
| `apps/web/lib/managed-compute-gate.ts` | Managed-compute private beta gate; on unless the env value is 0, false or off (lines 55-58). |
| `apps/web/lib/services/cloud-code-session-open.ts` | Refuses to open a managed cloud coding session when the switch or beta is off (lines 44-53). |
| `apps/web/features/code/components/LocalSessionPanel.tsx` | Main coding session panel on Web: transcript, composer, approvals, subagents, memory, extensions, pull request block. |
| `apps/desktop/electron/runtime/dispatcher.ts` | Desktop command table: each developer command, its capability and the reason shown to the person; agent-first rule (lines 880-1024). |
| `packages/contracts/local-runtime/src/device-steps.ts` | Shared definitions of the screen, shell, file and browser steps the agent may use, with the capability for each. |
| `apps/cli/src/features/exec/tools/mod.rs` | CLI tool execution entry point (execute_tool_with_opts) that every agent tool call passes through. |
| `apps/cli/src/platform/runtime/git_tools.rs` | Git tool specs: git_commit, git_stage and related; holds the commit-hook rule. |
| `apps/cli/src/review.rs` | CLI review: builds the review, shortens big diffs with a notice, and posts the review markdown to GitHub. |
| `apps/cli/src/pr_feedback.rs` | Fetches pull request review threads and checks through the gh tool and builds the feedback prompt. |
| `apps/web/app/api/code/local-pull-requests/route.ts` | Web endpoint that opens a pull request for a local branch after the GitHub, CSRF and rate checks. |
| `apps/web/app/api/github/webhook/route.ts` | GitHub webhook: handles review mentions and coding task mentions, answers queued and runs work in the background. |
| `apps/extension/src/features/browser-tools/consoleCapture.ts` | Chrome extension console buffer: keeps up to 200 messages and reports 'no messages' when empty. |

## What is stored

- Pull request open audit event: Database, via recordAuditEvent in apps/web/app/api/code/local-pull-requests/route.ts (table not checked)
- Coding sessions saved for a folder (what was asked, what the agent answered, which files changed): Stated by the desktop command text at apps/desktop/electron/runtime/dispatcher.ts:994; the storage location was not confirmed (developerSessionService.ts was not opened)
- Project and user memory facts: Saved by the CLI agent where sessions read them (dispatcher.ts:901-905); the file location was not confirmed
- Git branches, commits and working files: The user's own git repository in their folder on disk
- Console messages (up to 200 per tab, 600 characters each): Browser extension memory: apps/extension/src/features/browser-tools/consoleCapture.ts:3-4
- Managed cloud sandbox session data: Not read; the brief names apps/web/lib/e2b/compute-metering.ts but the file was not opened

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_E2B_EXECUTION=1**: Turns on the managed cloud sandbox path. Together with E2B_API_KEY and a priceable sandbox rate, it makes provisioning ready. (apps/web/lib/e2b/gate.ts:6, 12, 17, 20-28)
- **E2B_API_KEY**: Sandbox provider key. Setting it alone also counts as enabled for execution (not for provisioning). (apps/web/lib/e2b/gate.ts:7, 9-14, 21)
- **AGI_MANAGED_COMPUTE_PRIVATE_BETA**: Managed compute beta. On when unset; set to 0, false or off to turn it off. The cloud open and GitHub task paths also check it. (apps/web/lib/managed-compute-gate.ts:40, 55-58; apps/web/lib/services/cloud-code-session-open.ts:47; apps/web/lib/services/cloud-code-github-task.ts:221)
- **Per-command capability grants (filesystem.read, git.read, git.write, git.destructive, shell.execute, computer.use)**: Each command asks for its grant first; a refused grant stops the command. Discard, branch push and skill trust each ask separately. (apps/desktop/electron/runtime/dispatcher.ts:880-948, 954-1024)
- **Approval modes and the dangerous skip flag**: Controls how often the CLI asks before a tool runs; the dangerous flag adds bypass modes to the mode cycle; auto-approve covers safe reads and searches. (apps/cli/src/lib.rs:313-316)
- **Plan tier prop**: Used only to word a refusal; it does not gate features in the code read. (apps/web/features/code/components/LocalSessionPanel.tsx:217-218)
- **Trust a folder's skills and plugins**: Skills and plugins run scripts only after the person trusts them and turns them on. (apps/desktop/electron/runtime/dispatcher.ts:934-947)

## Shared between apps

Shared: the step definitions for screen, shell, file and browser actions (packages/contracts/local-runtime/src/device-steps.ts); the remote control controller used by Mobile (packages/platform/utils/src/remoteControl/codeRemoteController.ts); the wire protocol for developer sessions (crates/agiworkforce-protocol/src/developer_session.rs). Separate per app: Desktop command handling (apps/desktop/electron/runtime/dispatcher.ts); Web local panel and routes (apps/web/features/code, apps/web/app/api/code); Web device steps on the desktop host (apps/web/features/desktop-host/lib/device-steps.ts); CLI agent tools and git tools in Rust (apps/cli); Mobile session view (apps/mobile/src/features/companion/components/CodeSessionView.tsx); browser extension capture and agent loop (apps/extension/src/features/...); VS Code extension (apps/extension-vscode).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief marks Web 'missing' for starting dev servers and for reading console and network, but the Web device-step handler has start-command and read-output cases. (apps/web/features/desktop-host/lib/device-steps.ts:392 and :402; the Web browser console case at apps/web/features/desktop-host/lib/device-steps.ts (device_browser_console, near line 262))
- Brief marks Web 'missing' for memory and skills, but Web has the memory control and the extensions control. (apps/web/features/code/components/LocalMemoryControl.tsx:34-44; apps/web/features/code/components/LocalExtensionsControl.tsx:107, 127)
- Many code references in the brief point to lines that do not hold the feature (for example LocalSessionPanel.tsx:160 is blank, dispatcher.ts:892 is a terminal permission entry, dispatcher.ts:1107 and :992 are not patch apply or dev server code, device-steps.ts:255 and :260 are wait and open-app descriptions, git_tools.rs:157 is git_stage, cli lib.rs:313 is a permission flag). Use a search, not these line numbers. (apps/web/features/code/components/LocalSessionPanel.tsx:159-160; apps/desktop/electron/runtime/dispatcher.ts:892, 992, 1107; packages/contracts/local-runtime/src/device-steps.ts:255, 260; apps/cli/src/platform/runtime/git_tools.rs:157; apps/cli/src/lib.rs:313)
- The GitHub webhook answers 'queued' before the cloud switch and beta are checked; a user gets a queued reply even when the task will not run in a deployment without the switch. (apps/web/app/api/github/webhook/route.ts:264-275 vs apps/web/lib/services/cloud-code-github-task.ts:221)
- The cloud session open refusal says to use the desktop app, while the brief lists Web as partial for cloud coding. (apps/web/lib/services/cloud-code-session-open.ts:45-47)
- Brief's 'Should' for team mentions in Slack and for simulator driving has no code in the cited files. (Brief S67.34 and S67.19 (no code citations in the brief for Slack or simulator))

## Not established

- Nothing was run: this was a read-only review. No build, test, server or browser check was done, and nothing was checked on localhost.
- Where coding sessions and memory are stored on disk or in the database (developerSessionService.ts and the memory writer were not opened).
- What compute-metering.ts does and whether the sandbox rate card is priceable (brief claim only).
- Whether the webhook task path silently returns or replies when the gate is off (cloud-code-github-task.ts:221 onward not read in full).
- Whether the goal loop with turn and time bounds exists in the code: no file for it was read; the CLI lib.rs and agent/chat.rs citations in the brief were not confirmed.
- Whether the CLI's review posting and PR feedback paths are gated by plan (not checked).
- Full behaviour of approval prompts, conflict handling on apply, and empty states in the Web and Mobile panels (not read in full).
- Whether a Web user without the desktop host can start any local coding session (not traced).
- Plan limits by tier for the coding features (no plan checks found in the files read; LocalSessionPanel only uses planTier for wording).
