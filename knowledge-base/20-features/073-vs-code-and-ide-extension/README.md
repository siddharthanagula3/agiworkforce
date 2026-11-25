---
id: "AREA-073"
type: "area"
title: "VS Code and IDE extension"
features: ["F073-01", "F073-02", "F073-03", "F073-04", "F073-05", "F073-06", "F073-07", "F073-08", "F073-09", "F073-10", "F073-11", "F073-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 73. VS Code and IDE extension

The VS Code extension puts the AI assistant inside the editor. A person can chat in a sidebar or an editor tab, and the chat can see the open file, the selected code, problems the editor reports, and the terminal output. Suggested changes come back as a diff the person reviews before anything is written to disk. It matters because the assistant can work on the code the person is already editing, without copy and paste.

**Who uses it.** Every VS Code user who installs the extension (activation at apps/extension-vscode/package.json:45-51). What works depends on how the person is connected. Local mode runs the AGI command-line tool on the device. Own-key mode uses the person's provider key. Cloud mode uses the managed service under the person's plan, and the model picker reads the plan tier (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2000-2021). Workspace trust limits who can use risky features in a folder (apps/extension-vscode/package.json:53-77). The brief and code show no workspace-admin role for this area.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F073-01](F073-01-chat-in-the-sidebar-and-in-an-editor-tab.md) | Chat in the sidebar and in an editor tab | n/a | n/a | n/a | n/a | built | n/a |
| [F073-02](F073-02-context-from-the-editor-open-file-selection-proble.md) | Context from the editor (open file, selection, problems, unsaved text) | n/a | n/a | n/a | n/a | built | n/a |
| [F073-03](F073-03-file-and-symbol-mentions-with.md) | File and symbol mentions with @ | n/a | n/a | n/a | n/a | built | n/a |
| [F073-04](F073-04-inline-suggestions-and-inline-fix-or-refactor.md) | Inline suggestions and inline fix or refactor | n/a | n/a | n/a | n/a | built | n/a |
| [F073-05](F073-05-review-and-apply-changes-in-the-editor-diff.md) | Review and apply changes in the editor diff | n/a | n/a | n/a | n/a | built | n/a |
| [F073-06](F073-06-previous-sessions-and-session-search.md) | Previous sessions and session search | n/a | n/a | n/a | n/a | built | n/a |
| [F073-07](F073-07-terminal-help.md) | Terminal help | n/a | n/a | n/a | n/a | built | n/a |
| [F073-08](F073-08-commands-keyboard-shortcuts-model-and-mode-control.md) | Commands, keyboard shortcuts, model and mode controls, status bar | n/a | n/a | n/a | n/a | built | n/a |
| [F073-09](F073-09-approvals-and-task-notices.md) | Approvals and task notices | n/a | n/a | n/a | n/a | built | n/a |
| [F073-10](F073-10-project-instructions-skills-and-mcp-servers.md) | Project instructions, skills and MCP servers | n/a | n/a | n/a | n/a | built | n/a |
| [F073-11](F073-11-works-in-remote-and-container-windows.md) | Works in remote and container windows | n/a | n/a | n/a | n/a | built | n/a |
| [F073-12](F073-12-workspace-trust-updates-and-version-notices.md) | Workspace trust, updates and version notices | n/a | n/a | n/a | n/a | built | n/a |

Requirement items for this area: [10-requirements/capabilities/073-vs-code-and-ide-extension.md](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md).

## How this area works in the code

1. **1. Start-up.** When the extension activates, it sets up analytics, providers, the local runtime pool (one CLI process per workspace folder), and the chat view. Each part is started inside a guarded boot step, so one failure does not stop the others. (`apps/extension-vscode/src/extension.ts:82-120`, `apps/extension-vscode/src/extension.ts:125-141`, `apps/extension-vscode/src/core/chatSetup.ts:40-66`)
2. **2. Chat view.** The sidebar is a web page inside VS Code (a webview). It is registered with retainContextWhenHidden, so it keeps its state when hidden. The page sends messages to the host, and the host posts state back. (`apps/extension-vscode/src/core/chatSetup.ts:61-66`, `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1523-1534`)
3. **3. Composer send.** When the person sends, the host saves the open file if the setting asks for it, builds the turn with attachments and references, and checks the plan before sending. (`apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4643-4660`, `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5386-5392`)
4. **4. Editor context.** The active file, selection, problems, terminal output and (in trusted folders) git changes are built into context items. Untitled files are flagged. (`apps/extension-vscode/src/data/composerContext.ts:155-163`, `apps/extension-vscode/src/data/composerContext.ts:165-170`, `apps/extension-vscode/src/data/composerContext.ts:177-188`)
5. **5. Local runtime call.** The extension sends a turn-start request to the AGI command-line tool over a JSON-lines connection (one JSON message per line). The tool is found from the agiWorkforce.cliPath setting. The turn result is streamed back. (`apps/extension-vscode/src/integrations/localRuntimeClient.ts:1432`, `apps/extension-vscode/src/integrations/localRuntimeClient.ts:1596-1636`, `apps/extension-vscode/src/integrations/localRuntimeClient.ts:1998-2008`, `apps/extension-vscode/src/platform/config.ts:402-404`)
6. **6. Model and plan choice.** The tier (Local, own key, or a Managed Cloud plan) comes from a cache that is refreshed on a timer. If no tier is known, the default is own key. The model list is grouped by boundary, and models the plan cannot reach are disabled. (`apps/extension-vscode/src/integrations/tierResolver.ts:206-220`, `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2000-2021`, `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2105-2121`)
7. **7. Inline suggestions path.** Ghost-text suggestions are gated by the setting, by the credential check, by sensitive-file rules, and by the selected model route. Local routes are refused for this feature. (`apps/extension-vscode/src/core/providerSetup.ts:75-90`, `apps/extension-vscode/src/core/advancedFeatures.ts:22-50`, `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts:185-200`)
8. **8. Apply and review.** A suggested change is applied only in a trusted workspace and only if the document has not changed. Otherwise it opens in a new tab. A proposed change opens in the native diff, and the diff state drives the context keys for the diff shortcuts. (`apps/extension-vscode/src/platform/applyEdit.ts:45-60`, `apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:90`, `apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:142-146`, `apps/extension-vscode/src/providers/diffDecorationProvider.ts:291-323`)
9. **9. Failure and retry.** Errors are sorted into categories (for example rate limit, provider error) and a retry is offered when the failure is retryable. A permission refusal in an untrusted folder offers Manage Trust. (`apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:128-140`, `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1509`, `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3160-3172`)

## Files to know

| File | Role |
|---|---|
| `apps/extension-vscode/src/extension.ts` | Entry point. Starts every part of the extension in order, registers commands, and reacts to settings changes (status bar, runtime restart). |
| `apps/extension-vscode/src/core/chatSetup.ts` | Creates the sidebar chat view, the session tree, memory, cloud task, schedule, project and artifact providers. |
| `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | The main chat controller (about 7,000 lines). Handles every message from the chat page, sends turns, builds the model list, handles session search, and handles trust and errors. |
| `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | The HTML, CSS and script of the chat page. The brief's line references into this file point at styles, not behaviour (see things_that_look_wrong). |
| `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Starts the AGI command-line tool for a workspace and talks to it over JSON lines. Holds the start-turn call and the trust command constant. |
| `apps/extension-vscode/src/data/composerContext.ts` | Builds the context chips: active file, selection, problems, git changes, terminal output. |
| `apps/extension-vscode/src/platform/applyEdit.ts` | Applies a suggested edit to the document, with trust and version checks. |
| `apps/extension-vscode/src/features/permissions/proposedChangeReview.ts` | Opens a proposed change in the native diff and returns the reviewed text. |
| `apps/extension-vscode/package.json` | Manifest. Commands, menus, keybindings, settings with defaults, activation events, and the untrusted-workspace list. |
| `apps/extension-vscode/src/integrations/tierResolver.ts` | Reads and caches the account plan tier (Local, own key, or a Managed Cloud plan). |
| `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | Turns raw failures into a category, a headline and a retry flag. |
| `packages/contracts/types/src/project-instructions.ts` | The list of project instruction file names, the two-file cap, and the 8,192-character cap. |

## What is stored

- Account token, the account-token-expired flag, and a shared account session key: VS Code SecretStorage (encrypted by the editor), apps/extension-vscode/src/utils/api.ts:228-233 and the key constants in the same file
- Own provider key (API key): VS Code SecretStorage, apps/extension-vscode/src/utils/api.ts:228-233
- Workspace trust consent time per folder: Global state key agiWorkforce.workspaceConsentAtMs.v1, apps/extension-vscode/src/features/permissions/workspaceConsent.ts:4
- Cached plan tier, when it was cached, and a capability document: Global state keys tierStatus.cachedTier, tierStatus.cachedAtMs, tierStatus.capabilityDocument, apps/extension-vscode/src/integrations/tierResolver.ts:46-48
- Last version seen, for the update notice: Global state key agi.lastSeenExtensionVersion, apps/extension-vscode/src/core/hostNotices.ts:6
- Whether the native-chat notice was shown: Global state key agi.nativeChatUnavailableNoticeShown, apps/extension-vscode/src/core/hostNotices.ts:23
- Reply bookmarks, per-model effort, threads set to edit automatically: Global state keys agiWorkforce.replyBookmarks, agiWorkforce.modelReasoningEfforts, agiWorkforce.editAutomaticallyThreads, apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1018-1022
- Session groups and the active cloud project for the workspace: Workspace state, read at apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2660 and 2390-2392
- Chat sessions and their history (local): Kept by the AGI command-line tool, not by the extension. The extension asks the tool over JSON lines (localRuntimeClient.ts:1998). Where the tool stores them was not established.
- Cloud sessions and tasks: Managed service, reached through the cloud clients (for example apps/extension-vscode/src/features/cloud-tasks and cloudSessions). Not traced in detail.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **agiWorkforce.inlineCompletions.enabled (default false, application scope)**: Turns ghost-text suggestions on or off. Needs a sign-in or key. (apps/extension-vscode/package.json:1369-1376; read in apps/extension-vscode/src/core/providerSetup.ts:79 and extension.ts:478-484)
- **agiWorkforce.optOut.inlineCompletions (opt-out setting)**: Turns inline suggestions off for one repository, folder or remote machine. (Read through optOutSettingFor in apps/extension-vscode/src/extension.ts:480-481 (description in package.json:1376))
- **agiWorkforce.model**: The model used by default. Restricted in untrusted folders. (apps/extension-vscode/package.json:1219 and 55-77; read in extension.ts:409 and 473-476)
- **agiWorkforce.agent.mode (ask, auto, plan, bypass)**: How much the agent may do without asking. Changing it can require a local runtime restart. (apps/extension-vscode/package.json:1404; read in src/platform/config.ts:210-215 and extension.ts:313-344)
- **agiWorkforce.agent.effort (none to xhigh)**: Reasoning effort for the agent. (apps/extension-vscode/package.json:1428; read in src/platform/config.ts:218-219)
- **agiWorkforce.agent.planMode**: Plan mode on or off. (Read in apps/extension-vscode/src/platform/config.ts:222 and extension.ts:466)
- **agiWorkforce.agent.requireShellApproval**: Asks before shell commands run. Restricted in untrusted folders. (package.json:55-77; read in extension.ts:132)
- **agiWorkforce.cliPath (default agi)**: Which command-line tool binary the extension starts. Restricted in untrusted folders. Changing it restarts the runtime. (apps/extension-vscode/package.json:1232 and 55-77; read in src/platform/config.ts:131 and 339-351, and extension.ts:446-447)
- **agiWorkforce.memory.enabled**: Turns memory on or off. Changing it restarts the runtime. (apps/extension-vscode/package.json:1332; read in extension.ts:130 and 448-449)
- **agiWorkforce.editorContext.autoAttach, attachOpenFile, attachSelection**: Whether the open file and selection are attached automatically. (apps/extension-vscode/package.json:1292 and related keys; read in extension.ts:490-500)
- **agiWorkforce.respectGitIgnore**: Whether ignored files are left out of context. (apps/extension-vscode/package.json:1316; read in extension.ts:494)
- **agiWorkforce.composer.enterBehavior, followUpBehavior, escapeStops**: What Enter, follow-up messages and Escape do in the composer. (apps/extension-vscode/package.json:1251 and related keys; read in extension.ts:502-509)
- **agiWorkforce.codeLensEnabled**: Turns code lenses on or off. (apps/extension-vscode/package.json:1352; read in extension.ts:486-488)
- **agiWorkforce.saveOpenFileBeforeSend**: Saves the open file before a turn is sent. Restricted in untrusted folders. (apps/extension-vscode/package.json:55-77; read in ChatStateManager.ts:4645)
- **Workspace trust**: In an untrusted folder the CLI runtime is not started (per the manifest), git reads are skipped, and apply is refused. (apps/extension-vscode/package.json:53-77; ChatStateManager.ts:744, 1752, 1767, 2501; composerContext.ts:166; applyEdit.ts:50)
- **Plan tier**: Which models and boundary (Local, own key, Managed Cloud) are offered. Auto is disabled for some plans. (apps/extension-vscode/src/integrations/tierResolver.ts:206-220; ChatStateManager.ts:2000-2021, 2105-2121, 2159-2162)
- **Local model selected**: Refuses inline suggestions and shows a notice. (apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts:193-200)
- **activateOnStartup**: Starts the extension when VS Code starts. (apps/extension-vscode/src/extension.ts:519; read in src/platform/config.ts)
- **Project instruction file list and caps**: Which instruction files load and how long they may be. (packages/contracts/types/src/project-instructions.ts:1-10)

## Shared between apps

Shared between apps: the file apps/extension-vscode/src imports the product-name and project-instruction rules from @agiworkforce/types (apps/extension-vscode/src/extension.ts:32; apps/extension-vscode/src/data/projectInstructions.ts:2-7). Those rules live in packages/contracts/types/src (project-instructions.ts). The extension also talks to the AGI command-line tool, a separate program that other surfaces also use (the tool is not opened in this read; AGENTS.md §5 names apps/cli as the Rust CLI). Separate to this extension: the chat page (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts), every VS Code API call, the trust and diff code under apps/extension-vscode/src/features/permissions and apps/extension-vscode/src/providers, and the inline-suggestion provider. Nothing in this area was checked against the other five apps; the brief lists status only for vscode.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Project instructions load at most two files, so the third listed file (.agiworkforce/instructions.md) is dropped when the first two exist. The brief says all project instruction files apply. (packages/contracts/types/src/project-instructions.ts:2-4 and 9; apps/extension-vscode/src/data/projectInstructions.ts (loop in loadProjectInstructionSources, stops at PROJECT_INSTRUCTION_MAX_SOURCES))
- The update notice only says the extension was updated after the version changed. No check for an available update or a list of what changed was found. The brief says the extension tells users when an update is available and lets them update. (apps/extension-vscode/src/core/hostNotices.ts:8-20)
- The brief cites extension.ts:310 for version-compatibility messaging. That line is part of the permission-restart refresh code. The real notice for a missing feature is announceMissingNativeChat, which covers only the native chat view, not a general unsupported-version or fork check. (apps/extension-vscode/src/extension.ts:307-311; apps/extension-vscode/src/core/hostNotices.ts:22-37; apps/extension-vscode/package.json:17)
- Brief references point to the wrong lines. The status-bar reference extension.ts:221 is in the cloud session command. The diff-review reference ChatStateManager.ts:1002 is the reply-bookmark interface. The inline Tab reference package.json:1060 is a menu entry for Fix. The active-file reference ChatStateManager.ts:2650 is session search. The chat-view-loading references webviewContent.ts:2327 and 2715 are style rules. (apps/extension-vscode/src/extension.ts:221; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1002, 2650; apps/extension-vscode/package.json:1060; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2327, 2715)
- Hunk-level accept and reject is listed as done, but the review code opened returns the whole reviewed text, with no per-hunk choice. (apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:90 and 142-146)
- The local runtime pool is created during activation with a trust callback, but the manifest says the CLI runtime does not start until the folder is trusted. The code path that enforces this was not traced in full. (apps/extension-vscode/src/extension.ts:125-141; apps/extension-vscode/package.json:53-77)

## Not established

- Whether hunk-level accept and reject exists elsewhere in the chat controller or the webview (not checked).
- Whether the Tab key accepts ghost-text suggestions (the key binding was not found in package.json).
- Where the AGI command-line tool stores chat history on disk, and its format.
- Whether an approval or task-finished notice is raised when the chat view is hidden (brief ref sidebarProvider.ts:138 is focus code, not a notice).
- Whether the local runtime is started in untrusted folders (manifest says no; code path not traced).
- How the Explain and Send Selection commands pick the selection (commandSetup.ts:965 was not opened).
- Whether dev containers and WSL are separately checked beyond the remote-name mapping (package.json:19 activation was not read in full).
- Whether the update check exists in another file (only hostNotices.ts was opened).
- Behaviour of the cloud session lists and their failure states (not traced).
- The brief's own cited paths for several items point at different code. This read followed the code, not the brief's line numbers.
- No tests, builds or servers were run, per the task rules. Localhost and one-surface-at-a-time testing was not done in this read-only task.
