---
id: "AREA-059"
type: "area"
title: "Approvals and human-in-the-loop UI"
features: ["F059-01", "F059-02", "F059-03", "F059-04", "F059-05", "F059-06", "F059-07", "F059-08", "F059-09", "F059-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 59. Approvals and human-in-the-loop UI

When the agent wants to do something that can change data, send a message, spend money, or touch files on the person's computer, it stops and waits for the person to approve or deny it. This area is the set of prompts, buttons, saved rules and modes that let the person decide each action, remember that decision, or choose how often the agent should ask. It matters because it is how the person stays in control of what the agent does on their behalf.

**Who uses it.** The code I opened shows approval prompts for signed-in people on the managed Cloud path (the chat completions routes), and for local desktop and CLI sessions. I found no paid-plan gate on approvals in the files I opened. Workspace admins have one control: the server reads a workspace setting named allowAutonomousToolApprovals (packages/contracts/types/src/tool-approval-policy.ts:80). When it is not true, members cannot use the skip-approvals mode. Developers meet the same prompts through the CLI and the VS Code extension.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F059-01](F059-01-approve-or-deny-one-action.md) | Approve or deny one action | built | built | built | built | built | built |
| [F059-02](F059-02-approve-several-calls-at-once.md) | Approve several calls at once | built | built | built | built | built | partly |
| [F059-03](F059-03-remember-a-decision-review-saved-rules-and-see-his.md) | Remember a decision, review saved rules, and see history | built | built | built | built | built | built |
| [F059-04](F059-04-folder-and-website-limits.md) | Folder and website limits | built | partly | no | built | built | built |
| [F059-05](F059-05-permission-modes.md) | Permission modes | built | built | built | built | built | built |
| [F059-06](F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md) | What the approval shows, and stronger checks for risky actions | built | built | built | built | built | built |
| [F059-07](F059-07-edit-or-redirect-a-pending-action.md) | Edit or redirect a pending action | partly | partly | partly | partly | partly | partly |
| [F059-08](F059-08-approval-timing-and-resuming-a-run.md) | Approval timing and resuming a run | built | built | built | built | built | built |
| [F059-09](F059-09-approve-from-another-device-or-from-a-notification.md) | Approve from another device or from a notification | built | built | built | built | built | no |
| [F059-10](F059-10-take-over-the-agent-s-screen-or-browser.md) | Take over the agent's screen or browser | n/a | built | n/a | n/a | n/a | built |

Requirement items for this area: [10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md).

## How this area works in the code

1. **1. The agent wants a tool. The gate ranks the rules and decides allow, ask, deny, or escalate..** Each tool call is checked against nine ranked rules, in order. Rule 1 denies a call the person blocked. Rule 4 allows a call the person always allowed. Rule 5 asks when the person chose ask. Rule 7 asks in manual mode. A 'lethal trifecta' (untrusted content, a sensitive source and an egress path together) escalates. Rule 9 allows when nothing else applies. 'escalate' asks and, when unattended, denies unless the run can pause. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:68`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:130`)
2. **2. The default policy is read..** The stored policy is read per request from the user's settings row. An autonomous choice is downgraded to the default when the workspace forbids it. Unknown stored values fall back to the default. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:48`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:55`, `packages/contracts/types/src/tool-approval-policy.ts:93`)
3. **3. Saved per-tool verdicts are loaded..** Saved allow, ask and deny levels for each connector tool are loaded and combined with session grants, workspace rules and lockdown. A standing allow for a critical tool is refused when saved. (`apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:61`, `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:89`, `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:388`)
4. **4. The run pauses and a checkpoint is saved..** When a call must wait, the run's messages and pending calls are saved as a checkpoint with a time limit. Cloud checkpoints last 24 hours and device checkpoints 15 minutes. (`apps/web/lib/services/cloud-agent-run-service.ts:457`, `apps/web/lib/services/cloud-agent-run-service.ts:515`, `apps/web/lib/services/cloud-agent-run-service.ts:1802`)
5. **5. The card shows the request and its stakes..** The stakes (recipients, amounts, items, paths, commands, destination) are built from the tool arguments and shared by all apps. The web card shows Approve and Decision buttons, the request block and the stakes list. (`packages/contracts/types/src/tool-approval-stakes.ts:122`, `packages/ui/unified-chat/src/components/ToolCallCard.tsx:440`, `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx:134`)
6. **6. The decision is sent..** The client collects each call's decision (approved or rejected, with session or always scope) and posts tool_approvals to the resume path. Mobile sends the same shape from its execution store. (`packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:35`, `apps/web/lib/hooks/useChatStream.ts:5700`, `apps/mobile/stores/chat/chatExecutionStore.ts:739`)
7. **7. The server checks and saves the decision..** The approve route claims the checkpoint (410 if expired), checks each scoped approval against the offered tool and its generation, and saves session or always grants. A stale permission returns 409. (`apps/web/app/api/llm/v1/chat/completions/approve/route.ts:144`, `apps/web/app/api/llm/v1/chat/completions/approve/route.ts:320`)
8. **8. The run resumes from the checkpoint..** The saved request is rebuilt with the same messages and the decisions. Denied calls return a denial to the model. The lease on the checkpoint is released on failure. (`apps/web/app/api/llm/v1/chat/completions/approve/route.ts:105`, `apps/web/app/api/llm/v1/chat/completions/approve/route.ts:117`)
9. **9. Local desktop and CLI keep their own prompts..** The desktop app asks through its own permission manager and stores decisions in a file in the app data folder. The CLI overlay answers the broker's request and stores rules in its config file. (`apps/desktop/electron/runtime/permissionManager.ts:326`, `apps/desktop/electron/runtime/permissionManager.ts:50`, `apps/cli/src/tui/approval_broker.rs:1`, `apps/cli/src/tui/widgets/approval_overlay.rs:60`)

## Files to know

| File | Role |
|---|---|
| `packages/contracts/types/src/tool-approval-policy.ts` | The three policies (ask, read-only auto, skip), their labels and copy, the default, and the workspace rule that can forbid the skip mode. |
| `packages/contracts/types/src/tool-approval-stakes.ts` | Builds the plain list of who, how much, where and what from tool arguments; shared by all surfaces. |
| `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | Defines the resume path that the apps post approval decisions to. |
| `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Server side of a decision: claims the checkpoint, checks expiry, saves session and always grants, resumes the run. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | The ranked rules that decide allow, ask, deny or escalate for each tool call. |
| `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Loads and saves per-tool allow, ask and deny levels, and the lockdown and disabled-connector checks. |
| `apps/web/lib/services/cloud-agent-run-service.ts` | Checkpoint lifetimes (24 hours cloud, 15 minutes device) and the claim and release of approval checkpoints. |
| `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Shared card that shows the request, stakes, warning and result of a tool call; used by web, desktop, Chrome and VS Code. |
| `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx` | Web approval controls: Approve, the decision group (allow with scope, or reject) and the always-allow confirmation. |
| `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx` | Mobile approval controls: allow once, allow for chat, always allow, and the text box to tell the agent what to do instead. |
| `apps/desktop/electron/runtime/permissionManager.ts` | Desktop asks once per capability and scope, records the answer, and keeps the saved decisions in a file. |
| `apps/cli/src/tui/widgets/approval_overlay.rs` | CLI approval overlay: the choices (Yes, No, Allow Session, Always allow, Deny All, Allow All) and what each does. |

## What is stored

- Each user's chosen tool approval policy (inside a settings JSON field): Database table public.user_settings, column settings, read in apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:55
- Saved allow, ask and deny levels per connector tool: Database table public.connector_tool_permissions (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:89), with a generation counter in public.connector_permission_generations (line 135)
- Session and conversation grants for scoped approvals: Written by saveScopedConnectorToolApprovals and insertConnectorToolSessionGrants (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:154; connector-tool-session-grants.ts). Table name not read.
- Paused run checkpoints with their pending tool calls and lease: Cloud agent run service in apps/web/lib/services/cloud-agent-run-service.ts (around lines 1802-1890). Table name not read.
- Desktop saved permission decisions: File desktop-permissions.json in the app's user data folder (apps/desktop/electron/runtime/permissionManager.ts:50)
- CLI saved permission rules: File permissions.toml in the CLI config folder (apps/cli/src/permissions.rs:373)
- Pending approval timers in the CLI: In memory only, with a 600-second expiry (apps/cli/src/tui/tui_app.rs:38 and 1658)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Default policy: ask every time**: New users and unset settings start on the ask-before-every-action mode. (packages/contracts/types/src/tool-approval-policy.ts:11)
- **Cloud account default: skip approvals**: Cloud accounts start on the skip mode unless the user changes it. (packages/contracts/types/src/tool-approval-policy.ts:9 (CLOUD_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY))
- **Workspace setting allowAutonomousToolApprovals**: When not true, a workspace forbids the skip mode; members fall back to the default. Absent means allowed. (packages/contracts/types/src/tool-approval-policy.ts:80 and :93; read in apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts)
- **Autonomy availability check in settings**: The settings panel asks whether skip mode is allowed for this user and hides the option if not. (apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:57)
- **Connector lockdown**: A locked-down account uses the locked-down permission set, which refuses tools. (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:388 and :558 (readLockdown))
- **Unattended escalation pause**: When a run is unattended and cannot pause, an escalation is denied instead of allowed. (apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:42 and :152)
- **Cloud checkpoint lifetime**: How long a cloud approval can wait (24 hours). (apps/web/lib/services/cloud-agent-run-service.ts:457)
- **Device checkpoint lifetime**: How long a device approval can wait (15 minutes). (apps/web/lib/services/cloud-agent-run-service.ts:515)
- **CLI approval expiry**: How long a CLI approval waits (600 seconds). (apps/cli/src/tui/tui_app.rs:38)
- **CLI Shift+Tab mode cycle**: Changes the permission mode for the CLI session; skip modes appear only when the session was launched with them. (apps/cli/src/tui/tui_app.rs:56-81)
- **VS Code notification for approvals**: Notification buttons for approvals appear only when the window is not focused. (apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:30-50)

## Shared between apps

Shared: the policy and stakes contracts (packages/contracts/types/src/tool-approval-policy.ts and tool-approval-stakes.ts), the resume path (packages/contracts/cloud-contracts), the approval card (packages/ui/unified-chat/src/components/ToolCallCard.tsx, used by web, desktop, Chrome and VS Code per AGENTS.md), and the server routes under apps/web/app/api/llm/v1/chat/completions (used by the managed Cloud path). Separate per app: web approval controls (ToolApprovalCard.tsx), mobile controls (CloudToolApprovalControls.tsx), the desktop permission manager (permissionManager.ts, local), the CLI broker and overlay (Rust, approval_broker.rs and approval_overlay.rs), and the VS Code notification and webview. The CLI and desktop use their own mode names (Default, Plan, Auto, Bypass, Full Auto) rather than the three shared policy names.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief cites apps/mobile/stores/chat/chatExecutionStore.ts:2519 for approval, but that line is in the attachment upload code, not approval handling. The mobile approval decision is built near line 739. (apps/mobile/stores/chat/chatExecutionStore.ts:2519)
- Brief cites apps/cli/src/tui/tui_app.rs:6319 and :6324 for approval expiry. Those lines are the /plugins slash command. The real expiry is at tui_app.rs:38 and :1658. (apps/cli/src/tui/tui_app.rs:6319)
- Brief cites apps/web/lib/hooks/useChatStream.ts:4047 as the approval decision path. That line is part of a follow loop that asks whether a remote turn is still running. The decision is posted near line 5700. (apps/web/lib/hooks/useChatStream.ts:4047)
- Brief cites apps/desktop/electron/runtime/dispatcher.ts:704-708 as the per-folder rule. Those lines hold permission wording for shell commands, not folder grants. (apps/desktop/electron/runtime/dispatcher.ts:700-712)
- Approval expiry differs by surface: cloud approvals last 24 hours, device approvals 15 minutes, CLI approvals 10 minutes. The brief's 'expires after a set time' does not say which. (apps/web/lib/services/cloud-agent-run-service.ts:457)
- Read-only mode (S59.09) is not a global switch in the code I opened. The web panel only sets saved levels per tool through a bulk preset. (apps/web/features/connectors/components/ToolPermissionsPanel.tsx:266)
- The mode vocabularies differ: web and mobile use Ask, Auto and Skip; the CLI uses Default, Plan, Auto, Bypass and Full Auto. (packages/contracts/types/src/tool-approval-policy.ts:52; apps/cli/src/tui/tui_app.rs:56)
- The web tool-approval policy file imports its type from @shared/types/toolApprovalPolicy, while the contract lives in packages/contracts/types/src/tool-approval-policy.ts. The two may be duplicates; the alias was not confirmed. (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:14)

## Not established

- No tests were run and no app was driven; this was code reading only, as the brief asks. The relayed request about localhost testing does not apply because nothing was built or run.
- Whether a paid plan gates any part of approvals: no plan check was found in the files opened.
- How the batch approval (S59.02) behaves when one call fails, on the server and in the CLI: not read.
- Mobile website rules (S59.06 is missing on mobile) and mobile per-folder rules: not verified.
- Whether desktop per-application allow/ask/deny (S59.04) is done: the brief says done, but the desktop-specific code was not read.
- The database table names for scoped grants and approval checkpoints; only the functions that use them were read.
- How the 'Allow all' CLI choice interacts with the lethal-trifecta escalation: not read.
- The mobile policy recommendation constant and the mobile sync hook (useToolApprovalPolicySync): not opened.
- Chrome extension approval code: not opened; Chrome status comes from the brief only.
- Whether the transcript receipt (S59.31) is shown on each app: the cited lines ToolTimeline.tsx:441 and useChatStream.ts:4119 were not confirmed.
- The exact difference between 'Allow once' (web and VS Code) and 'Yes' (CLI): only labels were read.
