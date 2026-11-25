---
id: "F055-08"
type: "feature"
title: "Tool permissions and write approval"
aliases: ["Tool permissions", "Write approval", "Write-action settings", "Read-only mode (S55.26)", "Tool approvals", "Always asks: destructive", "Allow / Ask / Deny", "Block (Mobile label)", "agi mcp allow, ask, block, unset"]
area: "55 Connector setup and account management"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S55.26", "S55.27"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "F055-07", "F055-10", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "table:connector_tool_permissions", "api:PUT /api/connectors/permissions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-08 Tool permissions and write approval

Each tool of a connected app can be set to Allow, Ask or Deny. The server checks that setting before every connector call. Tools are grouped as Read-only tools and Write and delete tools. There is no single read-only switch. Destructive tools always ask. Mobile uses per-tool controls and the label Block.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.26](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5526), [S55.27](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5527).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores a per-tool verdict per user and applies it in the chat tool loop: a Deny verdict blocks the call, Allow runs it, Ask pauses for approval. Group rows for read-only and write tools set a default for the whole group (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:255-268, apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:68-137).

**Why it exists.** A connector can change real data. People need to say which actions run unasked, which need approval and which never run, and the server must enforce that rather than trust the client. The product requires per-tool permissions (doc: docs/product/requirements.md section 16.7).

**Who uses it.** Signed-in people with connected apps on Web, Desktop (hosted web), Mobile; CLI users for local MCP servers.

**Problems it solves**

- Unwanted automatic writes or deletes.
- Needing approval for every harmless read.
- An injected instruction making the assistant send or delete data: destructive tools cannot be set to always run, and a saved Allow still asks for them.

**Use cases**

- Deny all 'Write and delete tools' of a Gmail connector so it can only read.
- Allow read-only tools of a project tracker so searches run without prompts.
- Reset all permissions of a connector after a mistake.
- On the CLI, block one tool of a local MCP server.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): Settings, Connectors, open a connected connector, button 'Tool permissions' ('Choose when the assistant may use each of this connector's tools.') (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:96, 1242-1250). Opens a dialog titled '<name> - Tool Permissions'.
- Mobile: connector detail screen, section 'Tool permissions' ('Unset tools follow your Action approvals setting.') (apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1024).
- CLI: 'agi mcp allow|ask|block|unset <server> [tool]' for local MCP servers (apps/cli/src/lib.rs:5320-5357).
- Account default: Settings, 'Tool approvals' (apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:104).
- VS Code and Chrome: not marked.

**Before you start**

- Connector connected. Web: 'Use in chats' switch on.
- Mobile: Cloud mode active and signed in.
- Tool list: the live catalog loads from the connector; if it fails, known tools are shown.

**Screens and controls**

- Web dialog: legend Allow ('Always run without asking'), Ask ('Needs approval each time'), Deny ('Never run this tool'); a group row per category with 'Allow all', 'Ask all', 'Deny all' (read-only and write); one row per tool with three buttons; 'Always asks: destructive' text on critical tools with Allow disabled; Recent calls log; 'Reset all to default' button (apps/web/features/connectors/components/ToolPermissionsPanel.tsx:52-100, 246-404).
- Reset confirmation: 'Reset every tool permission?' with the sentence that unrecognised tools go back to asking and that the action cannot be undone; confirm label 'Reset permissions' (ToolPermissionsPanel.tsx:53-62).
- Mobile: groups 'Read-only tools' and 'Write and delete tools', each tool row has Allow, Ask, Block and a per-tool reset button; no confirmation on reset, no group buttons (ConnectorDetailScreen.tsx:91-98, 120-123, 1086-1156).
- CLI prints for example '<tool> now asks before it runs' and notes that managed rules come first (apps/cli/src/lib.rs:5337-5357).

**Journey**

1. Open the connector's tool permissions.
2. Wait for tool discovery (spinner 'Discovering connector tools').
3. Choose Allow, Ask or Deny for a tool or a group.
4. The choice is saved to the account at once; a spinner shows while saving and an error appears if it was not saved.
5. In chat the saved level is applied before the tool runs.

**What the person sees and gets**

- Pressed state on the chosen button (aria-pressed).
- Error text 'That permission was not saved, so the assistant still follows the level shown here. Try again.' (apps/web/features/connectors/stores/tool-permissions-store.ts:31-32).
- In chat: an approval request for Ask, and for Deny the tool result 'Tool is blocked by this account's connector permissions and was not executed' (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4162-4166).
- Mobile alerts 'Could not update permission' and 'Could not reset permission' (ConnectorDetailScreen.tsx:523, 547).

**Settings**

- Account default 'Tool approvals': options ask_every_time, auto_approve_read_only, autonomous (packages/contracts/types/src/tool-approval-policy.ts:3-11). The default is ask_every_time; cloud accounts default to autonomous per CLOUD_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY (line 13).
- A workspace can forbid autonomous approvals (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:29-37).
- 'Use in chats' switch per connector (useConnectorsSettingsAdapter.tsx:89).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Verdicts stored in connector_tool_permissions with levels always-allow, needs-approval, blocked, mapped to allow, ask, deny (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:25-35); API GET, PUT, DELETE at /api/connectors/permissions with CSRF, rate limit and audit event connector_setting_changed (apps/web/app/api/connectors/permissions/route.ts:42-131).
- Category rows read_only and write act as defaults for tools without their own row; an undeclared tool counts as a write tool (connector-tool-permissions.ts:255-268; tool-metadata.ts:876-904).
- The gate is a ranked table: saved Deny first; saved Allow second (with the injection-risk escalation first); saved Ask; then the account default policy; manual approval; auto (tool-call-gate.ts:68-137). A denied tool returns a blocked result and is not run (tool-loop.ts:4162-4166).
- A critical tool: Allow is refused by the API with 422 critical_tool_always_asks, a saved allow still asks at decision time, and the UI disables Allow (connector-tool-permissions.ts:45-80, 238-252; permissions/route.ts:96-105; ToolPermissionsPanel.tsx:96-98, 138-150).
- Undeclared connector tools ask under every approval policy unless the person saved Allow for them; a saved Allow on an undeclared tool is stored (test: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.permission-matrix.test.ts:190; apps/web/app/api/connectors/permissions/__tests__/route.test.ts:429).
- Each save advances a permission generation and revokes conversation grants so a card shown earlier cannot restore an older choice (connector-tool-permissions.ts:84-87, 140-215).
- Reset all calls DELETE on the server, with a confirmation through useConfirmAction (ToolPermissionsPanel.tsx:362-376, tool-permissions-store.ts:115).
- Connector permissions are loaded only when the model supports tools (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:84-99).
- Lockdown mode denies every connector tool (connector-tool-permissions.ts:388).
- Mobile edits the same account rows through the shared runtime (packages/client/client-runtime/src/connectors/runtime.ts:353-370).
- CLI: per-server and per-tool allow, ask, deny rules in a user policy file; a workspace block beats a user allow; an MCP tool with no workspace root defaults to Ask (apps/cli/src/platform/policy/engine.rs:223-260, 376-430; apps/cli/src/agent/tools.rs:76-95).

**Incomplete**

- There is no single 'read-only mode' switch. The nearest control is Deny all on the 'Write and delete tools' group (web) [inferred]. Brief S55.26 lists web and desktop done, CLI missing.
- The read-only grouping is based on built-in tool metadata only (apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:93-94), so unknown tools sit in the write group.
- Mobile labels the deny level 'Block', has per-tool controls only, and no confirmation before reset; web labels it 'Deny' (ConnectorDetailScreen.tsx:91-98).
- The draft statement 'a tool the app does not recognise defaults to Ask even if set to Allow' is not what the code does: an explicit Allow for an undeclared tool is honoured; the code asks only when no verdict is saved, or the tool is critical, or injection escalation applies.

**Present but disconnected or switched off**

- Connectors are in coming_soon state with 13 released ids (packages/contracts/types/src/connector-release.ts:12-27), so most connectors cannot be connected and have no permissions to edit.

**Not available**

- CLI: no read and write grouping and no account-level connector permissions (account connectors are only listed and disconnected) (apps/cli/src/lib.rs:7377-7408).
- VS Code and Chrome: no tool permission panel found.
- Internal Tauri desktop: no tool permission panel found in apps/desktop/src (searched by name).

## 4. Required behaviour

**Established requirements**

- A connector can be set to read-only so its write operations are blocked (S55.26). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.26)
- The user controls whether write actions run automatically, need approval, or are blocked (S55.27). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.27)
- Connectors must include per-tool permissions. (source: doc: docs/product/requirements.md section 16.7)
- Writes requiring approval cannot execute before that approval; source permissions and workspace policy apply to direct API calls too. (source: doc: docs/product/experience-contract.md W14)
- Reset is destructive and goes through the shared confirm primitive. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Setting a tool to Deny makes the next call return the blocked result and nothing runs.
2. Setting a tool to Allow lets a non-critical tool run without a prompt; the same for a group default.
3. Trying to Allow a critical tool is refused with the reason shown and the tool still asks.
4. With no saved verdict and the default policy, every connector tool asks.
5. Reset all asks first and, once confirmed, deletes the server rows so tools ask again after reload.
6. The same saved levels appear on Web and Mobile for one account.
7. An account whose workspace forbids autonomous approvals cannot get skip-approval behaviour.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Deny on the write group should be explained in the UI as read-only mode [inferred from brief S55.26 and the category rows].
- Mobile should offer group controls like the web [inferred from parity requirement, not stated in code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a one-tap 'Read only' control that sets Deny on the write group and shows it as a single state.
- [proposed] Use the same label (Deny or Block) on every surface.
- [proposed] Add confirmation to mobile per-tool reset and a reset-all.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ToolPermissionsPanel | `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Dialog with legend, group rows, tool rows, call log and Reset all. |
| store | tool-permissions-store | `apps/web/features/connectors/stores/tool-permissions-store.ts` | Zustand store; writes PUT in chunks, DELETE for reset, hydrates from server; DEFAULT_PERMISSION_LEVEL is ask (line 21). |
| hook | useConnectorCapabilities | `apps/web/features/connectors/hooks/use-connector-capabilities.ts` | Loads the tool catalog used by the panel. |
| endpoint | /api/connectors/permissions | `apps/web/app/api/connectors/permissions/route.ts` | GET list, PUT upsert (422 for critical allow), DELETE reset. |
| endpoint | /api/connectors/[connectorId]/capabilities | `apps/web/app/api/connectors/[connectorId]/capabilities/route.ts` | Returns tools with readOnly and riskTier used for grouping and critical marking (lines 93-96). |
| service | connector-tool-permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Save, load, decision-time level, session grants, lockdown and disabled-connector layers. |
| service | tool-call-gate | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | Ranked precedence table that returns allow, ask or deny. |
| service | tool-loop gate use | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Lines 4099-4166: decisionTimeLevel, gateForToolCall, blocked result message. |
| service | tool-metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Declared tool classes, risk tiers, UNKNOWN_TOOL_METADATA (line 876), policyAutoApprovesTool (line 1083). |
| service | tool-approval-policy | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Loads account default and workspace autonomy permission; loads connector permissions only for tool-capable models. |
| config | tool approval policy contract | `packages/contracts/types/src/tool-approval-policy.ts` | Policy names, labels Allow/Ask/Deny, option copy. |
| table | connector_tool_permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | User, connector, tool, level, destructive (insert at line 88). |
| table | connector_permission_generations | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Counter bumped on every change (line 124). |
| table | connector_tool_session_grants | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts` | Allow-for-this-chat grants. |
| screen | ConnectorDetailScreen permissions | `apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx` | Tool groups, PermissionRow, updatePermission (506), resetPermission (532). |
| service | connector runtime permissions | `packages/client/client-runtime/src/connectors/runtime.ts` | listToolPermissions, setToolPermission, resetToolPermission (lines 353-370). |
| command | agi mcp allow/ask/block/unset | `apps/cli/src/lib.rs` | Lines 5320-5357 write user policy rules. |
| service | CLI policy engine | `apps/cli/src/platform/policy/engine.rs` | resolve_mcp (223), set_user_mcp_rule (376), layered decision. |
| service | CLI MCP tool gate | `apps/cli/src/agent/tools.rs` | Lines 76-120: blocks on Deny, asks on Ask. |
| component | ToolApprovalDefaultsPanel | `apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx` | Account default 'Tool approvals' setting. |
| event | connector_setting_changed audit event | `apps/web/app/api/connectors/permissions/route.ts` | Records level changes. |
| test | permission matrix tests | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.permission-matrix.test.ts` | Policy, workspace and tool-class combinations. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Tool permissions; the panel fetches the connector's tool catalog and the saved verdicts. | device and our servers | apps/web/features/connectors/components/ToolPermissionsPanel.tsx:246-252; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:46-113 |
| Person picks a level; the store sends PUT /api/connectors/permissions (a category row and tool rows in chunks). | device | apps/web/features/connectors/stores/tool-permissions-store.ts:75-113 |
| Server refuses an Allow for a critical tool, otherwise advances the generation, revokes conversation grants, upserts rows and records an audit event. | our servers | apps/web/app/api/connectors/permissions/route.ts:61-131; connector-tool-permissions.ts:61-111 |
| In a chat turn the server loads the user's verdicts (only when the model can call tools) and the approval policy. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:84-120 |
| When the model calls a connector tool, the gate resolves a verdict: deny blocks, allow runs, ask pauses for an approval card. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:68-160; tool-loop.ts:4099-4166 |
| CLI: before a local MCP tool runs, the layered policy file decides; Ask opens an approval prompt on the device. | device | apps/cli/src/agent/tools.rs:76-120 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Per-tool verdicts and group defaults | table connector_tool_permissions; web also keeps a persisted client copy in the zustand store | Account level across Web and Mobile | Deleted by reset, and by disconnect |
| Permission generation counter | table connector_permission_generations | Server only | Kept |
| Conversation grants (Allow for this chat) | table connector_tool_session_grants | Server only | Revoked on every permission change for the tool |
| CLI rules | user policy file in the CLI config folder | No | Removed by agi mcp unset |

**Models and providers.** The model decides to call a tool, but the verdict does not depend on which model or provider. A model without tool support gets no connector permissions loaded (tool-approval-policy.ts:84-99). Provider routing is owned by SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required. Rows are per user. Mobile needs Cloud mode. |
| Permissions | Workspace policy can forbid autonomous approvals; workspace Deny beats user Allow in the CLI; lockdown denies all connector tools. |
| Subscription | Connectors capability: plans basic, pro, max, max_15x, team, team_premium, enterprise (packages/contracts/types/src/billing-catalog.ts:332-351). The permissions routes read no plan check [inferred from route.ts:42-131]. |
| Limits and metering | Rate limit bucket chat-conversation on the permission routes; a maximum number of tools per write (CONNECTOR_TOOL_PERMISSIONS_MAX_TOOLS_PER_WRITE). No usage metering found. |
| Feature flags | Connector release state coming_soon with 13 released ids; kill switch canUseConnectors withholds connector tools (apps/web/lib/connectors/connector-capability.ts:33). |
| Model compatibility | Applied only when the selected model supports tool calls (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:84-99). |
| Provider restrictions | none found in the code |
| Local mode | Account permissions apply to Cloud chat only. CLI local MCP rules apply on the device in any mode. Mobile shows connector permissions in Cloud mode only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading tools | Spinner 'Discovering connector tools'. | ToolPermissionsPanel.tsx:49 |
| Discovery failed, no known tools | 'Tool discovery could not be loaded.' with Retry. | ToolPermissionsPanel.tsx:50 |
| Discovery failed, known tools exist | 'Live tool discovery failed; showing known tools.' with Retry. | ToolPermissionsPanel.tsx:51 |
| Save fails | Error shown; the shown level reverts to what is saved; partial saves are explained. | tool-permissions-store.ts:31-37 |
| Critical tool | Allow disabled with reason; shows Ask; server returns 422. | ToolPermissionsPanel.tsx:96-98, 138-150; permissions/route.ts:96-105 |
| Reset cancelled | Nothing changes. | test apps/web/features/connectors/components/__tests__/ToolPermissionsPanel.test.tsx:125 |
| Permission changes after a card was shown | The old approval is refused as stale: 'This tool's permissions changed after you were asked.' | connector-tool-permissions.ts:118-124, 140-170 |
| Unattended run meets a tool that needs approval or injection escalation | Denied, because nobody can approve. | tool-call-gate.ts:150-153 |
| Mobile tool list fails | Saved permissions stay editable with fixed copy. | test apps/mobile/__tests__/ConnectorDetail.test.tsx:299 |
| Offline | not handled in the code beyond failed-save errors | searched files above |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/connectors/components/__tests__/ToolPermissionsPanel.test.tsx`: Write level, critical Allow disabled, failure notice, confirmed reset, retry.
- `apps/web/app/api/connectors/permissions/__tests__/route.test.ts`: GET, PUT mapping, derived destructive flag, critical allow 422, undeclared allow saved, DELETE, generation revocation.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.permission-matrix.test.ts`: Policy by tool class matrix, undeclared tool asks, Deny beats autonomous, critical asks even with a saved allow.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.test.ts`: Published rank table and every rank reached.
- `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.test.ts`: Conversation grants.
- `apps/mobile/__tests__/ConnectorDetail.test.tsx`: Catalog tools with permissions, update and reset exact key.
- `apps/cli/src/platform/policy/engine.rs`: Rust unit tests: MCP rule matching, server wildcard, workspace block beats user allow (lines 969-1050).

**Test scenarios**

- **Deny a write tool**
  1. Open Tool permissions for a connected connector.
  2. Press Deny on a write tool.
  3. Ask the assistant to run that action.
  - Expected: The step is blocked with the blocked message and no provider call is made.
- **Group default**
  1. Press 'Ask all' then 'Allow all' on Read-only tools.
  2. Run a read tool.
  - Expected: Read tools run without a prompt; critical tools are not changed.
- **Critical tool**
  1. Find a tool marked 'Always asks: destructive'.
  2. Try to press Allow.
  - Expected: Allow is disabled with the reason; an API PUT returns 422.
- **Reset all**
  1. Press 'Reset all to default'.
  2. Cancel, then repeat and confirm.
  - Expected: Cancel changes nothing; confirm removes server rows and all tools ask.
- **Cross-surface**
  1. Set Deny on Web.
  2. Open the same connector on Mobile.
  - Expected: Mobile shows the level as Block.
- **CLI block**
  1. Run agi mcp block <server> <tool>.
  2. Let the agent call it.
  - Expected: Output says the tool is blocked by your permission rules and was not run.

**Where to look when it fails**

- Log '[tool-approvals] account default policy unavailable; requiring approval'.
- Error names ConnectorToolPermissionChangedError and ConnectorToolPermissionStaleError.
- Tables connector_tool_permissions, connector_permission_generations, connector_tool_session_grants.
- Audit event connector_setting_changed.
- Gate reasons blocked_by_user_permission, always_allow, user_requires_approval, account_default_read_only, lethal_trifecta (tool-call-gate.ts:15-23).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/055-connector-setup-and-account-management.md](../../70-qa/test-plans/web/055-connector-setup-and-account-management.md)
- Desktop: [70-qa/test-plans/desktop/055-connector-setup-and-account-management.md](../../70-qa/test-plans/desktop/055-connector-setup-and-account-management.md)
- Mobile: [70-qa/test-plans/mobile/055-connector-setup-and-account-management.md](../../70-qa/test-plans/mobile/055-connector-setup-and-account-management.md)
- CLI: [70-qa/test-plans/cli/055-connector-setup-and-account-management.md](../../70-qa/test-plans/cli/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **No single read-only control; the brief expects a connector-level read-only mode.** Affects: Web, Desktop, Mobile, CLI. Evidence: ToolPermissionsPanel.tsx:56-57, 262-285; brief S55.26. Work needed: Add a named read-only state backed by Deny on the write group.
- **CLI has no read-only grouping or read-only mode.** Affects: CLI. Evidence: apps/cli/src/lib.rs:2126-2200 (only per-server or per-tool rules). Work needed: Add a group rule or document the gap.
- **Mobile has no group controls, no reset-all and no confirmation on reset; label differs (Block).** Affects: Mobile. Evidence: ConnectorDetailScreen.tsx:91-98, 1086-1156. Work needed: Match web behaviour.
- **Classification of read tools depends on static metadata, so unknown connector tools appear as write tools.** Affects: Custom and new connectors. Evidence: apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:93-94; tool-metadata.ts:876. Work needed: Use server-provided hints as a tightening-only input or document it.
- **Brief and draft line citations for the mobile settings (98, 481) and CLI policy (327, 350) do not match the behaviour described.** Affects: Documentation. Evidence: engine.rs:327-350 are rule helpers; mobile lines 91-98 are the option list. Work needed: Refresh citations.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- F055-07
- F055-10
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- table:connector_tool_permissions
- api:PUT /api/connectors/permissions

## Unknown

- Whether Desktop Electron adds any permission UI beyond the hosted web (only web code read).
- Whether the VS Code extension or Chrome extension exposes connector permissions (searched by name only).
- How organization-shared connectors interact with per-user verdicts (not read).
- Exact retention of the connector_tool_session_grants rows.
