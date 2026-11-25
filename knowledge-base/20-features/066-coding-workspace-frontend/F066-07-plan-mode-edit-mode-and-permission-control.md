---
id: "F066-07"
type: "feature"
title: "Plan mode, edit mode and permission control"
aliases: ["Approval mode", "Mode menu", "Permissions: <mode>", "Plan mode", "Ask / Auto / Plan / Bypass permissions", "Tool approval policy", "ask_every_time / auto_approve_read_only / autonomous", "Permission-mode control (S66.26)", "Edit/agent mode (S66.25)", "permissionMode default/plan/auto/bypassPermissions/dontAsk (CLI)"]
area: "66 Coding-workspace frontend"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S66.24", "S66.25", "S66.26"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:local", "mode:cloud", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-authorization-and-workspaces", "SYS-execution-boundaries", "table:user_settings", "file:packages/contracts/types/src/tool-approval-policy.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-07 Plan mode, edit mode and permission control

Sets how much the coding agent may do without asking. Cloud sessions on web and desktop use three account-wide policies (ask every time, auto-approve read-only, skip approvals) plus a per-turn Plan mode. Local sessions use Plan, Ask, Auto and Bypass. CLI and VS Code have their own mode pickers. Mobile only edits the account policy in chat.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.24](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6624), [S66.25](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6625), [S66.26](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6626).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the person choose whether the agent may read, edit files and run commands on its own, or must wait for a yes. Plan mode lets the agent read and propose changes while it cannot edit. When the agent does ask, the person answers in the same surface. The running session enforces the choice: in cloud, the server decides per tool call (apps/web/lib/services/cloud-code-agent-tools.ts:345-380); in local sessions the AGI CLI enforces the mode (apps/cli/src/agent/chat.rs:2355-2365).

**Why it exists.** A coding agent can delete files and run commands, so people need a safe default and a clear way to give it more freedom. The project says an action a user cannot undo asks first (doc: AGENTS.md section 9) and security behaviour fails closed (doc: AGENTS.md section 6).

**Who uses it.** Developers who start or watch coding sessions in the web Code page, the desktop app, the CLI and the VS Code extension. Workspace admins also matter, because they can forbid the skip-approvals policy (packages/contracts/types/src/tool-approval-policy.ts, key allowAutonomousToolApprovals).

**Problems it solves**

- Stops the agent from changing files or running commands the person did not expect.
- Lets a person who trusts the agent skip repeated prompts.
- Lets the person review a proposed plan before any edit is made.
- Lets an organisation block unattended autonomy for its members.

**Use cases**

- Start a cloud session in Plan mode, read the plan, then switch the mode menu to an editing policy and ask it to apply the plan.
- Keep Ask on while the agent works in an unfamiliar repo, approving each edit from the approval card.
- On the desktop, run a local session in Auto so edits apply without prompts while commands still ask.
- In the CLI, start with the plan permission mode so no mutating tool runs before the plan is approved.

## 2. User experience

**Where to find it**

- Web Code page, cloud environment: the composer control labelled 'Approval mode' (apps/web/features/code/code-surface.ts:170) opens a menu titled 'Mode' (code-surface.ts:242). Rows: 'Ask before every action', 'Run read-only actions without asking', 'Skip approvals' (packages/contracts/types/src/tool-approval-policy.ts) and 'Plan' (code-surface.ts:243). The Plan row is shown only when the page can take a turn mode (apps/web/features/code/components/CodeComposer.tsx:1457-1468).
- Web Code page, local environment (desktop only, needs the Electron host): a chip labelled 'Agent mode: <label>' with a menu of Plan, Ask, Auto and 'Bypass permissions' (apps/web/features/code/components/LocalTurnControls.tsx:57-110, packages/contracts/local-runtime/src/developer-session.ts:54-59). The composer also shows a lock hint 'Permissions: <label>' (apps/web/features/code/local-code.ts:359 area; CodeComposer.tsx:2117-2130).
- Desktop: the same hosted web page inside the Electron window [inferred from doc: AGENTS.md section 5 'The public Desktop shows the hosted web app'].
- Mobile: a pill in the chat composer labelled 'Tool approvals: <policy>' opening a sheet 'Tool approvals' (apps/mobile/src/features/chat/components/ComposerApprovalModeControl.tsx:15-45). It is mounted in apps/mobile/app/(app)/chat/[id].tsx and apps/mobile/app/(app)/(tabs)/chat.tsx. No mode control was found in the mobile code-session view (apps/mobile/src/features/companion/components/CodeSessionView.tsx).
- CLI: flag/permission mode default, plan, auto, bypassPermissions, dontAsk (apps/cli/src/cli_options.rs:12-24); in the terminal interface the slash command for plan mode exists (apps/cli/src/tui/tui_app.rs tests 'one_bare_plan_command_enters_plan_mode', line 9299).
- VS Code: command 'agi-workforce.setAgentMode' opens a quick pick titled '<product>, Modes' with Ask, Auto, Plan and Bypass permissions (apps/extension-vscode/src/core/commandSetup.ts:1872-1920).

**Before you start**

- Cloud web: signed-in account; cloud Code sessions also need the managed environment switched on (apps/web/lib/e2b/gate.ts:16, per the brief).
- Local session: the desktop app with a folder opened and the AGI CLI runtime available (apps/web/features/code/hooks/use-local-session.ts; apps/desktop/electron/runtime/developerSessionService.ts).
- Mobile control: signed in and not in Local app mode; it renders nothing otherwise (ComposerApprovalModeControl.tsx:23, apps/mobile/src/features/settings/tool-approvals/toolApprovalPolicyOwner.ts:67,123).
- Skip approvals is hidden on mobile when the workspace forbids it (ComposerApprovalModeControl.tsx:27-29).

**Screens and controls**

- Cloud 'Approval mode' button with a spinner while the saved default loads or saves (CodeComposer.tsx:1416-1434) and a radio menu with a digit badge on each row (CodeComposer.tsx:1450-1468).
- Digit keys: while the menu is open, pressing a digit picks the row whose badge matches (packages/ui/ui/src/primitives/DropdownMenu.tsx:31-51). Typing digits in the composer stays text (apps/web/e2e/code-menu-digit-shortcuts.spec.ts).
- Local 'Agent mode' chip, shortcut Ctrl+Shift+M or Cmd+Shift+M cycles Ask, Auto, Plan; Bypass is never reached by the shortcut (apps/web/features/code/local-code.ts:432-437, LocalSessionPanel.tsx:1791).
- Approval card for a local request with the choices 'Allow once', 'Allow for this session', 'Always allow' (only when a command prefix is proposed), 'Deny' and 'Deny and stop' (apps/web/features/code/local-code.ts:439-446,458-466; LocalSessionPanel.tsx:1409-1426).
- Cloud approval: approve or reject through POST /api/code/sessions/{sessionId}/agent/approvals (apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:129; decision type in apps/web/lib/services/cloud-code-agent-approval-service.ts:19).

**Journey**

1. 1. Open the Code page and pick an environment (cloud or local).
2. 2. Open the mode control: 'Approval mode' for cloud, 'Agent mode' for local.
3. 3. Choose a policy or Plan (click, or press the digit shown on the row).
4. 4. Send a task. The agent runs under that mode.
5. 5. When the agent needs permission an approval card appears with the command or edit and the reason.
6. 6. Answer: cloud approve or reject; local allow once, for the session, always allow a command prefix, deny, or deny and stop.
7. 7. The turn continues, or stops if the person chose 'Deny and stop'.

**What the person sees and gets**

- Cloud: the control shows 'Plan' while planning, otherwise the short label 'Ask', 'Auto' or 'Skip' (CodeComposer.tsx:1424-1428; tool-approval-policy.ts option shortLabel).
- Cloud refusal text in plan mode: 'Plan mode proposes changes without making them. Switch to an editing mode to apply the plan.' (cloud-code-agent-tools.ts:336-337).
- Local: 'Permissions: <mode>' hint, and a warning style for Bypass (CodeComposer.tsx:2117-2130).
- Mobile: label turns to '<label> · Not synced' when a save fails, plus an error line and a Retry button (ComposerApprovalModeControl.tsx:60,134-150).

**Settings**

- Account default policy panel in Settings: ToolApprovalDefaultsPanel (apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx); the message 'Your workspace does not allow skipping approvals.' is defined there (line 20).
- Workspace key allowAutonomousToolApprovals on the organisation policy (tool-approval-policy.ts).
- VS Code bypass consent stored per workspace (apps/extension-vscode/src/features/permissions/agentModeConsent.ts:8-12).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web cloud: policy menu, Plan row, digit shortcuts, save to the account preference namespace with rollback on failure (apps/web/features/code/components/CodeComposer.tsx:1369-1470).
- Web cloud server gate: each tool call is classified as run, ask or refuse; plan mode removes the file-edit tools and refuses edits (apps/web/lib/services/cloud-code-agent-tools.ts:345-380,434-446).
- Web cloud: the server reads the account policy fresh per turn and falls back to ask-every-time on error or when the workspace forbids autonomy (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts; cloud-code-agent-service.ts:672).
- Local (desktop host): four modes, bypass confirmed in the desktop main process, five approval decisions, per-thread memory of the mode except Bypass (apps/desktop/electron/runtime/dispatcher.ts:2946-2966; apps/web/features/code/local-code.ts:425-430).
- CLI: five permission modes; plan mode blocks mutating tools until the plan is approved (apps/cli/src/cli_options.rs:12-24; apps/cli/src/agent/chat.rs:2355-2365); a persisted bypass setting is refused on purpose (cli_options.rs:33-39).
- VS Code: mode picker with consent for Bypass (apps/extension-vscode/src/core/commandSetup.ts:1872-1920; agentModeConsent.ts).
- Mobile chat: account policy sheet with load, save, error and retry states (ComposerApprovalModeControl.tsx).

**Incomplete**

- Web cloud Plan mode has no 'approve this plan' step: it removes edit tools and the person switches mode to apply (cloud-code-agent-tools.ts:336-337). The brief says plan edits stay blocked until the person approves the plan; that approval step exists in the CLI only (apps/cli/src/agent/chat.rs:1315, 2360).
- The web cloud policy is one account-wide default, not per session (CodeComposer.tsx:1398-1412). The brief marks web partial, consistent with this.
- Mobile has no mode control inside the code-session view; it can answer approvals the desktop sends (apps/mobile/src/features/companion/remote-code/service.ts:83) but cannot pick Plan or a policy for that session. Brief says missing; not found in code.

**Present but disconnected or switched off**

- The cloud fallback constant 'auto_approve_read_only' in the agent loop is used only when no policy is passed in (apps/web/lib/services/cloud-code-agent-loop.ts:111,203,466); the service loads the account policy and passes it (cloud-code-agent-service.ts:672,823), so the brief's claim that the loop default governs cloud sessions does not hold.
- Remote SSH sessions force Ask mode, text input only, and only allow once, deny and deny and stop (apps/desktop/electron/runtime/dispatcher.ts:3385-3405).

**Not available**

- Chrome extension: not applicable per the brief status.
- Mobile: Plan mode and the Code mode are missing per the brief; no code was found for them.
- A phone-started turn can never name Bypass (packages/contracts/local-runtime/src/developer-session.ts:46-52).

## 4. Required behaviour

**Established requirements**

- The default policy is ask every time. (source: S66.26; packages/contracts/types/src/tool-approval-policy.ts:11)
- The account-level cloud default is autonomous (skip approvals) when nothing is stored. (source: packages/contracts/types/src/tool-approval-policy.ts:13; apps/web/shared/types/toolApprovalPolicy.ts (parseToolApprovalPolicy))
- The user can switch the agent into a plan mode where it proposes a plan and makes no edits until approved. (source: S66.24 Should)
- The user chooses a mode where the agent edits and runs tools on its own versus asking first. (source: S66.25 Should)
- The user sets how much the agent must ask (ask every time, auto-approve safe, autonomous) and the running session honours it. (source: S66.26 Should)
- An action a user cannot undo asks first and fails closed. (source: doc: AGENTS.md sections 6 and 9)
- The menu supports keyboard digit selection. (source: apps/web/e2e/code-menu-digit-shortcuts.spec.ts)

**Acceptance criteria**

1. Cloud web: with no saved policy the 'Approval mode' control shows 'Skip'; choosing 'Ask before every action' persists it and survives a reload.
2. Cloud web: in Plan mode no file-edit tool is offered to the model and an edit attempt is refused with the plan-mode text.
3. Cloud web: with 'Ask before every action' even a read-only tool call produces an approval request.
4. Cloud web: when the workspace forbids autonomy, a stored 'Skip approvals' behaves as ask-every-time on the server.
5. Local session: choosing Bypass requires a confirmation at the computer; the Ctrl/Cmd+Shift+M shortcut never lands on Bypass.
6. Local approval card offers 'Always allow' only when a command prefix is proposed; 'Deny and stop' ends the turn.
7. CLI: in plan permission mode a mutating tool call is refused with 'plan_mode_unapproved' until the plan is approved.
8. Keyboard: with the cloud menu open, pressing the digit on a row selects it and closes the menu.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The local and cloud modes are two different systems with different wording; a single wording per surface would reduce confusion [inferred].
- Mobile in Local mode keeps its own stored policy in the settings store rather than the account namespace [inferred from toolApprovalPolicyOwner.ts:123-147].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an explicit 'Approve plan and start editing' action to cloud Plan mode so it matches the CLI and the brief.
- [proposed] Show the active mode inside the mobile code-session view.
- [proposed] Offer a per-session policy override in addition to the account default.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Tool approval policy contract | `packages/contracts/types/src/tool-approval-policy.ts` | Policy names, defaults, labels, hints and the organisation key for forbidding autonomy. |
| config | Web account default | `apps/web/shared/types/toolApprovalPolicy.ts` | Web default policy and parser of the stored setting. |
| component | ApprovalModeControl | `apps/web/features/code/components/CodeComposer.tsx` | Cloud policy menu with Plan row and digit badges (lines 1369-1470). |
| component | LocalTurnControls | `apps/web/features/code/components/LocalTurnControls.tsx` | Local Agent mode menu and effort menu. |
| component | LocalApprovalCard | `apps/web/features/code/components/LocalApprovalCard.tsx` | Shows a pending local approval with the decision buttons. |
| service | Local mode helpers | `apps/web/features/code/local-code.ts` | Mode hints, cycle order, remembered mode rule, decision labels and the decision list. |
| hook | useLocalSession | `apps/web/features/code/hooks/use-local-session.ts` | Receives approval events and sends the answer (decideApproval, line 923). |
| service | Cloud tool gate | `apps/web/lib/services/cloud-code-agent-tools.ts` | gateCloudCodeTool and plan-mode tool list. |
| service | Cloud agent loop | `apps/web/lib/services/cloud-code-agent-loop.ts` | Calls the gate for each tool call and stops with awaiting_approval (line 591-615). |
| service | Cloud agent service | `apps/web/lib/services/cloud-code-agent-service.ts` | Loads the policy and turn mode before a turn (line 672-673). |
| service | loadToolApprovalPolicy | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Reads user_settings, applies the workspace rule, fails closed. |
| service | Cloud approval service | `apps/web/lib/services/cloud-code-agent-approval-service.ts` | Lists and decides cloud approvals; expiry error. |
| endpoint | POST/GET approvals | `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts` | List pending approvals and record approve or reject. |
| component | ToolApprovalDefaultsPanel | `apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx` | Settings panel for the account default. |
| config | Agent mode list | `packages/contracts/local-runtime/src/developer-session.ts` | Plan, ask, auto, bypass; labels; remote turn may not name bypass. |
| service | Desktop dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | developer_turn_start with bypass confirmation, developer_approval_answer, SSH limits. |
| command | CLI permission modes | `apps/cli/src/cli_options.rs` | PermissionMode enum and persisted-mode refusal of bypass. |
| service | CLI plan gate | `apps/cli/src/agent/chat.rs` | Blocks mutating tools in plan mode until the plan is approved. |
| service | CLI developer host mode mapping | `apps/cli/src/app_server/developer_host.rs` | Maps the desktop agent mode to the CLI permission mode (lines 7702-7743). |
| command | agi-workforce.setAgentMode | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code mode picker. |
| service | agentModeConsent | `apps/extension-vscode/src/features/permissions/agentModeConsent.ts` | Per-workspace consent for Bypass. |
| component | ComposerApprovalModeControl | `apps/mobile/src/features/chat/components/ComposerApprovalModeControl.tsx` | Mobile policy sheet. |
| store | toolApprovalPolicyOwner | `apps/mobile/src/features/settings/tool-approvals/toolApprovalPolicyOwner.ts` | Mobile load/save of the policy with local and cloud branches. |
| component | DropdownMenu digit shortcuts | `packages/ui/ui/src/primitives/DropdownMenu.tsx` | Picks a menu row by its digit badge. |
| test | digit shortcuts e2e | `apps/web/e2e/code-menu-digit-shortcuts.spec.ts` | Browser test of the menu digits. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Cloud: the composer reads the saved default policy from the account preference store when it mounts; on failure it shows the safe default. | device and our servers | apps/web/features/code/components/CodeComposer.tsx:1380-1394 |
| Cloud: picking a policy saves it to the account preferences and rolls back the label if the save fails; picking Plan only changes the turn mode in page state. | device and our servers | CodeComposer.tsx:1398-1412,1438-1448; apps/web/features/code/CloudCodePage.tsx:280,2868-2869 |
| Cloud: at the start of each agent turn the server reads the stored policy and the workspace rule, and reads the turn mode. | our servers | apps/web/lib/services/cloud-code-agent-service.ts:672-673; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts |
| Cloud: for each tool call the loop asks the gate; the result is run, ask (turn stops as awaiting_approval) or refuse. | our servers | apps/web/lib/services/cloud-code-agent-loop.ts:591-615; cloud-code-agent-tools.ts:345-380 |
| Cloud: the person approves or rejects through the approvals endpoint and the turn resumes. | device and our servers | apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:128-129 |
| Local: the page asks the desktop host to start a turn with the chosen agent mode; Bypass is confirmed by the person in the desktop main process first. | device | apps/desktop/electron/runtime/dispatcher.ts:2946-2966 |
| Local: the AGI CLI runs the turn, maps the mode to its permission mode, and emits approval-requested events that the page shows as a card. | device | apps/cli/src/app_server/developer_host.rs:7702-7743; apps/web/features/code/hooks/use-local-session.ts:703-725 |
| Local: the answer goes back through developer_approval_answer; 'always allow' or sensitive decisions are confirmed in the desktop main process. | device | apps/desktop/electron/runtime/dispatcher.ts:3011-3036; use-local-session.ts:923-929 |
| Phone: a paired phone can answer a desktop approval over the remote link. | device and our servers | apps/mobile/src/features/companion/remote-code/service.ts:83; packages/platform/utils/src/remoteControl/codeRemoteController.ts:1114-1118 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Account default tool-approval policy | settings JSON in table public.user_settings, namespace 'tool-approvals' | Yes, read by web, mobile and the server per turn | Kept until changed; account deletion handling unknown |
| Cloud turn mode (plan or default) | turn controls read by readTurnControls for the turn | Server side per turn | unknown |
| Local thread agent mode (never Bypass) | desktop session memory per thread | No | Bypass is never remembered (apps/web/features/code/local-code.ts:425-430) |
| Pending cloud approvals | database rows read by the approval service (table name not confirmed) | Server | Expire; an expired one errors with CloudCodeApprovalExpiredError (cloud-code-agent-approval-service.ts:19-24) |

**Models and providers.** The policy gate is independent of the model: the same rules apply whichever model runs the turn. The mode is also written into the model's instructions as a line (cloud-code-agent-tools.ts:384-405). Local sessions use whatever model the CLI runtime has chosen (SYS-model-catalog-and-routing, SYS-inference-providers).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud policy and mobile control need a signed-in account. Local sessions on the desktop need the desktop host; sign-in for local model use is a separate question and is not decided by this feature [inferred]. |
| Permissions | A workspace can forbid 'Skip approvals' with allowAutonomousToolApprovals; forbidden autonomy resolves to ask-every-time (tool-approval-policy.ts; loadToolApprovalPolicy). Phone turns cannot name Bypass (developer-session.ts:46-52). |
| Subscription | The mode control itself has no plan check in the code read. Cloud Code sessions are gated elsewhere (apps/web/lib/e2b/gate.ts:16). Local sessions with the account's models need the plan capability developer_surfaces, available to pro, max, max_15x, team, team_premium and enterprise (packages/contracts/types/src/billing-catalog.ts, PRO_TIERS; apps/web/features/code/local-code.ts:703-710). |
| Limits and metering | none found in the code for the mode control itself; the turn it governs is metered by the managed usage system (SYS-subscriptions-entitlements-and-usage). |
| Feature flags | Cloud sessions depend on AGI_E2B_EXECUTION and E2B_API_KEY (names only, per the brief and apps/web/lib/e2b/gate.ts:16-30). |
| Model compatibility | none found in the code; the gate does not look at the model. |
| Provider restrictions | none found in the code for the mode control. |
| Local mode | Local sessions use Plan, Ask, Auto and Bypass enforced by the on-device CLI, with approvals shown in the page. On mobile in Local app mode the approval control is hidden (ComposerApprovalModeControl.tsx:23). The CLI keeps a local policy store; cloud policy is not read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading the saved default (cloud) | Button shows a spinner and aria-busy true until loaded. | CodeComposer.tsx:1421-1431 |
| Policy save fails (cloud web) | Label rolls back to the previous policy; no message shown in this component. | CodeComposer.tsx:1398-1412 |
| Policy save fails (mobile) | Label shows 'Not synced', error text and Retry. | ComposerApprovalModeControl.tsx:60,134-150 |
| Policy read fails on the server | Falls back to ask every time and logs a warning. | apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts |
| Workspace forbids autonomy | Mobile hides the Skip row; the server treats a stored 'autonomous' as ask-every-time. | ComposerApprovalModeControl.tsx:27-29; tool-approval-policy.ts (organizationPermitsAutonomousToolApprovals) |
| Command too long to show for approval | Refused with 'Split it into smaller commands.' | cloud-code-agent-tools.ts:341-343,355-357 |
| Denied command class | Refused outright, no approval offered. | cloud-code-agent-tools.ts:352 |
| Approval expired | Error 'This approval request expired and can no longer be decided'. | cloud-code-agent-approval-service.ts:19-24 |
| Remote SSH session | Ask mode only; persistent grants refused. | apps/desktop/electron/runtime/dispatcher.ts:3385-3405 |
| Bypass chosen on a phone turn | Ignored; the thread keeps its saved mode. | packages/contracts/local-runtime/src/developer-session.ts:46-52 |
| Keyboard | Digit badge picks a menu row; typing digits in the composer stays text. | packages/ui/ui/src/primitives/DropdownMenu.tsx:31-51; apps/web/e2e/code-menu-digit-shortcuts.spec.ts |
| Offline, cancel, timeout of the mode save | not handled in the code beyond the rollback shown above for web. | CodeComposer.tsx:1398-1412 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/e2e/code-menu-digit-shortcuts.spec.ts`: Open the 'Approval mode' menu, pick rows by digit, Plan row digit, and composer digits stay text.
- `apps/web/features/code/CloudCodePage.test.tsx`: Page-level tests that mention the Approval mode control (found by search); exact cases not read.
- `apps/web/lib/services/__tests__/cloud-code-agent-tools.test.ts`: Command risk classification, tool definitions and approval wording used by the gate; the gate function itself was not shown to be called here.
- `apps/web/lib/services/__tests__/cloud-code-agent-loop.test.ts`: Agent loop behaviour; whether it exercises plan mode is unknown.
- `apps/web/lib/services/__tests__/cloud-code-agent-approval-service.test.ts`: Cloud approval service.
- `apps/web/features/code/components/LocalApprovalCard.test.tsx`: The local approval card.
- `apps/web/features/code/components/LocalTurnControls.test.tsx`: Local turn controls (effort levels shown; mode menu hidden case).
- `apps/web/features/code/components/LocalSessionPanel.test.tsx`: Local session approvals describe block (line 891).
- `apps/mobile/__tests__/ComposerApprovalMode.test.tsx`: Mobile sheet: hidden outside signed-in cloud, three policies, write to account, rollback, hidden autonomous, stays hidden on load failure, reading column width.
- `apps/extension-vscode/src/__tests__/agentModeConsent.test.ts`: VS Code Bypass consent.
- `apps/cli/src/tui/tui_app.rs`: In-file tests for the plan slash command and re-entering plan mode (lines 9299-9376, 10096).
- `apps/cli/src/agent/chat.rs`: In-file test live_turn_plan_gate_blocks_mutation_and_subagent_before_any_spawn (line 5246).

**Test scenarios**

- **Cloud policy default and persistence**
  1. Sign in with an account that has no stored policy.
  2. Open /code, cloud environment.
  3. Read the 'Approval mode' label.
  4. Choose 'Ask before every action', reload the page.
  - Expected: First label is 'Skip'; after the change and reload the label reads 'Ask'.
- **Cloud Plan mode refuses edits**
  1. Choose 'Plan' in the Mode menu.
  2. Send a task that needs a file edit.
  3. Read the agent reply and any approval cards.
  - Expected: No edit tool runs; the agent proposes changes; any edit attempt is refused with the plan-mode text.
- **Workspace forbids autonomy**
  1. Set allowAutonomousToolApprovals false on the workspace policy.
  2. As a member with 'Skip approvals' stored, run a cloud turn that edits a file.
  - Expected: The edit waits for approval.
- **Local Bypass confirmation**
  1. On the desktop open a local session.
  2. Pick 'Bypass permissions' and send a task.
  3. Press Ctrl/Cmd+Shift+M repeatedly.
  - Expected: A confirmation appears at the computer; the shortcut cycles only Ask, Auto and Plan.
- **Deny and stop**
  1. In a local Ask session send a task needing a command.
  2. On the card choose 'Deny and stop'.
  - Expected: The command does not run and the turn ends.
- **Mobile policy sheet**
  1. Sign in on mobile in cloud mode.
  2. Open the 'Tool approvals' pill, choose another row.
  3. Switch the app to Local mode.
  - Expected: The choice is saved to the account; in Local mode the pill is not shown.

**Where to look when it fails**

- Server log line '[tool-approvals] account default policy unavailable; requiring approval' (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts).
- Error names CloudCodeApprovalExpiredError and plan_mode_unapproved (apps/cli/src/agent/chat.rs:2365).
- Error code THREAD_WRITER_CONFLICT when another program holds the thread (apps/desktop/electron/runtime/developerSessionService.ts:813).
- Table public.user_settings, namespace 'tool-approvals'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/066-coding-workspace-frontend.md](../../70-qa/test-plans/web/066-coding-workspace-frontend.md)
- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- Mobile: [70-qa/test-plans/mobile/066-coding-workspace-frontend.md](../../70-qa/test-plans/mobile/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)
- VS Code: [70-qa/test-plans/vscode/066-coding-workspace-frontend.md](../../70-qa/test-plans/vscode/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **Cloud Plan mode has no plan-approval step; edits stay refused until the person changes mode.** Affects: Web and desktop cloud sessions. Evidence: cloud-code-agent-tools.ts:336-337; S66.24 Should. Work needed: Add an approve-plan action that switches the turn mode and starts editing.
- **Mobile has no Plan mode or per-session mode control in the code-session view.** Affects: surface:mobile. Evidence: Brief S66.24-26 mobile missing; CodeSessionView.tsx has no mode control. Work needed: Add mode display and selection to the remote code session.
- **The brief's cited line numbers for this item mostly point at unrelated code (for example dispatcher.ts:231 and :1055, chat.rs:1107 is the browser bridge).** Affects: Anyone using the brief as a map. Evidence: Files opened during this write-up. Work needed: Refresh the brief's code references.
- **Cloud default is 'Skip approvals' when nothing is stored, which differs from the contract default of ask-every-time.** Affects: New cloud accounts. Evidence: tool-approval-policy.ts:11,13; apps/web/shared/types/toolApprovalPolicy.ts. Work needed: Confirm with the owner that this difference is intended and document it.
- **Cloud web save failure shows no message, only a label rollback.** Affects: surface:web. Evidence: CodeComposer.tsx:1398-1412. Work needed: Show an error like mobile's 'Not synced'.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:local
- mode:cloud
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-authorization-and-workspaces
- SYS-execution-boundaries
- table:user_settings
- file:packages/contracts/types/src/tool-approval-policy.ts

## Unknown

- The exact line where cloud-code-agent-service.ts passes approvalPolicy into the loop was reported at 823 in the first read but not re-opened.
- Whether a pending cloud approval is stored in a named table or in the turn row (name not opened).
- Whether the brief's 'desktop done' for plan mode in apps/desktop/src (Tauri) differs from the Electron path (the Electron dispatcher was read; the Tauri code was not).
- Whether phone and desktop can both drive one session at once: only a writer-conflict error code was seen.
