---
id: "GAPS-AREA-073"
type: "gap-list"
title: "Gaps: VS Code and IDE extension"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 73. VS Code and IDE extension

41 open gaps that touch this area. Area page: [20-features/073-vs-code-and-ide-extension](../../20-features/073-vs-code-and-ide-extension/README.md).

## GAP-AREA073-LW05

**Hunk-level accept and reject is listed as done, but the review code opened returns the whole reviewed text, with no per-hunk choice.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-073
- Detail: Area 73. VS Code and IDE extension
- Evidence: apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:90 and 142-146

## GAP-AREA073-LW06

**The local runtime pool is created during activation with a trust callback, but the manifest says the CLI runtime does not start until the folder is trusted. The code path that enforces this was not traced in full.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-073
- Detail: Area 73. VS Code and IDE extension
- Evidence: apps/extension-vscode/src/extension.ts:125-141; apps/extension-vscode/package.json:53-77

## GAP-F073-01-01

**No recorded run proves the full flow in a real VS Code window in this knowledge base.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-01](../../20-features/073-vs-code-and-ide-extension/F073-01-chat-in-the-sidebar-and-in-an-editor-tab.md)
- Detail: Affects: Testers, VS Code app. Work needed: Run the integration suite (package.json test:integration) and record results.
- Evidence: No result file read; only unit test files exist.

## GAP-F073-01-02

**Where the local runtime stores threads on disk was not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-01](../../20-features/073-vs-code-and-ide-extension/F073-01-chat-in-the-sidebar-and-in-an-editor-tab.md)
- Detail: Affects: Privacy review. Work needed: Read the CLI thread store and document it.
- Evidence: Not opened.

## GAP-F073-02-01

**Brief line references for this feature are stale (155-163, 177-188).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-02](../../20-features/073-vs-code-and-ide-extension/F073-02-context-from-the-editor-open-file-selection-proble.md)
- Detail: Affects: Docs. Work needed: Refresh the area brief.
- Evidence: composerContext.ts builders at 126-188 and 548-609

## GAP-F073-02-02

**Saving the file before send is off by default, so disk and buffer can differ for the CLI tools the agent runs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-02](../../20-features/073-vs-code-and-ide-extension/F073-02-context-from-the-editor-open-file-selection-proble.md)
- Detail: Affects: VS Code users. Work needed: Decide the default.
- Evidence: package.json:1304-1309

## GAP-F073-03-01

**No empty or loading state for the list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-03](../../20-features/073-vs-code-and-ide-extension/F073-03-file-and-symbol-mentions-with.md)
- Detail: Affects: VS Code users. Work needed: Add a no-results row and a busy indicator.
- Evidence: webviewContent.ts:8243-8245, mentionSearch.ts:167

## GAP-F073-03-02

**Failures are silent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-03](../../20-features/073-vs-code-and-ide-extension/F073-03-file-and-symbol-mentions-with.md)
- Detail: Affects: Testers. Work needed: Log to the developer output channel.
- Evidence: ChatStateManager.ts:1556-1558

## GAP-F073-04-01

**No on-device inline suggestions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-04](../../20-features/073-vs-code-and-ide-extension/F073-04-inline-suggestions-and-inline-fix-or-refactor.md)
- Detail: Affects: Local-only users on VS Code. Work needed: Route completions through a local model.
- Evidence: inlineCompletionProvider.ts:190-199

## GAP-F073-04-02

**Accept key not defined here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-04](../../20-features/073-vs-code-and-ide-extension/F073-04-inline-suggestions-and-inline-fix-or-refactor.md)
- Detail: Affects: Docs and testers. Work needed: Confirm in a real editor and document.
- Evidence: package.json:1485-1580 has no inline-suggestion keybinding

## GAP-F073-04-03

**Plan eligibility of inline suggestions is not stated in code opened.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-04](../../20-features/073-vs-code-and-ide-extension/F073-04-inline-suggestions-and-inline-fix-or-refactor.md)
- Detail: Affects: Subscription rules. Work needed: Check the server route and record.
- Evidence: No entitlement check in inlineCompletionProvider.ts

## GAP-F073-05-01

**No partial hunk acceptance within one proposed change.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-05](../../20-features/073-vs-code-and-ide-extension/F073-05-review-and-apply-changes-in-the-editor-diff.md)
- Detail: Affects: VS Code users. Work needed: Add hunk splitting or correct the brief.
- Evidence: diffDecorationProvider.ts:386-388 replaces one range

## GAP-F073-05-02

**No unit test file named for proposedChangeReview.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-05](../../20-features/073-vs-code-and-ide-extension/F073-05-review-and-apply-changes-in-the-editor-diff.md)
- Detail: Affects: Testers. Work needed: Add direct tests.
- Evidence: Only chatStateManager.test.ts mentions it (grep)

## GAP-F073-06-01

**Search covers local sessions only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-06](../../20-features/073-vs-code-and-ide-extension/F073-06-previous-sessions-and-session-search.md)
- Detail: Affects: VS Code users with cloud chats. Work needed: Add cloud search or label the box.
- Evidence: ChatStateManager.ts:2649-2700

## GAP-F073-06-02

**Brief says 'Sessions view in the activity bar'; no such view is contributed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-06](../../20-features/073-vs-code-and-ide-extension/F073-06-previous-sessions-and-session-search.md)
- Detail: Affects: Docs and testers. Work needed: Fix the brief and use the sheet and command.
- Evidence: package.json:962-970

## GAP-F073-06-03

**Multi-root window with no active file cannot pick a folder for terminal continue.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-06](../../20-features/073-vs-code-and-ide-extension/F073-06-previous-sessions-and-session-search.md)
- Detail: Affects: Multi-root users. Work needed: Ask which folder.
- Evidence: workspaceFolders.ts:26-37; commandSetup.ts:474-480

## GAP-F073-07-01

**Two different output limits (8,000 at capture, 20,000 at attach).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-07](../../20-features/073-vs-code-and-ide-extension/F073-07-terminal-help.md)
- Detail: Affects: VS Code users attaching terminal output. Work needed: Choose one limit and tell the person when output was cut.
- Evidence: packages/client/ide-runtime/src/terminal.ts:4; apps/extension-vscode/src/features/chat-participant/promptReferences.ts:8

## GAP-F073-07-02

**Explain Terminal Output is only in the Command Palette, not in the terminal menu.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-07](../../20-features/073-vs-code-and-ide-extension/F073-07-terminal-help.md)
- Detail: Affects: VS Code users. Work needed: Add a menu entry or document the palette path.
- Evidence: apps/extension-vscode/package.json:1046-1050

## GAP-F073-07-03

**Continue in Terminal does not check Workspace Trust in the extension code opened; whether the CLI refuses an untrusted folder is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-07](../../20-features/073-vs-code-and-ide-extension/F073-07-terminal-help.md)
- Detail: Affects: VS Code users in Restricted Mode. Work needed: Confirm CLI behaviour and add a guard or a test.
- Evidence: apps/extension-vscode/src/core/commandSetup.ts:466-494

## GAP-F073-07-04

**No test found that covers Add Terminal Output to Chat through the real command path to the composer chip.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-07](../../20-features/073-vs-code-and-ide-extension/F073-07-terminal-help.md)
- Detail: Affects: Testers. Work needed: Add a test for the attachment name and the 20,000 limit.
- Evidence: grep of src/__tests__ for addTerminalOutputToChat found only the shell-integration test offering attach

## GAP-F073-07-05

**No recorded run of any of these flows in a real editor.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-07](../../20-features/073-vs-code-and-ide-extension/F073-07-terminal-help.md)
- Detail: Affects: All. Work needed: Run the scenarios above and record results.
- Evidence: no result file found

## GAP-F073-08-01

**The first draft's claim that the status bar hides in auto mode is wrong; only the suffix hides. Docs and tests must say so.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-08](../../20-features/073-vs-code-and-ide-extension/F073-08-commands-keyboard-shortcuts-model-and-mode-control.md)
- Detail: Affects: Testers. Work needed: Use the corrected wording.
- Evidence: apps/extension-vscode/src/core/statusBar.ts:3-6

## GAP-F073-08-02

**The effort setting is not shown in the status bar.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-08](../../20-features/073-vs-code-and-ide-extension/F073-08-commands-keyboard-shortcuts-model-and-mode-control.md)
- Detail: Affects: VS Code users. Work needed: Decide whether to show it.
- Evidence: statusBar.ts:3-6

## GAP-F073-08-03

**No test covers the model picker flow end to end (locked, unreachable, boundary refusal).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-08](../../20-features/073-vs-code-and-ide-extension/F073-08-commands-keyboard-shortcuts-model-and-mode-control.md)
- Detail: Affects: Testers. Work needed: Add tests for each branch.
- Evidence: no test file found by name for selectModel

## GAP-F073-08-04

**Subscription gating of manual model choice is by tier name in code; whether it matches the single AGI Subscription entitlement contract was not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-08](../../20-features/073-vs-code-and-ide-extension/F073-08-commands-keyboard-shortcuts-model-and-mode-control.md)
- Detail: Affects: VS Code users on paid plans. Work needed: Trace to the shared entitlement contract.
- Evidence: apps/extension-vscode/src/integrations/tierResolver.ts:44-57; doc: docs/product/definition.md:117

## GAP-F073-09-01

**The brief points at sidebarProvider.ts:138 and ChatStateManager.ts:973 for the notices; line 138 is focus handling and 973 is an unrelated type, the real code is at sidebarProvider.ts:165-198 and sessionActivityAlert.ts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-09](../../20-features/073-vs-code-and-ide-extension/F073-09-approvals-and-task-notices.md)
- Detail: Affects: Engineers using the brief. Work needed: Correct the brief references.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:165-198

## GAP-F073-09-02

**No setting to turn off the pop-ups.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-09](../../20-features/073-vs-code-and-ide-extension/F073-09-approvals-and-task-notices.md)
- Detail: Affects: VS Code users. Work needed: Add a setting if wanted.
- Evidence: package.json setting search found none

## GAP-F073-09-03

**Approvals decided in the extension may not write the audit rows that history shows; the writer was not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-09](../../20-features/073-vs-code-and-ide-extension/F073-09-approvals-and-task-notices.md)
- Detail: Affects: Approval history users. Work needed: Trace who inserts tool_approval_decided and cover VS Code.
- Evidence: apps/web/app/api/settings/approvals/route.ts:84-95

## GAP-F073-09-04

**Approval history is read-only and opens the web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-09](../../20-features/073-vs-code-and-ide-extension/F073-09-approvals-and-task-notices.md)
- Detail: Affects: VS Code users. Work needed: Decide whether history should answer or reopen pending items.
- Evidence: approvalHistory.ts:77-83

## GAP-F073-10-01

**The extension keeps its own loader (two files, 8,192 chars) while the CLI loads by a different rule; the panel can disagree with what turns use.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-10](../../20-features/073-vs-code-and-ide-extension/F073-10-project-instructions-skills-and-mcp-servers.md)
- Detail: Affects: VS Code users and testers. Work needed: Use the CLI response in the panel or share one rule.
- Evidence: apps/extension-vscode/src/data/projectInstructions.ts:18-35 vs apps/cli/src/compaction.rs:172-217

## GAP-F073-10-02

**Product says CLI and VS Code show the same inventory; no test compares them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-10](../../20-features/073-vs-code-and-ide-extension/F073-10-project-instructions-skills-and-mcp-servers.md)
- Detail: Affects: VS Code and CLI users. Work needed: Add a parity test.
- Evidence: doc: docs/product/definition.md:122

## GAP-F073-10-03

**Skill removal is irreversible in the UI; Trash handling not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-10](../../20-features/073-vs-code-and-ide-extension/F073-10-project-instructions-skills-and-mcp-servers.md)
- Detail: Affects: VS Code users. Work needed: Confirm CLI behaviour and move to Trash if needed.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:291-295

## GAP-F073-10-04

**No test found for manageSkills, manageMcpServers or managePlugins flows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-10](../../20-features/073-vs-code-and-ide-extension/F073-10-project-instructions-skills-and-mcp-servers.md)
- Detail: Affects: Testers. Work needed: Add tests for confirm and cancel.
- Evidence: no test file by those names in src/__tests__

## GAP-F073-11-01

**No test or recorded run in a real remote window of any kind.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-11](../../20-features/073-vs-code-and-ide-extension/F073-11-works-in-remote-and-container-windows.md)
- Detail: Affects: Remote users. Work needed: Run and record a remote scenario per kind.
- Evidence: Only unit tests in remoteEnvironment.test.ts; smoke test runs locally

## GAP-F073-11-02

**The brief cites activation limits and stale line numbers (commandSetup.ts:779) for remote support.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-11](../../20-features/073-vs-code-and-ide-extension/F073-11-works-in-remote-and-container-windows.md)
- Detail: Affects: Engineers using the brief. Work needed: Fix the brief references.
- Evidence: apps/extension-vscode/package.json:41-52; commandSetup.ts:959-966

## GAP-F073-11-03

**Whether Local model use over a remote host is explained to the person is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-11](../../20-features/073-vs-code-and-ide-extension/F073-11-works-in-remote-and-container-windows.md)
- Detail: Affects: Remote Local-mode users. Work needed: Check and add wording.
- Evidence: no message found

## GAP-F073-12-01

**No test found for announceExtensionUpdate or announceMissingNativeChat.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-12](../../20-features/073-vs-code-and-ide-extension/F073-12-workspace-trust-updates-and-version-notices.md)
- Detail: Affects: Testers. Work needed: Add unit tests for both notices.
- Evidence: grep for hostNotices in src/__tests__ found no match

## GAP-F073-12-02

**No proactive 'update available' check; S73.29 is met only after an update or on server rejection.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-12](../../20-features/073-vs-code-and-ide-extension/F073-12-workspace-trust-updates-and-version-notices.md)
- Detail: Affects: VS Code users on old versions. Work needed: Decide whether VS Code's own updater is enough and document it.
- Evidence: apps/extension-vscode/src/core/hostNotices.ts:8-20; api.ts:850-856

## GAP-F073-12-03

**The Context panel still reads project files in an untrusted folder.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-12](../../20-features/073-vs-code-and-ide-extension/F073-12-workspace-trust-updates-and-version-notices.md)
- Detail: Affects: Restricted Mode users. Work needed: Confirm it is acceptable (display only) or gate it.
- Evidence: apps/extension-vscode/src/data/projectInstructions.ts:18-35

## GAP-F073-12-04

**Brief references (webviewContent.ts:2715, ChatStateManager.ts:744, 1047) point to unrelated lines; the real code is at webviewContent.ts:3757 and ChatStateManager.ts:3160 and 4513.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-12](../../20-features/073-vs-code-and-ide-extension/F073-12-workspace-trust-updates-and-version-notices.md)
- Detail: Affects: Engineers using the brief. Work needed: Correct the brief.
- Evidence: files read

## GAP-F073-12-05

**No recorded run in a real Restricted Mode window.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F073-12](../../20-features/073-vs-code-and-ide-extension/F073-12-workspace-trust-updates-and-version-notices.md)
- Detail: Affects: All. Work needed: Run the scenarios and record them.
- Evidence: no result file found
