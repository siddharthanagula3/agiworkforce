# Area 59. Approvals and human-in-the-loop UI

31 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S59.01 One-action approval.
- Should: When a single tool call needs approval, the user can approve or deny that one call and the run continues accordingly.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:476; apps/web/lib/hooks/useChatStream.ts:4047; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:328; apps/desktop/electron/runtime/permissionManager.ts:292; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/tui/widgets/approval_overlay.rs:81; apps/cli/src/tui/tui_app.rs:861

## S59.02 Batch approval.
- Should: The user can approve or deny several pending tool calls of a run in one action.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified, api done
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:728; apps/web/lib/services/cloud-agent-run-service.ts:1407; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:573; apps/mobile/src/features/tasks/store.ts:244; apps/cli/src/tui/widgets/approval_overlay.rs:81; apps/cli/src/tui/widgets/approval_overlay.rs:469; apps/cli/src/tui/approval_broker.rs:290; apps/cli/src/tui/approval_broker.rs:156

## S59.03 Per-session approval.
- Should: The user can allow a tool for the rest of the current session so it stops asking until the session ends.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:452; apps/web/features/chat/components/messages/MessageBubble.tsx:1707; apps/web/features/chat/components/messages/MessageBubble.tsx:1728; apps/web/features/chat/components/messages/MessageBubble.tsx:1989; apps/mobile/src/features/chat/components/MessageBubble.tsx:690; apps/mobile/src/features/chat/components/MessageBubble.tsx:719; apps/cli/src/tui/widgets/approval_overlay.rs:81; apps/cli/src/tui/tui_app.rs:861

## S59.04 Per-application permission.
- Should: The user can set allow/ask/deny per connected app (and per tool within it), and the runtime enforces it.
- Status: web done, desktop done, mobile done, cli done, vscode done, api done
- Code: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:66; apps/web/app/api/connectors/permissions/route.ts:59; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:67; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:278; apps/mobile/services/connectors.ts:92; apps/cli/src/agent/tools.rs:77; apps/cli/src/platform/policy/engine.rs:350; apps/cli/src/platform/policy/engine.rs:327

## S59.05 Per-folder permission.
- Should: The agent can touch only folders the user granted, and the user grants or revokes each folder.
- Status: desktop done, cli done, vscode done
- Code: apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:62; apps/desktop/electron/runtime/dispatcher.ts:704; apps/cli/src/tui/tui_app.rs:3868; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:985; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1013

## S59.06 Per-domain permission.
- Should: The user can allow or block specific websites/domains the agent may act on or fetch, and it is enforced.
- Status: web done, desktop partial, mobile missing, cli done, vscode done, chrome done
- Code: apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:293; apps/web/app/api/settings/organization/connector-policy/route.ts:118; apps/web/lib/services/connector-policy-service.ts:94; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4174; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5107; apps/web/lib/web-search/web-search-tool.ts:458; apps/web/lib/url-fetch/url-fetch-tool.ts:539; apps/web/lib/url-fetch/url-fetch-tool.ts:555
- Unfinished: desktop: Desktop cloud chats send web_search and web_fetch to the server, so the workspace site rules bind them. BYOK and local desktop turns attach the provider's hosted web_search and web_fetch in the Tauri client (server_tools.rs), which does not read the workspace lists; the client would have to withhold hosted search or pass the lists as allowed_domains or blocked_domains. The native browser gate still asks per command and reads no site rule.

## S59.07 Persistent permission settings.
- Should: Permission choices (policy and per-tool rules) persist across sessions and devices until changed.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:141; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:38; apps/web/app/api/connectors/permissions/route.ts:59; apps/desktop/electron/runtime/permissionManager.ts:303; apps/desktop/electron/runtime/permissionManager.ts:292; apps/mobile/app/(app)/settings/auto-approve.tsx:47; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:278; apps/cli/src/tui/tui_app.rs:3638

## S59.08 Permission-mode selector.
- Should: The user can pick a permission mode (ask every time / auto for low risk / skip approvals) that governs how every tool runs.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3731; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4573; apps/web/lib/voice/live-voice-tools.ts:226; apps/web/lib/services/scheduled-agent-executor.ts:222; apps/cli/src/tui/tui_app.rs:56; apps/cli/src/permissions.rs:171; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3549; apps/cli/src/app_server/surfaces.rs:329

## S59.09 Read-only mode.
- Should: The user can switch the agent into a read-only mode in which write, send and execute tools are refused.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:48; apps/web/app/api/connectors/permissions/route.ts:96; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:152; apps/web/public/openapi.json:5489; apps/cli/src/tui/tui_app.rs:56; apps/cli/src/permissions.rs:171; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3549; apps/cli/src/app_server/surfaces.rs:329

## S59.10 Ask-before-writing mode.
- Should: A mode lets reads run automatically but stops and asks before any write, send or execute action.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:141; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:381; packages/contracts/types/src/tool-approval-policy.ts:54; apps/mobile/app/(app)/settings/auto-approve.tsx:47; apps/mobile/app/(app)/settings/auto-approve.tsx:34; apps/cli/src/tui/tui_app.rs:56; apps/cli/src/features/exec/tools/mod.rs:365; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3549

## S59.11 Automatic low-risk approval mode.
- Should: A mode auto-approves low-risk actions (reads, searches) while riskier actions still ask.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:141; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:381; apps/mobile/app/(app)/settings/auto-approve.tsx:47; apps/mobile/app/(app)/settings/auto-approve.tsx:34; apps/cli/src/tui/tui_app.rs:56; apps/cli/src/features/exec/tools/mod.rs:365; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3549; apps/cli/src/app_server/surfaces.rs:329

## S59.12 Approval summary.
- Should: An approval request shows a plain summary of what the tool will do and why it needs approval.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/approvals/ApprovalInbox.tsx:202; packages/ui/unified-chat/src/components/ToolCallCard.tsx:473; apps/web/lib/hooks/useChatStream.ts:4047; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:328; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/tui/tui_app.rs:880; apps/cli/src/tui/tui_app.rs:861

## S59.13 Exact recipients.
- Should: Before a send is approved, the approval names exactly who will receive it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:324; packages/ui/unified-chat/src/components/ToolCallCard.tsx:459; packages/contracts/types/src/tool-approval-stakes.ts:126; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:141; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:325; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:218; apps/cli/src/approval_details.rs:73; apps/cli/src/agent/tools.rs:128

## S59.14 Exact destination.
- Should: Before an outbound action is approved, the approval shows the exact destination (URL, host or target).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:513; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:821; apps/web/lib/hooks/useChatStream.ts:4047; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:328; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:382; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/features/exec/tools/mod.rs:714; apps/cli/src/features/exec/tools/mod.rs:708

## S59.15 Exact amount or purchase.
- Should: Before a payment or purchase is approved, the approval shows the exact amount and what is bought.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:324; packages/contracts/types/src/tool-approval-stakes.ts:127; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:31; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:141; apps/cli/src/approval_details.rs:75; apps/cli/src/approval_details.rs:76; apps/cli/src/agent/tools.rs:128; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4953

## S59.16 Exact command.
- Should: Before a command runs, the approval shows the exact command line (and where it will run).
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:508; apps/web/lib/hooks/useChatStream.ts:4047; apps/desktop/electron/runtime/dispatcher.ts:510; apps/desktop/electron/runtime/dispatcher.ts:505; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:382; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/tui/widgets/approval_overlay.rs:106; apps/cli/src/features/exec/tools/bash/mod.rs:105

## S59.17 Exact files or records affected.
- Should: Before a write, the approval shows exactly which files or records will change.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:424; packages/ui/unified-chat/src/components/ToolCallCard.tsx:505; apps/web/lib/hooks/useChatStream.ts:4047; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:328; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:382; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/tui/widgets/approval_overlay.rs:13; apps/cli/src/tui/tui_app.rs:861

## S59.18 Proposed-diff preview.
- Should: Before a file edit is approved, the user sees the proposed diff.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:505; packages/ui/unified-chat/src/components/ToolCallCard.tsx:386; apps/web/lib/hooks/useChatStream.ts:4047; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:328; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:153; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:31; apps/cli/src/tui/widgets/approval_overlay.rs:12; apps/cli/src/tui/tui_app.rs:880

## S59.19 Allow action.
- Should: The user can allow a pending action and it then runs.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:476; apps/web/lib/hooks/useChatStream.ts:4047; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:328; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/tui/widgets/approval_overlay.rs:81; apps/cli/src/tui/tui_app.rs:861; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4596

## S59.20 Deny action.
- Should: The user can deny a pending action; it does not run and the model is told it was denied.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:476; apps/web/lib/hooks/useChatStream.ts:4047; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:328; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/tui/widgets/approval_overlay.rs:81; apps/cli/src/tui/tui_app.rs:861; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4596

## S59.21 Edit proposed action.
- Should: Before approving, the user can edit the proposed action (e.g. change the command, recipient or text) and run the edited version.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S59.22 Ask for an alternative.
- Should: Instead of just denying, the user can tell the agent what to do instead, and the agent continues with that guidance.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/approvals/ApprovalInbox.tsx:230; apps/web/lib/hooks/useChatStream.ts:4068; apps/web/lib/hooks/useChatStream.ts:4047; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:187; apps/mobile/stores/chat/chatExecutionStore.ts:477; apps/cli/src/tui/widgets/approval_overlay.rs:180; apps/cli/src/tui/widgets/approval_overlay.rs:201; apps/cli/src/tui/approval_broker.rs:254

## S59.23 Approval expiration.
- Should: A pending approval expires after a set time, the UI shows it expired, and the action cannot run from it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:451; apps/web/lib/services/cloud-agent-run-service.ts:370; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:115; apps/mobile/src/features/chat/components/MessageBubble.tsx:409; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/tui/tui_app.rs:36; apps/cli/src/tui/tui_app.rs:6319; apps/cli/src/tui/tui_app.rs:6324

## S59.24 Approval history.
- Should: The user can review a history of past approval requests and their decisions.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/api/llm/v1/chat/completions/approve/route.ts:407; apps/web/app/api/settings/approvals/route.ts:71; apps/web/features/settings/sections/CapabilitiesSection.tsx:96; apps/mobile/app/(app)/settings/auto-approve.tsx:82; apps/mobile/src/features/settings/tool-approvals/ApprovalHistory.tsx:44; apps/cli/src/features/exec/tools/mod.rs:988; apps/cli/src/lib.rs:2835; apps/extension-vscode/src/features/permissions/approvalHistory.ts:31

## S59.25 Revoke saved permission.
- Should: The user can revoke a saved "always allow" (or folder/site grant) so the action asks again.
- Status: web done, desktop done, mobile done, cli done, chrome done, api done
- Code: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:48; apps/web/app/api/connectors/permissions/route.ts:102; apps/desktop/electron/runtime/dispatcher.ts:708; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:302; apps/mobile/services/connectors.ts:99; apps/cli/src/tui/tui_app.rs:3638; apps/cli/src/permissions.rs:452; apps/extension/src/options.ts:1200

## S59.26 Approval from another device.
- Should: An approval raised on one device can be answered from another signed-in device, and the first device sees the result.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified, api done
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:728; apps/web/lib/services/cloud-agent-run-service.ts:1407; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:573; apps/mobile/src/features/tasks/store.ts:245; apps/cli/src/cloud/code_sessions.rs:123; apps/cli/src/lib.rs:2592; apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts:37; apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts:29

## S59.27 Approval via notification.
- Should: When an approval is needed the user is notified and can approve or deny directly from the notification.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:37

## S59.28 Stronger confirmation for sensitive operations.
- Should: Sensitive or irreversible actions get a stronger confirmation than routine ones (warning, no permanent allow, re-ask).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:52; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:1026; apps/desktop/electron/runtime/permissionManager.ts:315; apps/desktop/electron/runtime/permissionManager.ts:292; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:134; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:218; apps/cli/src/features/exec/tools/bash/mod.rs:169; apps/cli/src/features/exec/tools/mod.rs:499

## S59.29 User takeover.
- Should: While the agent controls a screen or browser, the user can take over control and later hand it back.
- Status: desktop done, chrome done
- Code: packages/contracts/local-runtime/src/protocol.ts:126; apps/desktop/electron/runtime/computerUseSession.ts:274; apps/desktop/electron/runtime/computerUseSession.ts:356; apps/desktop/electron/runtime/computerUseSession.ts:368; apps/desktop/electron/main.ts:1499; apps/web/features/desktop-host/hooks/use-computer-use-resume.ts:29; apps/web/features/desktop-host/hooks/use-computer-use-resume.ts:39; apps/web/features/desktop-host/components/DesktopChatRunner.tsx:11

## S59.30 Resume after user intervention.
- Should: After the user intervenes (approves, answers a question, or hands control back), the same run resumes where it stopped.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/hooks/useChatStream.ts:4047; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:328; packages/ui/unified-chat/src/components/ToolCallCard.tsx:476; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/tui/widgets/approval_overlay.rs:81; apps/cli/src/tui/tui_app.rs:861; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4596

## S59.31 Action receipt and outcome display.
- Should: After an approval decision the transcript shows what was decided and what happened (ran, result, or denied).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/lib/hooks/useChatStream.ts:4119; apps/web/features/chat/components/messages/ToolTimeline.tsx:441; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/tui/tui_app.rs:861; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4602; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1824
