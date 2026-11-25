# Area 66. Coding-workspace frontend

41 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S66.01 Repository picker.
- Should: The user chooses which repository or folder a coding session works on before it starts.
- Status: web partial, desktop done, mobile missing, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/CodeComposer.tsx:330; apps/desktop/electron/runtime/dispatcher.ts:704; apps/cli/src/lib.rs:417; apps/cli/src/lib.rs:2966; apps/extension-vscode/src/platform/workspaceFolders.ts:14; apps/extension-vscode/src/platform/workspaceFolders.ts:4
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.02 Branch picker.
- Should: The user chooses the git branch a coding session starts from or works on.
- Status: web partial, desktop done, mobile missing, cli missing, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/CodeComposer.tsx:877; apps/web/features/code/components/CodeComposer.tsx:1443; apps/desktop/electron/runtime/dispatcher.ts:1078; apps/desktop/electron/runtime/gitService.ts:223; apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:17; apps/cli/src/app_server/developer_host.rs:1358; apps/cli/src/app_server/developer_host.rs:3590
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.03 Worktree picker.
- Should: The user picks or creates a git worktree for a coding session so parallel work stays isolated.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing
- Code: apps/cli/src/lib.rs:4736

## S66.04 Local/cloud execution selector.
- Should: Before starting, the user chooses whether the coding session runs locally or in a cloud sandbox.
- Status: web partial, desktop partial, mobile missing, cli missing, vscode missing
- Code: apps/web/lib/e2b/gate.ts:16
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | desktop: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when

## S66.05 Coding-session list.
- Should: The user sees a list of their coding sessions and can open one.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionsSection.tsx:93; apps/desktop/electron/runtime/dispatcher.ts:882; apps/desktop/electron/runtime/developerSessionService.ts:885; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:74; apps/mobile/src/features/companion/remote-code/service.ts:29; apps/cli/src/tui/tui_app.rs:3545; apps/cli/src/tui/tui_app.rs:2672
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.06 Coding-session title.
- Should: Each coding session shows a readable title, and the user can rename it where the surface offers renaming.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:177; apps/desktop/electron/runtime/dispatcher.ts:884; apps/mobile/src/features/companion/components/CodeSessionView.tsx:105; apps/mobile/src/features/companion/remote-code/service.ts:33; apps/cli/src/tui/tui_app.rs:3574; apps/cli/src/repl/registry.rs:757; apps/extension-vscode/src/core/commandSetup.ts:1259
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.07 Session status.
- Should: Each coding session shows whether it is running, waiting for approval, idle, failed or closed.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionsSection.tsx:100; apps/web/features/code/local-code.ts:114; apps/web/features/code/components/LocalSessionsSection.tsx:124; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:13; apps/cli/src/tui/tui_app.rs:3406; apps/cli/src/tui/tui_app.rs:1973; apps/extension-vscode/src/core/commandSetup.ts:1260
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.08 File tree.
- Should: The coding workspace shows a browsable tree of the repository's files.
- Status: web missing, desktop missing, mobile missing, cli missing

## S66.09 File search.
- Should: The user searches the workspace for files by name from inside the coding surface.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done
- Code: apps/cli/src/tui/widgets/mention_popup.rs:1; apps/cli/src/mentions.rs:137; apps/extension-vscode/src/data/mentionSearch.ts:41; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:93

## S66.10 Symbol search.
- Should: The user searches for code symbols (functions, classes) by name from the coding surface.
- Status: web missing, desktop missing, mobile missing, vscode done
- Code: apps/extension-vscode/src/data/mentionSearch.ts:60; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:93

## S66.11 Code editor.
- Should: The user can open and edit a source file inside the coding surface.
- Status: web missing, desktop done, mobile missing, cli missing, vscode done
- Code: apps/web/features/code/components/LocalChangesPanel.tsx:68; apps/web/features/code/components/LocalFileEditor.tsx:32; apps/web/features/code/components/LocalFileEditor.tsx:52; apps/desktop/electron/runtime/dispatcher.ts:863; apps/extension-vscode/src/core/commandSetup.ts:789; apps/extension-vscode/src/platform/applyEdit.ts:59; apps/extension-vscode/src/providers/diffDecorationProvider.ts:346

## S66.12 Editor tabs.
- Should: Several files can be open at once in editor tabs.
- Status: web missing, desktop missing, mobile missing, cli missing

## S66.13 Selected-code context.
- Should: The user selects code in the workspace and sends that selection to the agent as context.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done
- Code: apps/cli/src/mentions.rs:397; apps/extension-vscode/src/core/commandSetup.ts:965; apps/extension-vscode/src/core/commandSetup.ts:739; apps/extension-vscode/src/data/contextExclusion.ts:132; apps/extension-vscode/src/__tests__/contextExclusion.test.ts:1

## S66.14 Diagnostics panel.
- Should: The workspace shows compiler/linter diagnostics and lets the user act on them.
- Status: web missing, desktop missing, mobile missing, vscode done
- Code: apps/extension-vscode/src/providers/errorExplainerProvider.ts:11; apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts:75

## S66.15 Integrated terminal.
- Should: The user runs shell commands in a terminal attached to the coding session and sees their output.
- Status: web partial, desktop done, mobile missing, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalChangesPanel.tsx:240; apps/web/features/code/components/LocalTerminal.tsx:67; apps/desktop/electron/runtime/dispatcher.ts:885; apps/cli/src/tui/tui_app.rs:5000; apps/cli/src/repl/mod.rs:785; apps/extension-vscode/src/providers/terminalProvider.ts:312; apps/extension-vscode/src/providers/terminalProvider.ts:98
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.16 Terminal tabs.
- Should: The user keeps several terminals open side by side or in tabs within the coding surface.
- Status: web missing, desktop missing, mobile missing, cli missing

## S66.17 Command-history view.
- Should: The user can review the commands run in the session with their output and exit status.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalTerminal.tsx:149; apps/web/features/code/components/LocalTerminal.tsx:162; apps/web/features/code/components/LocalTerminal.tsx:67; apps/mobile/src/features/companion/components/CodeSessionView.tsx:61; apps/mobile/src/features/companion/components/CodeSessionView.tsx:377; packages/platform/utils/src/remoteControl/codeRemoteController.ts:614; apps/cli/src/tui/tui_app.rs:4865
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.18 Diff viewer.
- Should: The user views a line-level diff of the changes the agent made.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalChangesPanel.tsx:91; apps/desktop/electron/runtime/dispatcher.ts:1105; apps/desktop/electron/runtime/gitService.ts:142; apps/mobile/src/features/companion/components/CodeSessionView.tsx:334; apps/cli/src/tui/tui_app.rs:3974; apps/cli/src/tui/tui_app.rs:4006; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1324
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.19 File-change summary.
- Should: The user sees a summary of which files the session created, modified or deleted.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalChangesPanel.tsx:208; apps/web/features/code/components/LocalChangesPanel.tsx:40; apps/desktop/electron/runtime/gitService.ts:142; apps/mobile/src/features/companion/components/CodeSessionView.tsx:82; apps/cli/src/tui/tui_app.rs:3490; apps/cli/src/platform/runtime/git.rs:210; apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts:47
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.20 Inline review comments.
- Should: The user leaves review comments on specific lines of a change, and the agent can act on them.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S66.21 Hunk acceptance/rejection.
- Should: The user accepts or rejects individual hunks of an agent change.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done
- Code: apps/cli/src/diff_model.rs:154; apps/cli/src/tui/widgets/diff_review.rs:203; apps/cli/src/tui/tui_app.rs:1007; apps/extension-vscode/src/providers/diffDecorationProvider.ts:104; apps/extension-vscode/src/core/commandSetup.ts:842

## S66.22 Checkpoint list.
- Should: The user sees a list of checkpoints (saved states of code and conversation) for the session.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done
- Code: apps/cli/src/agent/history.rs:92; apps/cli/src/tui/tui_app.rs:3005; apps/cli/src/repl/registry.rs:986; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2213; apps/extension-vscode/src/core/commandSetup.ts:1230

## S66.23 Restore checkpoint.
- Should: The user restores the session's code and conversation to an earlier checkpoint.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done
- Code: apps/cli/src/agent/history.rs:105; apps/cli/src/agent/checkpoints.rs:184; apps/cli/src/agent/chat.rs:2659; apps/cli/src/tui/widgets/checkpoint_picker.rs:149; apps/cli/src/tui/tui_app.rs:3028; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2278; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2213

## S66.24 Plan mode.
- Should: The user switches the agent into a plan mode where it proposes a plan and makes no edits until approved.
- Status: web missing, desktop done, mobile missing, cli done, vscode done
- Code: apps/web/features/code/components/LocalSessionPanel.tsx:83; apps/web/features/code/local-code.ts:143; apps/desktop/electron/runtime/dispatcher.ts:231; apps/cli/src/agent/chat.rs:1617; apps/cli/src/tui/tui_app.rs:3314; apps/cli/src/tui/tui_app.rs:3173; apps/extension-vscode/src/core/commandSetup.ts:1632; apps/cli/src/app_server/developer_host.rs:3495

## S66.25 Edit/agent mode.
- Should: The user chooses a mode in which the agent may edit files and run tools on its own (edit/agent mode) versus asking first.
- Status: web partial, desktop done, mobile missing, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:111; apps/web/features/code/local-code.ts:145; apps/cli/src/app_server/developer_host.rs:3655; apps/cli/src/tui/tui_app.rs:4540; apps/cli/src/tui/tui_app.rs:3178; apps/extension-vscode/src/core/commandSetup.ts:961; apps/cli/src/app_server/developer_host.rs:3499
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.26 Permission-mode control.
- Should: The user sets how much the agent must ask before acting (ask every time / auto-approve safe / autonomous), and the running session honours it.
- Status: web partial, desktop done, mobile missing, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:234; apps/desktop/electron/runtime/dispatcher.ts:1055; apps/cli/src/app_server/developer_host.rs:3645; apps/cli/src/tui/tui_app.rs:4540; apps/cli/src/tui/tui_app.rs:3173; apps/extension-vscode/src/core/commandSetup.ts:961; apps/cli/src/app_server/developer_host.rs:3489
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.27 Context-usage indicator.
- Should: The workspace shows how much of the model's context window the session has used.
- Status: web partial, desktop done, mobile missing, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:494; apps/web/features/code/hooks/use-local-session.ts:212; apps/desktop/electron/runtime/developerSessionService.ts:472; apps/cli/src/app_server/developer_host.rs:2441; apps/cli/src/tui/tui_app.rs:2029; apps/cli/src/tui/tui_app.rs:3422; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3312
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.28 Usage/cost indicator.
- Should: The coding surface shows how much plan usage or money the user has spent.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/code/components/CodeComposer.tsx:916; apps/web/lib/hooks/useManagedUsageSummary.ts:67; apps/mobile/src/features/companion/components/CodeSessionView.tsx:108; apps/mobile/src/features/cloud-code/components/CloudCodeTaskOptionsSheet.tsx:231; apps/cli/src/tui/tui_app.rs:1358; apps/cli/src/tui/tui_app.rs:3324; apps/extension-vscode/src/data/tokenCounter.ts:74; apps/extension-vscode/src/data/tokenCounter.ts:119

## S66.29 Background task list.
- Should: The user sees a list of the session's background tasks (long commands, spawned jobs) and their state.
- Status: web missing, desktop missing, mobile missing, cli done
- Code: apps/cli/src/tui/tui_app.rs:5143; apps/cli/src/repl/registry.rs:419

## S66.30 Subagent panel.
- Should: The user sees the subagents the session spawned, what each is doing and its result.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing
- Code: apps/cli/src/tui/tui_app.rs:5143; apps/cli/src/repl/registry.rs:419

## S66.31 Browser preview.
- Should: The workspace shows a live browser preview of the app the session is building.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S66.32 Console-log panel.
- Should: The workspace shows the previewed app's browser console logs.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S66.33 Running-server list.
- Should: The user sees which dev servers the session started, and can stop them.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S66.34 Port/preview URL.
- Should: The workspace shows the port or preview URL of a server the session runs, and opens it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S66.35 Simulator panel where offered.
- Should: Where offered, the workspace shows a device simulator running the app under development.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S66.36 Pull-request panel.
- Should: The workspace shows the session's pull request (open one, see its number/link and state).
- Status: web partial, desktop done, mobile missing, cli missing, vscode missing
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalPullRequest.tsx:95; apps/web/features/code/local-code.ts:124; apps/web/features/code/services/local-pull-request-api.ts:8
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S66.37 CI-status panel.
- Should: The workspace shows CI check status for the session's branch or pull request.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S66.38 Test-results panel.
- Should: The workspace shows the results of test runs (pass/fail, counts, failing output).
- Status: web missing, desktop done, mobile done, cli missing
- Code: apps/web/features/code/components/LocalSessionPanel.tsx:187; apps/web/features/code/components/LocalSessionPanel.tsx:289; apps/desktop/electron/runtime/dispatcher.ts:748; apps/mobile/src/features/companion/components/CodeSessionView.tsx:272

## S66.39 Session recap.
- Should: The user gets a recap of what the session did: goal, decisions, files touched, checks run, next steps.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing
- Code: apps/cli/src/claude_parity.rs:226; apps/cli/src/claude_parity.rs:1166

## S66.40 Share session.
- Should: The user shares a coding session with someone else, who can open it.
- Status: web done, desktop done, mobile missing, vscode missing
- Code: apps/web/features/code/SharedCodeSessionPage.tsx:120; apps/web/lib/services/cloud-code-session-sharing.ts:107; docs/decisions/2026-09-27-founder-decisions.md:334; apps/web/features/code/components/CodeSessionMenu.tsx:129

## S66.41 Continue in another client.
- Should: The user moves an ongoing coding session to another client (terminal, editor, desktop, phone) and continues it there.
- Status: web missing, desktop done, mobile done, cli done, vscode done
- Code: apps/desktop/electron/runtime/dispatcher.ts:874; apps/web/features/desktop-host/components/RemoteControlSection.tsx:74; apps/mobile/src/features/companion/components/CodeSessionView.tsx:89; apps/mobile/src/features/companion/remote-code/service.ts:41; apps/cli/src/lib.rs:829; apps/cli/src/tui/tui_app.rs:2708; apps/extension-vscode/src/core/commandSetup.ts:1239; apps/extension-vscode/src/core/commandSetup.ts:479
