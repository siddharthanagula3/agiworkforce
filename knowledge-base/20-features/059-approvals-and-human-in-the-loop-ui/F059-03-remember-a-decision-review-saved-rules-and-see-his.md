---
id: "F059-03"
type: "feature"
title: "Remember a decision, review saved rules, and see history"
aliases: ["Per-session approval (S59.03)", "Per-application permission (S59.04)", "Persistent permission settings (S59.07)", "Approval history (S59.24)", "Revoke saved permission (S59.25)", "Allow for this chat", "Always allow", "Tool permissions panel", "Approval history panel"]
area: "59 Approvals and human-in-the-loop UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S59.03", "S59.04", "S59.07", "S59.24", "S59.25"]
depends_on: ["F059-01", "F059-05", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-connectors-plugins-and-skills", "SYS-observability-and-operations", "table:connector_tool_permissions", "table:connector_tool_session_grants", "table:security_audit_logs", "store:chat-tool-allowance-store", "store:permissions.toml", "store:desktop-permissions.json"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F059-03 Remember a decision, review saved rules, and see history

After one decision the person can allow the same tool for this chat or save it for good, set Allow, Ask or Deny per connected app and tool, see past decisions and take a saved choice back. The server refuses a standing allow for critical tools. Web has two different 'for this chat' mechanisms.

Area: [59. Approvals and human-in-the-loop UI](README.md). Requirement items: [S59.03](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5903), [S59.04](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5904), [S59.07](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5907), [S59.24](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5924), [S59.25](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5925).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Remembers approvals at three levels (once, for the chat, always), stores per-tool Allow/Ask/Deny, lists past decisions and revokes saved choices (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts:272, apps/web/app/api/connectors/permissions/route.ts:131).

**Why it exists.** Asking for every repeated safe action is tiring, while some actions must always ask; the person needs control and a record (doc: docs/product/experience-contract.md section 9.3, 'Do not use one generic approval setting').

**Who uses it.** Regular users of connected apps, workspace admins, CLI users.

**Problems it solves**

- Repeated prompts for the same tool.
- No way to block one tool of a connector.
- No audit trail of what was approved.

**Use cases**

- Allow Read-only tools of a connector once for all chats, keep Write and delete tools on Ask.
- Press Allow for this chat on a mail tool for one conversation.
- Open Approval history to see what was approved yesterday.
- Reset a tool to default after changing one's mind.

## 2. User experience

**Where to find it**

- Web chat card (reviewed connector tools): 'Allow once', 'Allow for this chat', 'Always allow', 'Deny', note 'Conversation approvals last until you delete this chat or reset the tool in Settings, Connectors for this workspace.' (ToolApprovalCard.tsx:43, tool-approval-presentation.ts:25-33).
- Web plain card: 'Allow for this chat' is remembered only in the open page (apps/web/features/chat/stores/chat-tool-allowance-store.ts:10; apps/web/app/features/tools/page.tsx:149).
- Web connectors: a dialog titled '<Connector> - ...' with 'Read-only tools' and 'Write and delete tools' groups and per-tool Allow / Ask / Deny buttons, a Reset action (apps/web/features/connectors/components/ToolPermissionsPanel.tsx:56-57, :66, :246).
- Web settings: 'Tool approvals' section and 'Approval history' panel, empty text 'No tool approvals yet.' (apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:104, apps/web/features/settings/components/ApprovalHistoryPanel.tsx:36, :64).
- Mobile: chat row buttons 'Allow for this chat', 'Always allow'; Settings, Action approvals shows history 'No tool approvals yet.'; connector detail has per-tool Policy radio and 'Reset <tool> to default' (CloudToolApprovalControls.tsx:109, apps/mobile/src/features/settings/tool-approvals/ApprovalHistory.tsx:88, apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:295).
- CLI: overlay 's Allow Session' and 'a Always allow'; saved rules in permissions.toml; '/permissions' shows them (approval_overlay.rs:100-110, apps/cli/src/permissions.rs:373, apps/cli/src/tui/tui_app.rs:6127).
- VS Code: card 'Approve ... for session' and, when a saved allow is possible, 'Always allow'; command 'Show approval history' (webviewContent.ts:7035, :7220, apps/extension-vscode/src/features/permissions/approvalHistory.ts:33).
- Chrome: 'Allow for this chat' button; Options has an approval history section and approved sites with 'Remove <origin>' (apps/extension/src/features/side-panel/bubbles.ts:1019, apps/extension/src/features/options/approval-history-section.ts:31, apps/extension/src/options.ts:1452).
- Desktop (Electron): device prompt 'Allow this session' or 'Always allow'; a review list of saved grants through permission_review, revoked with permission_revoke (permissionManager.ts:299, apps/desktop/electron/runtime/dispatcher.ts:2324).

**Before you start**

- Signed in for cloud rules and history.
- A connector connected and its tools discovered for the per-tool panel (ToolPermissionsPanel.tsx:246).

**Screens and controls**

- Per-tool buttons Allow, Ask, Deny; a critical tool refuses Allow with the reason 'This tool can delete or send data that cannot be recovered, so it asks every time.' (ToolPermissionsPanel.tsx:97).
- Confirm dialogs when allowing a destructive tool for the chat or always (ToolApprovalCard.tsx:60-72, tool-approval-presentation.ts:88).

**Journey**

1. 1. A card appears; the person picks a scope.
2. 2. For a destructive tool a confirm dialog names what cannot be undone.
3. 3. The decision is sent; the server stores the grant before resuming (approve/route.ts:403).
4. 4. Later calls to that tool follow the saved verdict.
5. 5. To undo: open the connector panel, press Reset, or set Ask or Deny; the next call asks again.

**What the person sees and gets**

- History rows: tool name, approved or rejected, time, conversation link (apps/web/app/api/settings/approvals/route.ts:35-42).
- Save errors are shown on the panel; saving shows a spinner (ToolPermissionsPanel.tsx:133-136).

**Settings**

- Default policy (F059-05).
- Workspace connector policy can force Ask or Deny (connector-tool-permissions.ts:503).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Three scopes once, session, always are on the wire; the server offers session only for a rememberable connector tool in a saved chat, and always only if the tier is not critical (connector-tool-session-grants.ts:272-287; packages/contracts/cloud-contracts/src/tool-approval-resume.ts:11-16).
- A standing Allow for a critical tool is refused with CriticalStandingAllowError (HTTP 422 'critical_tool_always_asks') (connector-tool-permissions.ts:45, :78; apps/web/app/api/connectors/permissions/route.ts:106).
- At call time a critical tool asks even if an allow row exists; only a conversation grant at no lower risk lets it run (connector-tool-permissions.ts:238-248).
- Saved per-tool levels: allow, ask, deny stored as always-allow, needs-approval, blocked in connector_tool_permissions (connector-tool-permissions.ts:31-41, :80).
- Revoke: DELETE removes standing rows and session grants and advances a permission generation so stale cards cannot save (permissions/route.ts:131-168, connector-tool-permissions.ts:118).
- Workspace rules merge with member rules; the stricter wins (connector-tool-permissions.ts:503-540).
- Temporary chats ignore standing allows and cannot remember (connector-tool-permissions.ts:464-495).
- Approval history lists tool_approval_decided audit rows, newest first, 50 per page by default, up to 100 (settings/approvals/route.ts:20, :90).
- CLI saves rules to permissions.toml and refuses open-ended or multi-line rules (permissions.rs:104, :373-431, :445).
- Electron stores 'always' grants in desktop-permissions.json and keeps high-risk grants to the session (permissionManager.ts:50, permissionCore.ts:57-62).

**Incomplete**

- Web has two 'for this chat' behaviours: plain cards keep the allowance in page memory and auto-approve later calls until reload (chat-tool-allowance-store.ts:10, MessageBubble.tsx:2354); reviewed connector cards save a server grant that lasts until the chat is deleted or reset (tool-approval-presentation.ts:31).
- History shows only decisions made through the cloud approve route (approve/route.ts:631); CLI and Electron local decisions were not found in it [inferred].
- The brief cites CLI history at lib.rs:2835 and exec/tools/mod.rs:988; those lines are about hosted conversation adoption and a confirm prompt, not history. CLI history is not established.

**Present but disconnected or switched off**

- Mobile Local mode hides the history (auto-approve.tsx:129) and the composer approval control (ComposerApprovalModeControl.tsx:26).

**Not available**

- VS Code revoke for cloud saved rules: the brief lists no VS Code status for 04/25 and none was found in files read.

## 4. Required behaviour

**Established requirements**

- A session allow stops asking until the session ends. (source: S59.03)
- The user can set allow, ask or deny per connected app and per tool, and the runtime enforces it. (source: S59.04)
- Permission choices persist across sessions and devices until changed. (source: S59.07)
- The user can review a history of past approval requests and their decisions. (source: S59.24)
- The user can revoke a saved always allow (or folder or site grant) so the action asks again. (source: S59.25)
- The remembered scope differs per approval domain; do not use one generic setting. (source: doc: docs/product/experience-contract.md section 9.3)

**Acceptance criteria**

1. After Allow for this chat on a reviewed tool, the next call in that chat runs without a card; in another chat it asks.
2. Always allow is not offered for a critical tool; PUT allow for a critical tool returns 422.
3. After Reset or DELETE the next call asks.
4. A per-tool Deny blocks the call even under Skip approvals.
5. History shows the decision with tool name and time within one page load.
6. A workspace Ask or Deny wins over a member allow.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Plain cards should use the same server grant as reviewed cards [inferred from the two mechanisms].

**Proposed improvements** (suggestions, not requirements)

- [proposed] One 'for this chat' mechanism with the same lifetime on every card.
- [proposed] One history that also includes local CLI and Desktop decisions.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | saveConnectorToolPermissions / CriticalStandingAllowError | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | One writer of saved verdicts (lines 45, 61). |
| service | decisionTimeConnectorLevel | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Level used at call time (line 238). |
| service | withWorkspaceToolRules / withoutStandingApprovals | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Merge workspace rules; temporary chat behaviour (lines 464, 503). |
| service | toolApprovalReviewWire / planScopedToolApprovals | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts` | Which scopes a card offers and which scoped decisions are valid (lines 272, 303). |
| endpoint | /api/connectors/permissions GET PUT DELETE | `apps/web/app/api/connectors/permissions/route.ts` | List, save, revoke (lines 42, 61, 131). |
| endpoint | GET /api/settings/approvals | `apps/web/app/api/settings/approvals/route.ts` | Paged approval history from audit rows. |
| table | connector_tool_permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Standing per-tool levels (insert at line 80). |
| table | connector_tool_session_grants | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts` | Per-chat grants (query near line 55). |
| table | security_audit_logs | `apps/web/app/api/settings/approvals/route.ts` | Source of history rows (line 90). |
| component | ToolPermissionsPanel | `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Per-tool and per-category Allow/Ask/Deny, Reset (line 246). |
| component | ApprovalHistoryPanel | `apps/web/features/settings/components/ApprovalHistoryPanel.tsx` | Web history list. |
| store | chat-tool-allowance-store | `apps/web/features/chat/stores/chat-tool-allowance-store.ts` | In-memory allow for this chat on plain cards. |
| component | ToolApprovalCard | `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx` | Scope buttons and confirm dialogs. |
| component | ConnectorDetailScreen | `apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx` | Mobile per-tool policy and reset (line 295). |
| component | ApprovalHistory (mobile) | `apps/mobile/src/features/settings/tool-approvals/ApprovalHistory.tsx` | Mobile history list. |
| store | permissions.toml store | `apps/cli/src/permissions.rs` | CLI always and session allow and deny rules (lines 373, 621, 668). |
| service | permissionManager | `apps/desktop/electron/runtime/permissionManager.ts` | Electron grants, review, revoke, withdraw (lines 168, 183, 299). |
| service | showApprovalHistory | `apps/extension-vscode/src/features/permissions/approvalHistory.ts` | VS Code history quick pick from /api/settings/approvals. |
| component | approval-history-section | `apps/extension/src/features/options/approval-history-section.ts` | Chrome options history list. |
| service | approvalScope | `apps/extension-vscode/src/features/permissions/approvalScope.ts` | Identity a VS Code session approval is remembered under. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Card offers only the scopes the server reviewed; destructive tools ask for a second confirmation. | device | ToolApprovalCard.tsx:60-72, tool-approval-presentation.ts:88 |
| Decision approved-for-session or approved-always is posted with the resume request. | device | tool-approval-resume.ts:11-16, :149 |
| Server plans scoped approvals, checks the permission generation, saves the grant, rereads and confirms policy still agrees, then resumes. | our servers | approve/route.ts:355-470 |
| Each later call is gated by saved level, grants, workspace rules and the policy (tool-call-gate ranks). | our servers | tool-call-gate.ts:68-128 |
| History read pulls audit rows for the user. | our servers | settings/approvals/route.ts:84-100 |
| CLI and Electron save rules in local files; nothing is sent. | device | permissions.rs:431, permissionManager.ts:84-96 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Standing per-tool level | table connector_tool_permissions | Yes, per account, across devices | Until changed or reset (DELETE removes rows) |
| Per-chat grant | table connector_tool_session_grants | Yes | Until the chat is deleted or the tool is reset (tool-approval-presentation.ts:31) |
| Page-memory allowance | zustand store in the browser tab | No | Lost on reload |
| History | security_audit_logs | Yes | unknown |
| CLI rules | permissions.toml in the CLI config directory | No | Until edited |
| Electron grants | desktop-permissions.json in app user data (mode 0600) | No | Until revoked; high-risk grants last to app quit |

**Models and providers.** No model takes part in saving or revoking. Grants are scoped to the Managed Cloud trust boundary (connector-tool-session-grants.ts:21).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud rules and history need sign-in. CLI and Electron rules need none. |
| Permissions | Rules belong to the member; workspace rules can only tighten (connector-tool-permissions.ts:503). Only the person can answer a prompt: Electron refuses remote commands without a prior grant (permissionManager.ts:235). |
| Subscription | none found in the code for saving or reading rules. |
| Limits and metering | History page size 1 to 100 (settings/approvals/route.ts:20); rate limit class settings-activity for history and chat-conversation for rules (settings/approvals/route.ts:45, permissions/route.ts:42). |
| Feature flags | Lockdown mode denies every connector tool (connector-tool-permissions.ts:388, :626). |
| Model compatibility | none found in the code. |
| Provider restrictions | Connector tools only for server grants; built-in tools cannot be remembered (planScopedToolApprovals, connector-tool-session-grants.ts:303 region). |
| Local mode | Mobile Local: history and composer control hidden (auto-approve.tsx:129). CLI and Electron rules work offline. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Critical tool, Always allow | Not offered; PUT returns 422. | connector-tool-session-grants.ts:282, permissions/route.ts:106 |
| Permission changed after the card was shown | 409 'This tool's permissions changed after you were asked. Approve this call once, or deny it.' | connector-tool-permissions.ts:118 |
| Scope save fails | 503 'This conversation permission could not be saved. Approve this call once instead.' | approve/route.ts:403-430 |
| Temporary chat | Only 'once' is offered. | tool-loop.ts:4113-4127 |
| Reload with a plain-card allowance | Allowance lost. | chat-tool-allowance-store.ts:10 |
| Empty history | 'No tool approvals yet.' | ApprovalHistoryPanel.tsx:64 |
| History cannot load | 'Approval history could not load.' | ApprovalHistoryPanel.tsx:50 |
| Cannot read saved rules | Every connector asks or is denied (fail closed). | connector-tool-permissions.ts:626, connector-tool-session-grants.ts:55 comment |
| Offline | not handled in the code read beyond the error states above. | not handled in the code (ApprovalHistoryPanel.tsx:50 is the only error text found) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.test.ts`: Grant revocation receipts, grants kept unless workspace rules override.
- `apps/web/app/api/connectors/permissions/__tests__/route.test.ts`: Modelled revocation transaction boundaries for PUT and DELETE, category and connector scope.
- `apps/web/features/chat/components/approvals/ToolApprovalCard.test.tsx`: Parameters, raw JSON, only reviewed scopes offered, confirm before destructive allow.
- `packages/contracts/cloud-contracts/src/__tests__/tool-approval-presentation.test.ts`: Unreviewed request is once-only; caps; names tool on connector.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.permission-matrix.test.ts`: Stored policy x workspace x tool class matrix; per-tool Deny beats autonomous.
- `apps/web/e2e/qa-15-connector-permissions.spec.ts`: Browser spec for connector permissions; steps not read.
- `apps/extension-vscode/src/__tests__/approvalScope.test.ts`: Session approval is keyed on the tool, not the argument.
- `apps/desktop/electron/__tests__/permissionCore.test.ts`: Prompt when undecided, recorded grants and denials, no leak between workspaces.
- `apps/cli/src/permissions.rs`: Inline tests (45 test attributes) for rules; cases not individually read.

**Test scenarios**

- **Allow for this chat**
  1. Ask for a connector write
  2. Press Allow for this chat (confirm)
  3. Repeat the request in the same chat
  4. Repeat in a new chat
  - Expected: Second call runs unasked; new chat asks.
- **Critical tool**
  1. PUT /api/connectors/permissions level allow for a critical tool
  - Expected: 422 critical_tool_always_asks.
- **Revoke**
  1. Set Allow
  2. Press Reset in the panel
  3. Trigger the tool
  - Expected: A card appears.
- **History**
  1. Approve and deny one call each
  2. Open Settings, Approval history
  - Expected: Two rows, newest first.
- **Reload**
  1. Press Allow for this chat on a plain card
  2. Reload
  3. Trigger the tool again
  - Expected: Asks again.

**Where to look when it fails**

- Tables connector_tool_permissions, connector_tool_session_grants, security_audit_logs.
- Error names CriticalStandingAllowError, ConnectorToolPermissionStaleError, ConnectorToolPermissionChangedError.
- Log 'Scoped tool permission could not be saved' (approve/route.ts, near line 417).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md)
- Desktop: [70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md)
- Mobile: [70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md)
- CLI: [70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md)
- VS Code: [70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md)
- Chrome: [70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md)

## 10. Gaps and dependencies

- **Two different meanings of 'Allow for this chat' on web; the plain card loses it on reload.** Affects: Web and Desktop (hosted web) users. Evidence: chat-tool-allowance-store.ts:10 versus tool-approval-presentation.ts:31. Work needed: Use one server grant or relabel.
- **History covers only cloud decisions; CLI/Electron decisions not in it, and CLI history was not found.** Affects: CLI, Desktop device prompts. Evidence: approve/route.ts:631. Work needed: Add local history or state the limit.
- **VS Code has no revoke control for cloud saved rules found; brief lists none.** Affects: VS Code. Evidence: approvalHistory.ts only reads history. Work needed: Confirm and add or mark n/a.
- **Brief says Mobile 'Allow for chat' lives in MessageBubble.tsx:690/719; those lines are unrelated (sent file chips).** Affects: Brief accuracy. Evidence: apps/mobile/src/features/chat/components/MessageBubble.tsx:670-740. Work needed: Correct references.

**Depends on**

- F059-01
- F059-05
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-connectors-plugins-and-skills
- SYS-observability-and-operations
- table:connector_tool_permissions
- table:connector_tool_session_grants
- table:security_audit_logs
- store:chat-tool-allowance-store
- store:permissions.toml
- store:desktop-permissions.json

## Unknown

- CLI approval history: not found despite the brief.
- Retention of audit rows.
- Chrome revoke of Always allow on a site beyond 'Remove origin' in options.
- Whether Mobile 'Always allow' calls the same server path as web (store handler not read).
- Brief lines apps/web MessageBubble.tsx:1707/1728/1989 and tui_app.rs:3638 land on unrelated code.
