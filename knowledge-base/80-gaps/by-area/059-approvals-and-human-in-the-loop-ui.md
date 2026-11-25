---
id: "GAPS-AREA-059"
type: "gap-list"
title: "Gaps: Approvals and human-in-the-loop UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 59. Approvals and human-in-the-loop UI

131 open gaps that touch this area. Area page: [20-features/059-approvals-and-human-in-the-loop-ui](../../20-features/059-approvals-and-human-in-the-loop-ui/README.md).

## CMP-C116

**Deny named subagents by permission rule**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: Ours permission rules cannot name a subagent to refuse.
- Evidence: searched: Agent( in apps/cli/src/permissions.rs

## CMP-C185

**Bypass mode refuses to run as root**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: Bypass runs as root without a check; the sandbox note does not stop it.
- Evidence: apps/cli/src/lib.rs:310-314; searched: geteuid, root in apps/cli/src

## CMP-C200

**Custom named permission profiles with filesystem rules**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Detail: Only a fixed profile per permission mode exists; users cannot define or extend profiles.
- Evidence: apps/cli/src/permissions.rs:303

## CMP-C225

**Named custom permission profiles**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Detail: Only built-in profiles tied to the permission mode exist; users cannot define named profiles.
- Evidence: apps/cli/src/permissions.rs:303; searched: default_permissions

## CMP-C478

**Route print-mode permission prompts to an MCP tool or host**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md), [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Detail: Headless runs refuse unapproved actions; there is no flag to hand the prompt to an external tool.
- Evidence: searched: permission-prompt-tool in apps/cli/src, crates; apps/cli/src/lib.rs:2574 (refuses)

## CMP-CP101

**Permission rules in Tool(specifier) syntax with allow, ask, deny**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: Ours stores command-prefix allow/ask/deny rules and regex policy.toml rules, not one Tool(specifier) syntax usable ever… Ours stores command-prefix allow/ask/deny rules and regex policy.toml rules, not one Tool(specifier) syntax usable everywhere.
- Evidence: apps/cli/src/permissions.rs:698

## CMP-CP184

**Wildcard patterns in permission rules**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: There is no * wildcard syntax in rules Command rules match by token prefix, and the policy file takes regular expressions; there is no * wildcard syntax in rules.
- Evidence: apps/cli/src/permissions.rs:444; apps/cli/src/platform/policy/engine.rs:1

## CMP-CP348

**Managed settings that pin permissions and block bypass**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: No disable-bypass key managed-settings.json pins permission mode, privacy mode, trust, policy rules, hooks and sandbox; no disable-bypass key.
- Evidence: apps/cli/src/platform/policy/managed.rs:43

## CMP-CP88

**Per-site permission before browser actions**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md), [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: The terminal has no per-site prompt The desktop app decides each browser command and can refuse; the terminal has no per-site prompt.
- Evidence: apps/cli/src/browser_bridge.rs:1-3,155

## CMP-D142

**Admin blocks bypass-permissions mode**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: No organization key forbids a member from turning permission prompts off in desktop agent runs.
- Evidence: searched: disableBypassPermissions, bypass in apps/web/app/api/settings/organization, workspace-controls.ts

## CMP-D146

**Admin limits which apps computer use may reach and whether approvals save**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md)
- Detail: Admins can switch computer use off but cannot restrict apps or block saved approvals.
- Evidence: apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:66; searched: allowedApps in apps/web/features/workspace-console

## CMP-D157

**Wallet payments need biometric approval on every payment**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: We have no assistant wallet or payments feature.
- Evidence: searched: wallet, standing instruction in apps/web/features, apps/web/app/api

## CMP-D36

**Per-app permission tiers for computer use (view-only browsers, click-only terminals)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: An allowed app gets full mouse and keyboard control; there are no view-only or click-only levels for sensitive app types.
- Evidence: searched: tier, view-only, click-only in apps/desktop/electron/runtime, apps/web/features/desktop-host

## CMP-DP27

**Computer use approvals expire after 30 minutes in phone-started tasks**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md)
- Detail: There is no timed re-prompt An approved app stays allowed until you quit the app, or always if you choose Always; there is no timed re-prompt.
- Evidence: apps/web/features/desktop-host/components/LocalAccessSection.tsx:89

## CMP-DP38

**Admin limits on browser sites, uploads, downloads, history and saved approvals**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: There are no per-site upload or download rules set by the admin Admins can switch the browser feature off and the extension honors an organization site policy, but there are no per-site upload or download rules set by the admin.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:3; apps/web/app/agent-permissions/page.tsx:335

## CMP-DP40

**Per-site agent permissions for downloads, uploads and risky actions**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Ours has no per-site download or upload setting: the Chrome agent always asks for those (apps/extension/src/features/co… The leader lets a person set access, downloads and uploads per site to Requires approval, Always allow or Block. Ours has no per-site download or upload setting: the Chrome agent always asks for those (apps/extension/src/features/computer-use/approvalPolicy.ts:5) with one-time or task-long site gran
- Evidence: apps/extension/src/features/computer-use/approvalPolicy.ts:5; apps/extension/src/features/computer-use/oneTimeSiteGrants.ts; apps/desktop/electron/browserPane.ts:182

## CMP-DP46

**Approval modes: ask every time, read-only auto, skip approvals, admin-limited**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: But nothing can set it: the policy PATCH schema has n The three levels exist (packages/contracts/types/src/tool-approval-policy.ts:51-74) and the server honors a workspace key allowAutonomousToolApprovals (same file :80-89; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:37-44). But nothing can set it: the policy PATCH schema has n
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:52; apps/web/features/code/components/CodeComposer.tsx:1363

## CMP-DP51

**Permission modes for code sessions (ask, accept edits, auto, bypass)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: No classifier-based Auto and no accept-edits mode Ours has Ask before every action, Run read-only actions without asking, Skip approvals (destructive still ask) and Plan; no classifier-based Auto and no accept-edits mode.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:52; apps/web/features/code/components/CodeComposer.tsx:1395-1450

## CMP-DP62

**Attach a note when answering a permission prompt**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-07](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Detail: Chat approvals do take a note: apps/web/features/chat/components/approvals/ApprovalInbox.tsx:227-239 has a field 'Add g… Chat approvals do take a note: apps/web/features/chat/components/approvals/ApprovalInbox.tsx:227-239 has a field 'Add guidance to steer the run (optional)' per pending approval, sent with the decision (:129-132), mounted at apps/web/features/chat/pages/WebChatPage.tsx:7450. Cloud Code approvals have
- Evidence: apps/web/features/chat/components/approvals/ToolApprovalCard.tsx; searched: denial reason, note in approvals

## CMP-M131

**Per-connected-account permission override with reset to Default**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Connector details show granted scopes read-only; no per-account permission.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:900

## CMP-M192

**Permission mode for cloud tasks: Manual, Accept edits, Plan, Auto**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Cloud code asks per action but has no mode picker.
- Evidence: src/features/cloud-code/components/CodeApprovalNotice.tsx:17; searched: acceptEdits, permission mode

## CMP-M215

**Wallet payments with biometric approval per payment**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: No wallet or agent payments; bank linking is switched off.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:21 (bankLinking false); searched: wallet

## CMP-M59

**Add a site permission**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: No per-site permission list for the agent.
- Evidence: searched: site permission, add site in apps/mobile/src/features/settings, apps/mobile/src/features/tasks

## CMP-M66

**Default permission for opening websites**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: No default website permission for the agent.
- Evidence: searched: default permission, websites in apps/mobile/src/features/settings, apps/mobile/src/features/tasks

## CMP-M9

**Assistant pays for approved purchases with one-time cards (Link, Shop Pay, Wallet)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: We have no assistant that pays for purchases for the user.
- Evidence: searched: Link, Shop Pay, one-time card, wallet pay in src, app; lib/v1FeatureFlags.ts bankLinking false

## CMP-MP107

**Connector permission levels per role: always allow, needs approval, blocked**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: No per-role connector levels Mobile has its own tool approval policy and history but no per-role connector levels.
- Evidence: apps/mobile/src/features/settings/tool-approvals/toolApprovalPolicyOwner.ts; ApprovalHistory.tsx

## CMP-MP59

**Permission mode for the session**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Edits are governed by an account-wide approval policy (ask every time, read-only auto, skip approvals), not a per-sessi… Per session only Agent or Plan; edits are governed by an account-wide approval policy (ask every time, read-only auto, skip approvals), not a per-session mode. Cloud mode only; Free plan has no code budget.
- Evidence: apps/mobile/src/features/cloud-code/presentation.ts:282; apps/mobile/src/features/chat/components/ComposerApprovalModeControl.tsx:21; apps/mobile/src/features/settings/capabilities/index.tsx:196

## CMP-MP61

**Per-tool permission for a connector: Allow, Ask or Block**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: No separate read-only versus low-risk levels Each tool has Allow, Ask or Block; no separate read-only versus low-risk levels.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:91; :222

## CMP-MP63

**Approval card: Deny, Allow once, Allow for chat, Always allow, plus low-risk**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: No low-risk level Card offers Allow once, Allow for this chat, Always allow and Deny; no low-risk level.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:23; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:151

## CMP-MP65

**Confirmation before connected apps book or buy**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: No booking or buying connectors to confirm Tool approval cards show what is at stake before an action; no booking or buying connectors to confirm.
- Evidence: apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:209

## CMP-MP90

**Approval cards before the assistant sends, pays, signs or deletes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md), [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Detail: Not for payments, signatures or sends on a user account Cloud tasks show approval cards for tool actions, but not for payments, signatures or sends on a user account.
- Evidence: src/features/cloud-code/components/CloudCodeApprovalCard.tsx; src/features/settings/tool-approvals

## CMP-V45

**Named permission profiles that bundle file and network rules**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Detail: Only the four agent modes exist; there are no named profiles, custom profiles or inheritance.
- Evidence: searched: permission profile, default_permissions in apps/extension-vscode/src, apps/cli/src/config.rs

## CMP-V71

**Admin can remove auto mode or bypass mode**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: Admin workspace policy turns hooks and MCP off but cannot block Bypass or Auto; the Bypass confirmation is the only gate.
- Evidence: apps/cli/src/cloud/workspace_policy.rs:86,128; apps/extension-vscode/src/features/permissions/agentModeConsent.ts:126-141

## CMP-VP36

**Permission modes in the prompt box**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: None has a model judging approvals Four modes (Ask, Auto, Plan, Bypass) from the composer or Choose Agent Mode; none has a model judging approvals.
- Evidence: apps/extension-vscode/src/core/commandSetup.ts:1846-1898; apps/extension-vscode/package.json:1342

## CMP-VP39

**Admin limits on approval mode, sandbox and full access**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: The managed policy is not hooks and plugins only The managed policy is not hooks and plugins only. It pins the permission mode (apps/cli/src/platform/policy/managed.rs:43-46); every session, app-server ones included, starts with that pin (apps/cli/src/agent/mod.rs:831) and its effective mode and skip-permissions are capped by it (agent/mod.rs:2393
- Evidence: searched: managed, requirements in apps/extension-vscode/src, apps/cli/src/config.rs

## CMP-VP40

**Attach a note when answering an approval**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F059-07](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Detail: Allowing carries no note A note can be added only when denying; allowing carries no note.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1453-1470 (note only when decision is deny)

## CMP-VP73

**Permission modes: ask, accept edits, plan, bypass, dont-ask**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: The engine Dont-ask mode is not offered Editor has Ask, Auto (edits free, commands ask), Plan and Bypass; the engine Dont-ask mode is not offered.
- Evidence: apps/extension-vscode/src/platform/config.ts:193-198; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:915-919

## CMP-VP83

**View and edit permission rules**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: Only as one set for every session, not per project Permissions lists allow, ask-first and block rules and adds or removes them, but only as one set for every session, not per project.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1083-1110

## CMP-W140

**Cloud browser that signs in to sites for Work, with site permissions**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Cloud Work has no cloud browser; browser tools exist only for a paired computer.
- Evidence: searched: cloud browser, site permissions in apps/web lib, features, app; apps/web/lib/tool-copy.ts:272

## CMP-W170

**Take over a dot's cloud browser and hand control back**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md), [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Take over exists for local Code sessions only; no cloud browser to take over.
- Evidence: apps/web/features/code/local-code.ts:318; searched: takeOver in features/work, tasks

## CMP-W245

**Per-account permission override with reset to Default**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Tool permissions are saved per user, connector and tool, not per connected account.
- Evidence: apps/web/app/api/connectors/permissions/route.ts:42-60

## CMP-W261

**Trade through a plugin with per-trade confirmation**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: No plugin submits trades.
- Evidence: searched: coinbase, trade, brokerage in apps/web/lib, features

## CMP-W262

**Wallet: the agent buys things with biometric approval**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: No wallet or purchasing agent.
- Evidence: searched: Wallet in apps/web features, lib

## CMP-W323

**Cloud browser settings (default permission, site list, cookies)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Detail: No cloud browser permission or cookie settings in web settings.
- Evidence: searched: cloud browser, site permissions in apps/web/features/settings

## CMP-W400

**Auto-approve mode org controls**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: No workspace switch for the automatic-approval mode.
- Evidence: searched: autoApprove, auto approve mode in apps/web/features/workspace-console

## CMP-WP142

**Ask before consequential website actions, even on allowed sites**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: No extra check for payment or commitment actions Tool actions follow the Manual, Auto or Skip approval modes, but no extra check for payment or commitment actions.
- Evidence: apps/web/lib/tool-approval-view.ts; apps/web/features/chat/components/approvals/ToolApprovalCard.tsx

## CMP-WP155

**Cloud session permission modes (Manual, Accept edits, Auto classifier, Plan)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F066-07](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Detail: There is no classifier-based Auto mode A mode menu offers ask every time, auto-approve reads, autonomous and Plan, saved as your default; there is no classifier-based Auto mode.
- Evidence: apps/web/features/code/components/CodeComposer.tsx:1363-1440; apps/web/lib/services/cloud-code-agent-tools.ts:378-394

## CMP-WP162

**Account-wide default for tool approvals (ask, read-only, low-risk)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: Tool approvals default is Ask before every action, Run read-only actions without asking, or Skip approvals Tool approvals default is Ask before every action, Run read-only actions without asking, or Skip approvals; one setting for all chats and Work.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:61; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1895

## CMP-WP174

**Connector tool permissions per role with conflict warnings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Roles and groups carry no connector rules Workspace tool rules set allow, ask or deny per connector tool for everyone; roles and groups carry no connector rules.
- Evidence: packages/contracts/cloud-contracts/src/connectors.ts:692-698; apps/web/lib/services/connector-policy-service.ts:43-62

## CMP-WP214

**Coding session notifications and permission requests**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F059-02](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-02-approve-several-calls-at-once.md), [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Detail: Agent run updates for completions, failures and approval requests in this browser Agent run updates for completions, failures and approval requests in this browser.
- Evidence: apps/web/features/settings/sections/NotificationsSection.tsx:78-80,443-460

## CMP-WP256

**Cloud session permission dropdown (Accept edits, Plan, Auto)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Cloud code sessions do have a per-session mode menu: ApprovalModeControl in apps/web/features/code/components/CodeCompo… Cloud code sessions do have a per-session mode menu: ApprovalModeControl in apps/web/features/code/components/CodeComposer.tsx:1363-1440 (approval policy plus Plan), rendered by CloudCodePage.tsx:2141. The comparison's own coding row 'Cloud session permission modes' cites the same file and says Part
- Evidence: searched: accept edits, plan mode, permission mode in apps/web/features/code/CloudCodePage.tsx

## CMP-WP313

**Always allow tools apply in scheduled tasks and auto-approve**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md), [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: I could not confirm they also govern scheduled runs Per-tool Always allow, Needs approval and Blocked exist for connectors; I could not confirm they also govern scheduled runs.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:30-40

## CMP-X23

**Admin control over which approval modes members can use and the default**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: The mode is a per-user setting only. Our managed policy and workspace policy carry no field for allowed or default approval modes, so an admin cannot stop Full access.
- Evidence: apps/extension/managed-schema.json:1-60 (site rules only); apps/extension/src/features/computer-use/askBeforeActing.ts:1-21; searched: permissionMode, approvalMode in packages/contracts/types/src/enterprise

## CMP-XP11

**Approval mode: skip all approvals**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Still asks for protected steps and never completes a purchase Full access skips routine confirmations but still asks for protected steps and never completes a purchase.
- Evidence: apps/extension/src/side_panel.ts:14785-14795; apps/extension/src/features/options/site-permission-policy.ts:12

## CMP-XP12

**Deleting things and changing permission settings always ask, in every mode**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: Only when the control's English label or the page path matches a pattern (delete, remove permanently, share, grant, rev… We ask in every mode, but only when the control's English label or the page path matches a pattern (delete, remove permanently, share, grant, revoke, /settings/...permissions). An icon-only or non-English delete is treated as a routine click.
- Evidence: apps/extension/src/features/computer-use/approvalPolicy.ts:187-194, 289-298, 420-422; crucialActions.ts:14,20; askBeforeActing.ts:36

## CMP-XP19

**Approval history in settings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md), [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Nothing in apps/extension/src writes browser decisions The list is not the extension's permission history. It fetches cloud tool approvals from /api/settings/approvals (apps/extension/src/features/options/approval-history-section.ts:196; hint text at 90 says tool requests in chats on every device). Nothing in apps/extension/src writes browser decisions
- Evidence: apps/extension/src/features/options/approval-history-section.ts:81-163

## CMP-XP20

**Approval mode: automatic with pauses for risky steps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: It does not run a model safety review Auto is the default and asks before crucial steps by fixed rules; it does not run a model safety review.
- Evidence: apps/extension/src/features/computer-use/crucialActions.ts:1-45; apps/extension/src/side_panel.ts:14773-14783

## CMP-XP38

**Admin limits on history access, saved always-allow approvals and approval duration**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: Has nothing for history search, for stopping Always allow on a site, or for how long an approval lasts Our admin policy covers sites with separate automation, upload and download rules and beats user approvals, but has nothing for history search, for stopping Always allow on a site, or for how long an approval lasts.
- Evidence: apps/extension/managed-schema.json:14-58; packages/contracts/types/src/site-policy.ts:172-216; apps/extension/src/features/computer-use/historySearch.ts:1-40

## GAP-AREA059-LW06

**Read-only mode (S59.09) is not a global switch in the code I opened. The web panel only sets saved levels per tool through a bulk preset.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-059
- Detail: Area 59. Approvals and human-in-the-loop UI
- Evidence: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:266

## GAP-AREA059-LW07

**The mode vocabularies differ: web and mobile use Ask, Auto and Skip; the CLI uses Default, Plan, Auto, Bypass and Full Auto.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-059
- Detail: Area 59. Approvals and human-in-the-loop UI
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:52; apps/cli/src/tui/tui_app.rs:56

## GAP-AREA059-LW08

**The web tool-approval policy file imports its type from @shared/types/toolApprovalPolicy, while the contract lives in packages/contracts/types/src/tool-approval-policy.ts. The two may be duplicates; the alias was not confirmed.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-059
- Detail: Area 59. Approvals and human-in-the-loop UI
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:14

## GAP-CAP-approvals-and-permissions-02

**Remember a choice (this chat, always) and revoke it: Mobile card is Partial against ChatGPT's card (MP63). VS Code has no revoke row in the ledger.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Requirement items: S59.03, S59.07, S59.25
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-approvals-and-permissions-03

**Permission modes picker: Code-session mode lists differ by app and are Partial in comparison files; mobile cloud task mode picker missing (M192).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Requirement items: S59.08, S59.10, S59.11
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-approvals-and-permissions-04

**Run read-only actions without asking, ask before writes: WP162 account-wide default is Partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Requirement items: S59.09, S59.10, S59.11
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-approvals-and-permissions-06

**Skip all approvals, with floor protections: CLI bypass does not refuse to run as root (C185).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Requirement items: S59.08, S59.28
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-approvals-and-permissions-08

**Allow, ask and deny rules: Rule syntax is Partial against Claude Code; deny rules for named subagents Missing (C116).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Requirement items: S59.04, S59.07
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-approvals-and-permissions-09

**Per-tool connector permissions: Per-account override with reset (W245, M131); mobile per-role levels Partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Requirement items: S59.04, S59.09
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-approvals-and-permissions-10

**Confirm consequential actions with exact details: Consequential website actions on web and mobile card gaps are Partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Requirement items: S59.12, S59.13, S59.14, S59.15, S59.16, S59.17, S59.18, S59.28
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-approvals-and-permissions-11

**Money actions never get standing consent: Standing-consent rule for trades and scheduled runs is not confirmed in code reading; wallet Missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Requirement items: S59.15, S59.28
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-approvals-and-permissions-12

**Actions never taken without the user in the browser: Chrome list is Partial against Claude's (XP12); desktop per-site rules Partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Requirement items: S59.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-approvals-and-permissions-13

**Per-site browser permissions: Mobile has no site permissions (M66, M59); web cloud browser settings Missing (W323); desktop local turns do not read workspace site lists (ledger S59.06 unfinished note).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Requirement items: S59.06
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-approvals-and-permissions-14

**Browser approval modes: Admin control over modes Missing (X23).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Requirement items: S59.08
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-approvals-and-permissions-15

**Computer-use per-app approval and tiers: No view-only or click-only tiers (D36); admin limits Missing (D146).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md)
- Requirement items: S59.25, S59.29
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-approvals-and-permissions-16

**User takeover and hand back: Web takeover Missing; mobile has no takeover row.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md)
- Requirement items: S59.29
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-approvals-and-permissions-17

**Folder and file access grants: No named profiles (C225, C200, V45).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Requirement items: S59.05, S59.25
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-approvals-and-permissions-19

**Unattended runs: ask nobody, so deny or wait: CLI cannot route prompts to a host tool (C478); always-allow in scheduled tasks Partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md), [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Requirement items: S59.23, S59.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-approvals-and-permissions-20

**Approve from another device, a notification or a chat app: Approving from a notification exists only in VS Code; coding session notification settings Partial on web.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-02](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-02-approve-several-calls-at-once.md), [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Requirement items: S59.02, S59.26, S59.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-approvals-and-permissions-21

**Approval expiry, history and receipts: Chrome approval history Partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md)
- Requirement items: S59.23, S59.24, S59.31
- Detail: Claude partly, ChatGPT partly; AGI built

## GAP-CAP-approvals-and-permissions-22

**Answer with a note, or say what to do instead: Note attach Partial on desktop and VS Code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-07](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Requirement items: S59.22
- Detail: Claude yes, ChatGPT unknown; AGI built

## GAP-CAP-approvals-and-permissions-23

**Edit the proposed action before approving: Not built anywhere.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-07](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Requirement items: S59.21
- Detail: Claude unknown, ChatGPT unknown; AGI not built

## GAP-CAP-approvals-and-permissions-29

**Admin controls over approvals: Missing admin limits on modes across desktop, VS Code, Chrome, web.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Requirement items: S59.04
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F059-01-01

**Four label sets for the same decision (Allow, Approve, Allow once, Approve once).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-01](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-01-approve-or-deny-one-action.md)
- Detail: Affects: All apps, tester and user clarity. Work needed: Pick one wording per scope and use the shared label table.
- Evidence: ToolCallCard.tsx:419, ApprovalInbox.tsx:264, tool-approval-presentation.ts:25, webviewContent.ts:7034

## GAP-F059-01-02

**Expiry differs: 24 hours server, 10 minutes CLI, in-memory on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-01](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-01-approve-or-deny-one-action.md)
- Detail: Affects: Web, CLI users. Work needed: Decide one product rule and show the time left.
- Evidence: cloud-agent-run-service.ts:457, tui_app.rs:38

## GAP-F059-01-03

**Brief cites stale line numbers for several files (for example tui_app.rs:861 is unrelated).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-01](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-01-approve-or-deny-one-action.md)
- Detail: Affects: Anyone tracing the brief. Work needed: Refresh the brief's code references.
- Evidence: tui_app.rs:850-900 is image attachment code

## GAP-F059-01-04

**Mobile has no Local-mode approval; Local policy is stored but no reader found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-01](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-01-approve-or-deny-one-action.md)
- Detail: Affects: Mobile Local users. Work needed: Confirm whether Local tools exist; wire or remove the Local setting.
- Evidence: apps/mobile/src/features/settings/tool-approvals/toolApprovalPolicyOwner.ts:86, search of toolApprovalPolicy consumers

## GAP-F059-02-01

**No way to mix allow and deny from Tasks, Mobile or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-02](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-02-approve-several-calls-at-once.md)
- Detail: Affects: Tasks users on Web, Desktop, Mobile, VS Code. Work needed: Per-call controls on the Tasks card.
- Evidence: TasksPage.tsx:476

## GAP-F059-02-02

**Chrome batch status unverified; no batch control found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-02](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-02-approve-several-calls-at-once.md)
- Detail: Affects: Chrome users. Work needed: Verify and either add or mark n/a.
- Evidence: bubbles.ts:1004

## GAP-F059-02-03

**Behaviour when one approved call fails is not defined in the brief or confirmed in code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-02](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-02-approve-several-calls-at-once.md)
- Detail: Affects: All. Work needed: Read the runner and state the rule.
- Evidence: S59.02 'not verified'

## GAP-F059-02-PARTLY

**Approve several calls at once: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F059-02](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-02-approve-several-calls-at-once.md)
- Requirement items: S59.02

## GAP-F059-03-01

**Two different meanings of 'Allow for this chat' on web; the plain card loses it on reload.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: Affects: Web and Desktop (hosted web) users. Work needed: Use one server grant or relabel.
- Evidence: chat-tool-allowance-store.ts:10 versus tool-approval-presentation.ts:31

## GAP-F059-03-02

**History covers only cloud decisions; CLI/Electron decisions not in it, and CLI history was not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: Affects: CLI, Desktop device prompts. Work needed: Add local history or state the limit.
- Evidence: approve/route.ts:631

## GAP-F059-03-03

**VS Code has no revoke control for cloud saved rules found; brief lists none.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: Affects: VS Code. Work needed: Confirm and add or mark n/a.
- Evidence: approvalHistory.ts only reads history

## GAP-F059-03-04

**Brief says Mobile 'Allow for chat' lives in MessageBubble.tsx:690/719; those lines are unrelated (sent file chips).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Detail: Affects: Brief accuracy. Work needed: Correct references.
- Evidence: apps/mobile/src/features/chat/components/MessageBubble.tsx:670-740

## GAP-F059-04-01

**Site rules need a workspace; personal accounts have none.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Detail: Affects: Web and Desktop individual users. Work needed: Decide a personal site list or document the limit.
- Evidence: connector-policy-service.ts:87

## GAP-F059-04-02

**Tauri hosted search ignores workspace lists; applicability to the public Electron Desktop unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Detail: Affects: Desktop local and own-key turns. Work needed: Trace Electron own-key search and either pass lists or withhold hosted search.
- Evidence: server_tools.rs:8-47

## GAP-F059-04-03

**Mobile has no folder or site rules.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Detail: Affects: Mobile. Work needed: Decide whether Mobile needs them (cloud rules already apply on server turns).
- Evidence: brief S59.06 missing

## GAP-F059-04-04

**VS Code folder grant is VS Code trust only; no in-app revoke.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Detail: Affects: VS Code. Work needed: Confirm and document or add a control.
- Evidence: workspaceConsent.ts:20-48

## GAP-F059-04-NOTBUILT

**Folder and website limits: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Requirement items: S59.06
- Detail: Mobile: S59.06

## GAP-F059-04-PARTLY

**Folder and website limits: partly built on Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Requirement items: S59.06
- Detail: Desktop S59.06: Desktop cloud chats send web_search and web_fetch to the server, so the workspace site rules bind them. BYOK and local desktop turns attach the provider's hosted web_search and web_fetch in the Tauri client (server_tools.rs), which does not read the workspace lists; the client would have to withhold hosted search or pass the lists as allowed_domains or blocked_domains. The native browser gate still asks per command and reads no site rule.

## GAP-F059-05-01

**Default differs between the shared constant (Ask) and web/mobile cloud (Skip); Mobile marks Ask 'Recommended'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Affects: Web, Desktop (hosted), Mobile cloud users. Work needed: Decide the product default and align constants and copy.
- Evidence: tool-approval-policy.ts:11,13; toolApprovalPolicy.ts:29; auto-approve.tsx:28

## GAP-F059-05-02

**No global read-only mode that refuses writes on Web, Mobile, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Affects: Those apps. Work needed: Add a refusing mode or relabel the policy.
- Evidence: tool-metadata.ts:1083-1100

## GAP-F059-05-03

**Mobile Local policy has no runtime reader found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Affects: Mobile Local. Work needed: Confirm the consumer or remove the Local setting.
- Evidence: search of toolApprovalPolicy in apps/mobile

## GAP-F059-05-04

**Brief code lines (request-processor.ts:3731/4573, webviewContent.ts:3549) not matched to mode code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Affects: Brief accuracy. Work needed: Refresh the brief.
- Evidence: webviewContent.ts:3549 is a subagents panel

## GAP-F059-06-01

**No first-class destination stake; destination and path only inside the raw request.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: Affects: All apps using shared stakes. Work needed: Add destination and path stakes and show them first.
- Evidence: tool-approval-stakes.ts:3-6

## GAP-F059-06-02

**Stakes depend on tool-name patterns.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: Affects: Tools with other names. Work needed: Use tool metadata (action class) instead of names.
- Evidence: tool-approval-stakes.ts:13-16

## GAP-F059-06-03

**Warning copy differs by card: plain card warns only on escalation, connector card on destructive.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: Affects: Web, Desktop hosted. Work needed: Use the server review on every card.
- Evidence: ToolCallCard.tsx:290, tool-approval-presentation.ts:22

## GAP-F059-06-04

**VS Code and Chrome cards read details built elsewhere (CLI text, extension code); parity with the shared stakes not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: Affects: VS Code, Chrome. Work needed: Compare and align.
- Evidence: webviewContent.ts:7101, bubbles.ts:971

## GAP-F059-07-01

**Edit of command, recipient or text is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-07](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Detail: Affects: All six apps. Work needed: Design typed edit per tool kind, add to wire schema, re-run risk checks on edited value, build controls per app
- Evidence: No edit field in tool-approval-resume.ts:34-39; read-only args in ToolCallCard.tsx, CloudToolApprovalControls.tsx, bubbles.ts, approval_overlay.rs

## GAP-F059-07-02

**Brief says edit is missing everywhere but file-content edit works in VS Code and CLI app-server**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-07](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Detail: Affects: Brief accuracy; VS Code, CLI. Work needed: Correct the brief rows; add an end-to-end test
- Evidence: developer_host.rs:5198; ChatStateManager.ts:3440

## GAP-F059-07-03

**Guidance missing on Web inline card and Mobile Tasks sheet**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-07](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Detail: Affects: Web, Desktop chat card, Mobile Tasks. Work needed: Add the same box and pass guidance through
- Evidence: ToolCallCard.tsx:405-430; CloudRunDetailSheet.tsx:417-440

## GAP-F059-07-04

**VS Code guidance only on Deny**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-07](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Detail: Affects: VS Code. Work needed: Allow a note with Allow once
- Evidence: webviewContent.ts:7248

## GAP-F059-07-05

**No CLI TUI note length limit found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-07](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Detail: Affects: CLI. Work needed: Cap at the shared 4000 limit
- Evidence: approval_overlay.rs:367-376

## GAP-F059-07-NOTBUILT

**Edit or redirect a pending action: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F059-07](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Requirement items: S59.21
- Detail: Web: S59.21; Desktop: S59.21; Mobile: S59.21; CLI: S59.21; VS Code: S59.21; Chrome: S59.21

## GAP-F059-08-01

**Approval lease does not clearly recover on its own**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md)
- Detail: Affects: All Cloud approval users after a server failure mid-resume. Work needed: Reclaim resuming approvals past lease_expires_at or sweep them; add a test
- Evidence: cloud-agent-run-service.ts:1935,1957 versus 1853

## GAP-F059-08-02

**Chat-card expiry is not tied to the 24 hour clock**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Use the checkpoint timestamp to mark cards expired
- Evidence: useChatStream.ts:1138; chatExecutionStore.ts:791

## GAP-F059-08-03

**No time-remaining display**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md)
- Detail: Affects: All apps. Work needed: Show remaining time
- Evidence: none found in card components

## GAP-F059-08-04

**Brief wording mixes device steps with approvals; Cloud Code uses 30 minutes and 409**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md)
- Detail: Affects: Brief accuracy, CLI cloud Code users. Work needed: Correct brief; consider one expiry code
- Evidence: cloud-code-agent-service.ts:964; approvals/route.ts:42

## GAP-F059-08-05

**No end-to-end test of a 24 hour expiry through the route found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md)
- Detail: Affects: Verification. Work needed: Add a route test
- Evidence: route.test.ts has no 410 case (searched)

## GAP-F059-09-01

**Chrome cannot answer or follow an approval from another device**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Detail: Affects: Chrome users. Work needed: Verify, then add a pending-approval list or follower
- Evidence: tasksSheet.ts has no approval code; brief marks unverified

## GAP-F059-09-02

**Mobile notification cannot approve or deny**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Detail: Affects: Mobile. Work needed: Add safe actions or document as by design
- Evidence: notificationCategories.ts:12 only 'Review'

## GAP-F059-09-03

**Brief says notification is VS Code only; Desktop banner exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief
- Evidence: agentNotifications.ts:356

## GAP-F059-09-04

**Web follows by polling only for the active conversation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Detail: Affects: Web and Desktop. Work needed: Push or broader follow
- Evidence: useChatStream.ts:1556-1560

## GAP-F059-09-05

**Mobile chat remote-answer follow not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Detail: Affects: Mobile. Work needed: Verify and add if missing
- Evidence: no follower found in chatExecutionStore.ts

## GAP-F059-09-06

**CLI cloud Code approvals have no note and use a different expiry**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Detail: Affects: CLI users. Work needed: Align with the Cloud approve contract
- Evidence: code_sessions.rs:118-150; approvals/route.ts:42

## GAP-F059-09-NOTBUILT

**Approve from another device or from a notification: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Requirement items: S59.26, S59.27
- Detail: Chrome: S59.26, S59.27

## GAP-F059-09-PARTLY

**Approve from another device or from a notification: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Requirement items: S59.26

## GAP-F059-10-01

**Hand back refuses the held step and relies on a fresh screenshot, not a literal resume**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md)
- Detail: Affects: Desktop. Work needed: Align the brief and UI wording, or restore the exact step
- Evidence: computerUseSession.ts:278

## GAP-F059-10-02

**Chrome page dock has no hand back**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md)
- Detail: Affects: Chrome. Work needed: Add a control or point to the side panel
- Evidence: browserRunOverlay.ts:55-78

## GAP-F059-10-03

**Inconsistent resume labels (Hand back versus Continue)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md)
- Detail: Affects: Chrome. Work needed: Use one label from the locale file
- Evidence: bubbles.ts:1587; computerUsePanel.ts:1234

## GAP-F059-10-04

**No test found for Desktop take over and hand back**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md)
- Detail: Affects: Desktop. Work needed: Add tests for pause, hand back and held-step expiry
- Evidence: computerUseSession.test.ts has only stop tests

## GAP-F059-10-05

**Hold limits differ (10 minutes versus 15) and are not shown on Desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md)
- Detail: Affects: Desktop, Chrome. Work needed: Decide one rule and show it
- Evidence: computerUseSession.ts:38; runOwnership.ts:17
