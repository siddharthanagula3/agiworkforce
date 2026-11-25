---
id: "AREA-066"
type: "area"
title: "Coding-workspace frontend"
features: ["F066-01", "F066-02", "F066-03", "F066-04", "F066-05", "F066-06", "F066-07", "F066-08", "F066-09", "F066-10", "F066-11", "F066-12", "F066-99"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 66. Coding-workspace frontend

A coding session lets a person ask the AI agent to read, change and test code in a project folder or a git repository. The person picks the folder or repository, watches the agent work, sees the changes and checks, and decides what it may do without asking. This area is the screens and controls for that: starting a session, the session list, the file and terminal panels, the change review, checkpoints, plan and approval modes, usage, previews, pull requests, and sharing. It matters because it is the part of the product where the agent touches real files and runs real commands, so the controls for permission and review carry the trust.

**Who uses it.** Local sessions (on the person's own computer) run only inside the desktop app, because the web page only reaches a local folder through the desktop host bridge (apps/web/features/code/hooks/use-local-sessions.ts:121, apps/web/features/desktop-host/lib/host.ts:34-36). Cloud sessions (in a managed sandbox) need the deployment flag and a paid plan that includes coding (apps/web/app/api/code/sessions/route.ts:57-64). Sharing a cloud session is limited by the person's role in a workspace (apps/web/lib/services/cloud-code-session-sharing.ts:32-35). Mobile is a remote control for sessions that run on a desktop, not a separate runner. Developers use the terminal CLI and the VS Code extension directly.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F066-01](F066-01-start-a-session-in-a-folder-branch-or-worktree.md) | Start a session in a folder, branch or worktree | partly | partly | no | partly | partly | n/a |
| [F066-02](F066-02-session-list-titles-and-status.md) | Session list, titles and status | partly | built | built | built | built | n/a |
| [F066-03](F066-03-files-search-editor-diagnostics-and-selected-code.md) | Files, search, editor, diagnostics and selected-code context | partly | partly | no | partly | built | n/a |
| [F066-04](F066-04-terminal-and-command-history.md) | Terminal and command history | partly | partly | partly | partly | built | n/a |
| [F066-05](F066-05-review-the-agent-s-changes.md) | Review the agent's changes | partly | partly | partly | partly | partly | n/a |
| [F066-06](F066-06-checkpoints-and-rewind.md) | Checkpoints and rewind | partly | built | no | built | built | n/a |
| [F066-07](F066-07-plan-mode-edit-mode-and-permission-control.md) | Plan mode, edit mode and permission control | partly | built | partly | built | built | n/a |
| [F066-08](F066-08-usage-and-context-window-indicator.md) | Usage and context-window indicator | partly | built | partly | built | built | n/a |
| [F066-09](F066-09-background-tasks-subagents-and-running-servers.md) | Background tasks, subagents and running servers | no | partly | no | partly | built | n/a |
| [F066-10](F066-10-live-browser-preview-and-simulator.md) | Live browser preview and simulator | no | partly | no | no | no | n/a |
| [F066-11](F066-11-pull-request-checks-test-results-recap.md) | Pull request, checks, test results, recap | partly | partly | partly | partly | no | n/a |
| [F066-12](F066-12-continue-share-and-move-sessions.md) | Continue, share and move sessions | partly | built | partly | built | partly | n/a |
| [F066-99](F066-99-other-items.md) | Other items in Coding-workspace frontend | no | n/a | no | no | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/066-coding-workspace-frontend.md](../../10-requirements/capabilities/066-coding-workspace-frontend.md).

## How this area works in the code

1. **Pick the place to run.** On web, the composer lets the person choose the runtime, folder and placement (folder, new worktree, or new worktree with changes). The placement values are fixed in one list. (`apps/web/features/code/components/CodeComposer.tsx:330`, `apps/web/features/code/components/CodeComposer.tsx:559-572`, `apps/web/features/code/local-code.ts:1488-1499`)
2. **Decide local or cloud.** The web page treats itself as a desktop host only when the desktop bridge exists. Without it, the local side is off and only cloud sessions can be listed. The cloud list reports whether the deployment and the plan allow coding. (`apps/web/features/code/hooks/use-local-sessions.ts:121`, `apps/web/features/desktop-host/lib/host.ts:34-36`, `apps/web/app/api/code/sessions/route.ts:46-64`)
3. **Start a local session.** The web page asks the desktop shell to start a session. The shell checks the request, then starts the bundled CLI agent in the folder (or in a worktree) with the chosen start point. (`apps/desktop/electron/runtime/dispatcher.ts:2726-2745`, `apps/desktop/electron/runtime/developerSessionService.ts:154`, `apps/desktop/electron/runtime/developerSessionService.ts:2758`)
4. **Start a cloud session.** The server first checks that the deployment has the sandbox flag and key and a price rate, then the private-beta gate, then the plan's active-sandbox limit. Only then is a cloud session created. (`apps/web/lib/services/cloud-code-session-open.ts:44-49`, `apps/web/lib/e2b/gate.ts:20-28`, `apps/web/lib/managed-compute-gate.ts:55-58`, `apps/web/lib/services/cloud-code-session-service.ts:1243-1256`)
5. **Check the permission for each action.** Each desktop action is listed with the capability it needs and a plain reason. Running programs, computer use and remote control each need their own grant. The agent's approval policy is set in the composer and sent with each turn. (`apps/desktop/electron/runtime/dispatcher.ts:700-710`, `apps/desktop/electron/runtime/dispatcher.ts:1103-1110`, `apps/web/features/code/components/CodeComposer.tsx:1439-1446`, `packages/contracts/types/src/tool-approval-policy.ts:4-13`)
6. **Show status and events.** The desktop forwards events from the CLI. The web page turns each event into a row marker: running, needs approval, needs input, or failed. A turn that ends normally clears the marker. (`apps/web/features/code/local-code.ts:467-473`, `apps/web/features/code/local-code.ts:486-512`, `apps/web/features/code/local-code.ts:516-524`)
7. **Read and edit files and git state.** File reads and saves go through the desktop bridge. The change list and diff come from git commands run on the folder. Editing refuses non-UTF-8 and very large files. (`apps/web/features/code/components/LocalFileEditor.tsx:12`, `apps/desktop/electron/runtime/gitService.ts:575`, `apps/desktop/electron/runtime/gitService.ts:681-712`)
8. **Keep queued messages in the page.** Follow-up messages, a draft and attached context files for a local session are kept in a memory map in the page. They are lost on a full reload. (`apps/web/features/code/local-session-memory.ts:18`, `apps/web/features/code/local-session-memory.ts:28`)
9. **Remote control from phone.** The mobile app sends session commands (list, attach, detach, steer) over the remote link. The desktop host controller receives them and acts on the session. (`apps/mobile/src/features/companion/remote-code/service.ts:29-41`, `packages/platform/utils/src/remoteControl/codeRemoteController.ts:1081-1084`, `packages/platform/utils/src/remoteControl/remoteControlHost.ts:53`)
10. **Share a cloud session.** The owner changes the sharing state; the server checks the workspace role first. A teammate opens the shared page, which loads the session read-only. (`apps/web/lib/services/cloud-code-session-sharing.ts:32-35`, `apps/web/lib/services/cloud-code-session-sharing.ts:63`, `apps/web/features/code/SharedCodeSessionPage.tsx:120`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/code/components/CodeComposer.tsx` | The composer: runtime, folder, placement, branch and approval-mode controls for both local and cloud sessions. |
| `apps/web/features/code/components/LocalSessionPanel.tsx` | The session screen for a local session: transcript, approvals, usage ring, and the side panes (changes, browser, simulator, files, review, subagents). |
| `apps/web/features/code/local-code.ts` | Copy strings, session marker logic (running, needs approval, needs input, failed), placements, and approval option lists for local sessions. |
| `apps/web/features/code/hooks/use-local-sessions.ts` | Loads the local session list through the desktop bridge and handles add folder, allow sessions, and reviewing MCP servers. |
| `apps/web/lib/e2b/gate.ts` | Switches for the sandbox (cloud execution): key and flag checks that decide whether cloud coding can run. |
| `apps/web/lib/services/cloud-code-session-open.ts` | Server gate that opens a cloud session, refusing when the deployment or private beta is off. |
| `apps/desktop/electron/runtime/dispatcher.ts` | Desktop routing table: one entry per action, each with its capability and a plain reason shown to the person. |
| `apps/desktop/electron/runtime/developerSessionService.ts` | Desktop service that starts, lists and drives coding sessions by running the bundled CLI agent. |
| `apps/desktop/electron/runtime/gitService.ts` | Git reads and writes for the workspace: changes, diffs, discard, branch list, switch and push. |
| `apps/cli/src/cli_options.rs` | Defines the CLI permission modes (default, plan, auto, bypass, dontAsk). |
| `apps/cli/src/agent/history.rs` | CLI checkpoint save, restore and summary list for a session. |
| `packages/contracts/types/src/tool-approval-policy.ts` | Shared list and defaults for the approval policies used by every app. |

## What is stored

- Cloud coding session rows, turns, terminal entries, approvals and environments: Database tables named in apps/web/lib/services (cloud_code_sessions, cloud_code_agent_turns, cloud_code_terminal, cloud_code_agent_approvals, cloud_code_environments); the exact schema file was not opened
- Local session queue, draft and attached context files: In-page memory map, apps/web/features/code/local-session-memory.ts:18; lost on reload
- Local session history, threads and checkpoints: Written by the bundled CLI agent on the user's computer; the exact storage path was not established
- Git state, changes and branches of the workspace folder: Read live from the folder's git repository (apps/desktop/electron/runtime/gitService.ts)
- Approval policy choice per session or account: Sent with each turn from the composer (apps/web/features/code/components/CodeComposer.tsx:1398-1446); server storage not traced
- Cloud session sharing state: apps/web/lib/services/cloud-code-session-sharing.ts:63

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_E2B_EXECUTION (set to 1)**: Turns on the cutover to cloud execution. Without it, cloud session provisioning is refused. (apps/web/lib/e2b/gate.ts:6, 16-18, 20-28)
- **E2B_API_KEY**: The sandbox provider key. Its presence alone enables the execution check; provisioning also needs the flag and a priced rate. (apps/web/lib/e2b/gate.ts:7, 9-14, 20-28)
- **Sandbox rate card**: Cloud provisioning is allowed only when a rate can be resolved. (apps/web/lib/e2b/compute-metering.ts:89-91)
- **AGI_MANAGED_COMPUTE_PRIVATE_BETA**: Private-beta gate for managed compute. On when unset; setting it to 0, false or off turns cloud sessions off. (apps/web/lib/managed-compute-gate.ts:55-58; read by apps/web/lib/services/cloud-code-session-open.ts:49-53)
- **Plan includes coding and active-sandbox limit**: Decides whether the coding feature is offered and how many cloud sessions can run at once. (apps/web/app/api/code/sessions/route.ts:46, 57-64; apps/web/lib/services/cloud-code-session-service.ts:1243-1256)
- **Tool approval policy default**: Sets the starting approval policy (ask every time) and the cloud account default (autonomous). (packages/contracts/types/src/tool-approval-policy.ts:11-13; apps/web/lib/services/cloud-code-agent-loop.ts:111)
- **Desktop capability grants per folder**: Running commands, computer use and remote control each need a grant; the list of sessions is hidden until command access is allowed. (apps/desktop/electron/runtime/dispatcher.ts:700-710, 1103-1110; apps/web/features/code/local-code.ts:70-72)
- **CLI worktree flag**: Starts the session in its own git worktree. (apps/cli/src/lib.rs:413-417)
- **CLI permission mode**: Chooses default, plan, auto, bypassPermissions or dontAsk. (apps/cli/src/cli_options.rs:12-24)
- **Desktop CLI capability advertisement**: Shows or hides worktree, checkpoint, approval and thread features based on what the bundled CLI reports. (apps/desktop/electron/runtime/developerSessionService.ts:489-501, 1365)
- **Local context file attach**: Off for remote SSH sessions and when the capability is missing. (apps/web/features/code/components/LocalSessionPanel.tsx:435)

## Shared between apps

[{"what": "Approval policy names and defaults", "where": "packages/contracts/types/src/tool-approval-policy.ts, used by web (apps/web/features/code), mobile (apps/mobile/src/features/chat/components/ComposerApprovalModeControl.tsx) and the desktop shell"}, {"what": "Remote-control code session commands (list, attach, detach, steer)", "where": "packages/platform/utils/src/remoteControl/codeRemoteController.ts and remoteControlHost.ts, used by the desktop host and mobile"}, {"what": "Local session types and the local runtime contract", "where": "@agiworkforce/local-runtime-contract, imported by apps/web/features/code/hooks/use-local-sessions.ts"}, {"what": "Message queue for follow-ups", "where": "@agiworkforce/client-runtime/queue, used by apps/web/features/code/local-session-memory.ts"}, {"what": "UI primitives: Spinner and useConfirmAction", "where": "@agiworkforce/ui, used by LocalFileEditor.tsx"}, {"what": "Separate per app", "where": "Web panels in apps/web/features/code; desktop routing in apps/desktop/electron/runtime; terminal interface in apps/cli/src/tui; VS Code code in apps/extension-vscode/src; mobile companion in apps/mobile/src/features/companion"}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief marks web file tree, file search and editor as missing, but the code exists and is mounted in the session panel (apps/web/features/code/components/LocalFilesPanel.tsx:116; apps/web/features/code/components/LocalFileEditor.tsx:133; apps/web/features/code/components/LocalSessionPanel.tsx:1941)
- Brief marks web subagent list, browser pane and iOS simulator pane as missing, but the code renders them in the session panel (apps/web/features/code/components/LocalSessionPanel.tsx:181, 1922, 1930; apps/web/features/code/components/LocalRunningCommands.tsx:52)
- Brief cites desktop dispatcher lines that do not hold the features it names (for example line 704 is a shell-permission reason table; 882-885 are terminal capability entries; 1078 is a hunk parser; 1105 is computer-use entries) (apps/desktop/electron/runtime/dispatcher.ts:700-710, 882-885, 1076-1082, 1103-1110)
- Brief cites CLI lib.rs:4736 for the worktree picker; the worktree flag is at lib.rs:413-417 (apps/cli/src/lib.rs:413-417)
- Status words 'idle' and 'closed' have no marker in code; the only markers are running, needs-approval, needs-input and failed, and archived is the only closed-like label (apps/web/features/code/local-code.ts:467-473, 380-382)
- Two gate helpers disagree: the execution check is true when the key alone is set, but provisioning also needs the flag and price; the sandbox runtime uses the looser check (apps/web/lib/e2b/gate.ts:9-14 and 20-28; apps/web/lib/e2b/runtime.ts:796)
- Brief lists the web local-session features as 'web' status without saying they work only inside the desktop app (apps/web/features/code/hooks/use-local-sessions.ts:121; apps/web/features/desktop-host/lib/host.ts:34-36)
- Many brief items cite apps/web/lib/e2b/gate.ts:16 as their code, which is a deployment gate, not the feature itself (apps/web/lib/e2b/gate.ts:16-18)

## Not established

- Whether the web Local panels are hidden outside the desktop app in the render path; only the host check was read.
- The storage location and schema of local session history on the user's computer (written by the bundled CLI).
- The exact plan tier names and the number of active sandboxes each plan gets (getPlanMaxSandboxes was not opened).
- How the E2B sandbox runtime (apps/web/lib/e2b/runtime.ts) executes a turn end to end; only the enable check at line 796 was read.
- Where the server stores the approval policy chosen in the composer.
- CLI, VS Code and mobile behaviour was spot-checked by grep only, not read in full; exact behaviour of every listed control is unverified.
- Whether checkpoint restore is reachable from the web or desktop UI (the desktop dispatcher has checkpoint commands but the brief says missing).
- Nothing was built, run or tested. This was a read-only pass, so no localhost or single-surface test was done.
- The mobile repository picker and worktree picker absence was taken from the brief and the file list, not from a full read.
