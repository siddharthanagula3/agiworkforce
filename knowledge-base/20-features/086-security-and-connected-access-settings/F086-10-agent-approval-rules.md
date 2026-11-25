---
id: "F086-10"
type: "feature"
title: "Agent approval rules"
aliases: ["Agent approval rules", "Tool approvals", "Default permission mode", "Saved approvals", "Tool permissions", "Action approvals", "S86.23", "S86.24", "S86.25", "permission_mode"]
area: "86 Security and connected-access settings"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S86.23", "S86.24", "S86.25"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "table:connector_tool_permissions", "table:user_settings", "store:settingsStore", "api:GET /api/connectors/permissions", "api:PUT /api/connectors/permissions", "api:DELETE /api/connectors/permissions", "F086-08", "F086-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-10 Agent approval rules

Sets how much the agent asks before acting, with per-tool Allow, Ask or Deny choices that win over the default. The default is saved on the account, enforced on every cloud turn and resume, and capped by workspace policy. Saved per-tool choices can be reviewed and removed. There is no single withdraw-everything action.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.23](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8623), [S86.24](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8624), [S86.25](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8625).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not stated on this page | built | not seen by a person |
| Chrome | not stated on this page | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores an account default of ask every time, auto-approve read-only, or skip approvals, plus per-tool verdicts for each connector, and applies both when the agent wants to run a tool (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:48-70; apps/web/app/api/connectors/permissions/route.ts:30-34).

**Why it exists.** Agents can read, send and delete things in other services. The person decides how much to trust them. The product requires approval prompts for connector writes, computer use and similar actions (doc: docs/product/requirements.md section 9.7).

**Who uses it.** Anyone who lets the agent use tools: web, Desktop, phone, CLI, VS Code, Chrome.

**Problems it solves**

- Being asked about every harmless read.
- An agent deleting or sending something irreversible without asking.
- A member skipping a workspace's approval rules.

**Use cases**

- Choose 'Run read-only actions without asking' so searches run but writes still ask.
- Set a connector tool to Deny so it never runs.
- Try to give 'Always' to a delete tool and be told it will always ask.
- Reset all permissions for one connector.

## 2. User experience

**Where to find it**

- Web: Settings, Capabilities, section 'Tool approvals' with three radio options; above it Local access and below it Approval history (apps/web/features/settings/sections/CapabilitiesSection.tsx:213-219; apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:92-153).
- Web: Settings, Connectors, open a connector, 'Tool permissions' (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:95, 1245-1253). Each tool shows Allow, Ask or Deny; the draft names (Always allow, Needs approval, Blocked) are database values, not button labels (apps/web/features/connectors/components/ToolPermissionsPanel.tsx:64-92).
- Desktop: the same hosted web Settings; the Desktop runtime has its own permission decisions (see F086-11).
- Phone: Settings, 'Action approvals' with the three options, 'Recommended' on the ask option, and an approval history (apps/mobile/app/(app)/settings/auto-approve.tsx:30-80).
- CLI: during first-run setup 'Default permission mode' offers Default, Auto, Plan (apps/cli/src/onboarding.rs:737-772, 960-969); an organization policy can pin it.
- VS Code: a local runtime permissionMode of ask, auto, plan or bypass exists in its protocol (apps/extension-vscode/src/integrations/localRuntimeClient.ts:978); UI control not opened.
- Chrome: an approval policy lists always-ask reasons (apps/extension/src/features/computer-use/approvalPolicy.ts:1-20); the default-mode control was not opened.

**Before you start**

- Web and phone cloud: signed in.
- Skip approvals is offered only when no workspace the person belongs to forbids it (tool-approval-policy.ts:34-44, 74-88).
- Per-tool choices need a connected connector.

**Screens and controls**

- Radio group 'Default approval for tool actions': 'Ask before every action', 'Run read-only actions without asking', 'Skip approvals' (packages/contracts/types/src/tool-approval-policy.ts:52-76).
- Heading 'Tool approvals', helper 'Default for tool actions. Per-tool choices in Connectors win.' (ToolApprovalDefaultsPanel.tsx:101-108).
- Status text 'Saving...', 'Saved', 'Synced to your account' or 'Save failed: ...' (ToolApprovalDefaultsPanel.tsx:109-120).
- Per-tool buttons Allow, Ask, Deny; 'Always asks: destructive' tag for critical tools; 'Reset all to default' with confirmation 'Reset every tool permission?' (ToolPermissionsPanel.tsx:52-54, 64-97).
- Workspace note 'Your workspace does not allow skipping approvals.' (ToolApprovalDefaultsPanel.tsx:20).

**Journey**

1. Open Settings, Capabilities.
2. Pick a default radio; it saves at once.
3. Open a connector, Tool permissions, set a tool to Allow, Ask or Deny.
4. If the tool is critical, Allow is refused with the reason.
5. To remove saved choices press 'Reset all to default' and confirm.

**What the person sees and gets**

- Saved/failed text beside the radio group.
- A 422 critical_tool_always_asks error when Allow is saved for a critical tool (apps/web/app/api/connectors/permissions/route.ts:104-109).
- Phone alerts 'Could not update permission' and 'Could not reset permission' (ConnectorDetailScreen.tsx:523, 547).
- Approval history lists past approved and rejected tool calls on web and phone (apps/mobile/src/features/settings/tool-approvals/ApprovalHistory.tsx:14-50).

**Settings**

- Account preference namespace tool-approvals, key defaultPolicy (packages/contracts/types/src/tool-approval-policy.ts:1, 15-17).
- Workspace key allowAutonomousToolApprovals (packages/contracts/types/src/tool-approval-policy.ts:78-89).
- CLI permission_mode in the CLI config file (apps/cli/src/onboarding.rs:673-681).
- Phone Local mode: stored on the device in settingsStore (toolApprovalPolicyOwner.ts:85-86).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Account default is read fresh per request and per resume and resolved against workspace permission; an autonomous choice drops to ask-every-time when any workspace forbids it (tool-approval-policy.ts:37-70).
- An unreadable default fails closed to ask every time (tool-approval-policy.ts:63-68).
- Per-tool verdicts save with a generation bump and revoke session grants in one transaction; deletion removes one tool or the whole connector the same way (route.ts:150-165; apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:61-96).
- A standing Allow for a critical tool is refused; an older stored row stays but the tool loop still asks (connector-tool-permissions.ts:45-52, 61-80).
- Panel offers Skip approvals only when workspace permits (ToolApprovalDefaultsPanel.tsx:66-88, 124-133).
- Phone syncs the default with the account in Cloud mode and stores it on the device in Local mode (apps/mobile/src/features/settings/tool-approvals/toolApprovalPolicyOwner.ts:67, 123-150, 172-190).
- CLI stores a permission mode and honours an organization pin (apps/cli/src/onboarding.rs:948-969).

**Incomplete**

- A never-configured cloud account resolves to Skip approvals, not Ask: parseToolApprovalPolicy falls back to the web account default, which is autonomous (apps/web/shared/types/toolApprovalPolicy.ts:23-45; packages/contracts/types/src/tool-approval-policy.ts:13). Only an unreadable or invalid value falls back to ask. The panel marks Skip approvals 'Default' (ToolApprovalDefaultsPanel.tsx:91-95, 140-143). The test titled 'keeps asking as the default a never-configured account lands on' checks only DEFAULT_TOOL_APPROVAL_POLICY (packages/contracts/types/src/__tests__/tool-approval-policy.test.ts:28-30).
- The CLI and VS Code use different vocabularies (default, auto, plan; ask, auto, plan, bypass) from the three account policies; the mapping was not opened.
- The product feature matrix says CLI tool approvals are 'unverified' by its crawl (doc: docs/product/surface-feature-matrix.md:397).
- The draft's cites apps/cli/src/agent/mod.rs:1552 and apps/extension-vscode/src/features/settings/settingsProtocol.ts:76 do not hold approval-default code: they are context-file attachment and local capability types.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- S86.25 withdraw every optional grant in one action: not applicable anywhere (brief); only per-tool removal and per-connector reset exist.
- No single screen lists all saved approvals across web, desktop folders and sites; each surface lists its own.

## 4. Required behaviour

**Established requirements**

- The user can review the approvals they chose to remember and remove any of them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.23)
- The user can set the default approval posture (ask every time, auto-approve safe, autonomous) and it is enforced. (source: S86.24 (same brief))
- One action withdrawing every optional grant is not applicable. (source: S86.25 (same brief))
- The default is saved in account settings and read on each turn and on resume. (source: apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:46-70)
- If the default cannot be read, the agent asks before every action. (source: tool-approval-policy.ts:63-68)
- Skip approvals is offered only where the workspace allows it; a member cannot skip by switching workspace. (source: tool-approval-policy.ts:34-44, 72-88)
- A critical tool cannot get a standing allow; the server answers 422 critical_tool_always_asks. (source: apps/web/app/api/connectors/permissions/route.ts:104-109; connector-tool-permissions.ts:45-80)
- Removing a per-tool rule advances a generation and revokes that connector's session grants in the same transaction. (source: apps/web/app/api/connectors/permissions/route.ts:149-165)
- Approval prompts show action, target, tool, risk, scope and choices. (source: doc: docs/product/requirements.md section 9.7)

**Acceptance criteria**

1. Changing the default on web is visible on the phone in Cloud mode and applies to the next agent turn.
2. With Ask before every action, a read tool waits for approval.
3. With read-only auto-approve, a read tool runs and a write tool asks.
4. A member of a workspace that forbids Skip approvals sees that option disabled with the workspace note and the runtime acts as ask every time.
5. Setting Allow on a critical tool returns 422 critical_tool_always_asks and stores nothing.
6. Resetting a connector's permissions removes its saved verdicts and revokes in-conversation grants.
7. Making the default unreadable (database error) leads to approval being required.
8. A Deny verdict blocks a tool even under Skip approvals.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The cloud default of Skip approvals for a never-set account conflicts with the fail-closed principle in AGENTS.md section 6; it may be intended or not, so it needs a decision.
- [inferred] Lockdown mode (a separate panel) can force gating regardless of the policy (hostedToolRunsUnasked takes lockedDown, tool-approval-policy.ts:26-32).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether a never-configured account should start on Ask; if so change CLOUD_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY and its tests.
- [proposed] Show one 'Saved approvals' list per surface with the same wording.
- [proposed] Map CLI and VS Code modes to the three account policies in one shared table.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | tool-approval-policy contract | `packages/contracts/types/src/tool-approval-policy.ts` | Policy values, option labels, workspace rule, effective policy. |
| config | web policy parser | `apps/web/shared/types/toolApprovalPolicy.ts` | parseToolApprovalPolicy and web default. |
| service | loadToolApprovalPolicy | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Reads, resolves and fails closed; per-turn permissions. |
| service | connector-tool-permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Saves verdicts; refuses critical Allow; loads per turn. |
| service | connector-tool-session-grants | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts` | Generation and session grants. |
| endpoint | GET/PUT/DELETE /api/connectors/permissions | `apps/web/app/api/connectors/permissions/route.ts` | List, upsert, remove verdicts. |
| endpoint | GET/PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores the tool-approvals namespace and reports autonomy availability. |
| endpoint | GET /api/settings/approvals | `apps/web/app/api/settings/approvals/route.ts` | Approval history. |
| table | connector_tool_permissions | `apps/web/app/api/connectors/permissions/route.ts` | user_id, connector_id, tool_name, level, destructive. |
| table | user_settings | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Holds the stored default. |
| component | ToolApprovalDefaultsPanel | `apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx` | Radio group. |
| component | ToolPermissionsPanel | `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Per-tool Allow, Ask, Deny and reset. |
| store | tool-permissions-store | `apps/web/features/connectors/stores/tool-permissions-store.ts` | Client state and DELETE calls. |
| component | CapabilitiesSection | `apps/web/features/settings/sections/CapabilitiesSection.tsx` | Hosts the panels. |
| screen | AutoApproveScreen | `apps/mobile/app/(app)/settings/auto-approve.tsx` | Phone Action approvals screen. |
| store | toolApprovalPolicyOwner | `apps/mobile/src/features/settings/tool-approvals/toolApprovalPolicyOwner.ts` | Phone sync, local store, error and retry. |
| store | settingsStore | `apps/mobile/stores/settingsStore.ts` | Phone Local mode policy. |
| component | ApprovalHistory (phone) | `apps/mobile/src/features/settings/tool-approvals/ApprovalHistory.tsx` | Read-only history. |
| config | CLI permission mode setup | `apps/cli/src/onboarding.rs` | Mode menu and config write. |
| service | CLI permissions | `apps/cli/src/permissions.rs` | Permission modes and managed policy pin. |
| service | Chrome approvalPolicy | `apps/extension/src/features/computer-use/approvalPolicy.ts` | Always-ask reasons for browser actions. |
| test | tool-approval-policy contract test | `packages/contracts/types/src/__tests__/tool-approval-policy.test.ts` | Policies, workspace rule. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person picks a default; the page saves namespace tool-approvals to the account and optimistically updates, restoring on failure. | device and our servers | ToolApprovalDefaultsPanel.tsx:76-92 |
| On every chat turn and on resume the server reads user_settings and resolves the policy against every organization the person belongs to. | our servers | tool-approval-policy.ts:37-70 |
| Per-tool verdicts for the connector are loaded for the model if it supports tools. | our servers | tool-approval-policy.ts:93-122 |
| The tool loop runs, asks, or refuses per policy; critical tools always ask. | our servers | connector-tool-permissions.ts:45-52 (comment) and tool-approval-policy.ts:26-32 |
| Removing a verdict runs one transaction: bump generation, revoke session grants, delete rows; then an audit event. | our servers | apps/web/app/api/connectors/permissions/route.ts:149-178 |
| On the phone in Local mode the choice is stored on the device and no server call is made. | device | toolApprovalPolicyOwner.ts:67, 85-86, 147-148 |
| In the CLI the mode is written to the local config file. | device | apps/cli/src/onboarding.rs:673-681 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Account default policy | user_settings.settings['tool-approvals'].defaultPolicy | Account-wide for web and phone Cloud mode | Kept until changed |
| Per-tool verdicts | table connector_tool_permissions | Account-wide | Deleted by reset, by tool removal and on connector disconnect |
| Session grants | connector tool session-grant store (per conversation) | Server | Revoked on any verdict change |
| Phone Local policy | store:settingsStore on the device | No | Until app data is cleared |
| CLI permission mode | CLI config file (permission_mode) | No | Until edited |

**Models and providers.** The policy applies whichever model answers. A model that cannot call tools has no connector verdicts to apply, but the policy still decides whether provider-native web search is withdrawn in favour of the gated function form (tool-approval-policy.ts:90-92, 93-122). Provider names are not involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud policy needs a signed-in account; phone Local mode and CLI keep local choices without one (toolApprovalPolicyOwner.ts:147-150). |
| Permissions | Workspace owner or admin sets allowAutonomousToolApprovals in organization metadata; members cannot change it (tool-approval-policy.ts:34-44; packages/contracts/types/src/tool-approval-policy.ts:78-89). CLI honours an organization policy pin. |
| Subscription | none found in the code for the approval default or per-tool verdicts. |
| Limits and metering | Rate limit bucket chat-conversation on the permission routes (route.ts). Connector tool capacity limits exist elsewhere. |
| Feature flags | none found in the code for this feature; Lockdown mode is a separate panel. |
| Model compatibility | Applies to all models; tool-incapable models skip connector verdicts. |
| Provider restrictions | none found in the code. |
| Local mode | On the phone, Local mode uses a device-only policy and no account call. In the CLI the mode is local config. Local mode does not take the account default. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading default fails | Radios disabled; text 'Your saved default could not be loaded: ...'. | ToolApprovalDefaultsPanel.tsx:118-119, 137 |
| save fails | Previous value restored and 'Save failed: ...' shown. | ToolApprovalDefaultsPanel.tsx:84-86 |
| workspace forbids autonomy | Skip approvals disabled; runtime uses ask every time. | ToolApprovalDefaultsPanel.tsx:96-103; tool-approval-policy.ts:59-62 |
| workspace permission unreadable | Autonomy not offered. | tool-approval-policy.ts:82-87 |
| critical tool | Allow refused; shown as 'Always asks: destructive'. | ToolPermissionsPanel.tsx:94-100 |
| previously saved critical Allow | Row stays but the tool loop still asks. | connector-tool-permissions.ts:49-52 (comment) |
| phone signed out | 'Sign in to load your account approval default.' | toolApprovalPolicyOwner.ts:150 |
| phone fetch fails | Error status with retry. | toolApprovalPolicyOwner.ts:195-202 |
| reset confirmation | Cancel leaves everything; text says it cannot be undone. | ToolPermissionsPanel.tsx:52-62 |
| offline, timeout | not handled in the code beyond load and save errors | looked in ToolApprovalDefaultsPanel.tsx and toolApprovalPolicyOwner.ts; only generic error states found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/tool-approval-policy.test.ts`: Three policies, default constant, workspace permission rule, effective policy.
- `apps/web/features/settings/components/ToolApprovalDefaultsPanel.test.tsx`: Radio panel.
- `apps/web/features/settings/sections/__tests__/CapabilitiesSection.test.tsx`: Section composition.
- apps/web/app/api/connectors/permissions/__tests__/tool-approval-policy.turn-permissions.test.ts (not found) (not found): Policy and permissions per turn.
- apps/web/app/api/connectors/permissions/__tests__/documented-approval-posture.test.ts (not found) (not found): Documented approval posture.
- apps/web/app/api/connectors/permissions/__tests__/connector-tool-permissions.lockdown.test.ts (not found) (not found): Lockdown interaction.
- `apps/web/features/connectors/components/__tests__/ToolPermissionsPanel.test.tsx`: Per-tool panel.
- `apps/web/features/connectors/stores/__tests__/tool-permissions-store.test.ts`: Client store.
- `apps/mobile/__tests__/CloudToolApprovalReview.test.tsx`: Phone approval review.
- `apps/web/app/api/settings/approvals/__tests__/route.test.ts`: Approval history route.

**Test scenarios**

- **Default enforced**
  1. Set Ask before every action.
  2. Ask the agent to search through a connected connector.
  - Expected: The search waits for approval.
- **Read-only auto**
  1. Set Run read-only actions without asking.
  2. Run a read and a write.
  - Expected: Read runs; write asks.
- **Workspace blocks Skip**
  1. Set allowAutonomousToolApprovals to false on the workspace.
  2. Open Capabilities as a member.
  - Expected: Skip approvals disabled with the workspace note; agent asks.
- **Critical tool**
  1. Try to set Allow on a delete tool.
  - Expected: Refused, 422 critical_tool_always_asks.
- **Reset**
  1. Set two tools to Allow.
  2. Press Reset all to default and confirm.
  - Expected: Both rows gone; session grants revoked.
- **Fresh account default**
  1. Create a new account and open Capabilities.
  - Expected: Shows which option is applied; per code it is Skip approvals (see gaps).

**Where to look when it fails**

- Log '[tool-approvals] account default policy unavailable; requiring approval'.
- Log '[tool-approvals] workspace autonomy permission unavailable; offering approval-gated policies only'.
- Audit events connector_setting_changed with status permission_removed.
- Table connector_tool_permissions; user_settings.settings.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/086-security-and-connected-access-settings.md](../../70-qa/test-plans/web/086-security-and-connected-access-settings.md)
- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)
- Mobile: [70-qa/test-plans/mobile/086-security-and-connected-access-settings.md](../../70-qa/test-plans/mobile/086-security-and-connected-access-settings.md)
- CLI: [70-qa/test-plans/cli/086-security-and-connected-access-settings.md](../../70-qa/test-plans/cli/086-security-and-connected-access-settings.md)
- VS Code: [70-qa/test-plans/vscode/086-security-and-connected-access-settings.md](../../70-qa/test-plans/vscode/086-security-and-connected-access-settings.md)
- Chrome: [70-qa/test-plans/chrome/086-security-and-connected-access-settings.md](../../70-qa/test-plans/chrome/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **A never-configured cloud account is treated as Skip approvals, and the panel labels it Default; this conflicts with the fail-closed rule and the draft's statement that the default is Ask.** Affects: New web, Desktop and phone Cloud accounts.. Evidence: apps/web/shared/types/toolApprovalPolicy.ts:23-45; packages/contracts/types/src/tool-approval-policy.ts:13. Work needed: Product decision; if Ask is intended, change the constant and add a test for an unset account.
- **No one action withdraws every optional grant.** Affects: All surfaces.. Evidence: S86.25 brief (not applicable). Work needed: Decision on whether to build.
- **CLI, VS Code and Chrome vocabularies differ and their settings UI was not opened, so parity with the three account policies is unverified.** Affects: CLI, VS Code, Chrome.. Evidence: apps/cli/src/onboarding.rs:737-772; localRuntimeClient.ts:978. Work needed: Map and test each.
- **The phone history is read-only; removal of remembered approvals on the phone goes through connector detail only.** Affects: Phone.. Evidence: ApprovalHistory.tsx:14-50; ConnectorDetailScreen.tsx:540-547. Work needed: Confirm sufficiency against S86.23.
- **Drafted citations for CLI agent and VS Code settings protocol do not hold approval code.** Affects: Documentation accuracy.. Evidence: apps/cli/src/agent/mod.rs:1552; settingsProtocol.ts:76. Work needed: Use the corrected paths in this page.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- table:connector_tool_permissions
- table:user_settings
- store:settingsStore
- api:GET /api/connectors/permissions
- api:PUT /api/connectors/permissions
- api:DELETE /api/connectors/permissions
- F086-08
- F086-11

## Unknown

- Whether VS Code and Chrome expose an approval-default control, and how their modes map to the three policies.
- How the CLI agent applies permission_mode in the tool loop (not opened).
- Whether Desktop Electron uses the account default for local tools or only its own decisions.
- Whether the never-configured Skip approvals default is intended.
- What Lockdown mode does exactly (separate panel, not opened).
- Behaviour of approval history retention.
