---
id: "F059-05"
type: "feature"
title: "Permission modes"
aliases: ["Permission-mode selector (S59.08)", "Read-only mode (S59.09)", "Ask-before-writing mode (S59.10)", "Automatic low-risk approval (S59.11)", "Tool approvals", "Action approvals", "ask_every_time", "auto_approve_read_only", "autonomous", "Skip approvals", "Plan mode", "Bypass permissions"]
area: "59 Approvals and human-in-the-loop UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S59.08", "S59.09", "S59.10", "S59.11"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-model-catalog-and-routing", "SYS-agents-tools-and-automation", "F059-03", "F059-06", "table:user_settings", "store:settingsStore", "surface:web", "surface:mobile", "surface:cli", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F059-05 Permission modes

One setting decides how tools run: ask before every action, run read-only actions without asking, or skip approvals. Web and Mobile cloud accounts start on Skip approvals unless a value was saved; the safe default only applies on errors or when the workspace forbids skipping. The CLI, VS Code and Chrome have their own mode lists.

Area: [59. Approvals and human-in-the-loop UI](README.md). Requirement items: [S59.08](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5908), [S59.09](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5909), [S59.10](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5910), [S59.11](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5911).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores an account-wide default policy and applies it in the tool gate, together with per-tool saved rules, workspace limits and a safety escalation (apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:68-128, packages/contracts/types/src/tool-approval-policy.ts:3-8).

**Why it exists.** People want to choose between safety and speed; the two leading assistants offer similar modes (doc: AGENTS.md section 10 says compare ChatGPT and Claude).

**Who uses it.** Every user of tools; admins who forbid skipping approvals.

**Problems it solves**

- Prompt fatigue on reads.
- Unattended runs that stall for a click.
- A member bypassing a workspace rule.

**Use cases**

- Choose 'Run read-only actions without asking' so searches run unasked and writes still ask.
- Choose 'Skip approvals' for a trusted private workspace.
- CLI: press Shift+Tab to enter Plan mode for read-only exploration.
- VS Code: set the mode to Plan, Ask, Auto or Bypass.

## 2. User experience

**Where to find it**

- Web: Settings, capabilities, section 'Tool approvals' with radio group 'Default approval for tool actions' (apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:104, :118).
- Mobile: Settings, 'Action approvals' screen with the three options, 'Recommended' tag on the first, 'Safety default' card (apps/mobile/app/(app)/settings/auto-approve.tsx:28, :46, :99); also a chat composer control with sheet 'Tool approvals' (apps/mobile/src/features/chat/components/ComposerApprovalModeControl.tsx:17).
- CLI: Shift+Tab cycles Default, Plan, Auto, Bypass permissions, Full auto; the last two appear only if the session allows them (apps/cli/src/tui/tui_app.rs:56-130).
- VS Code: mode list Plan, Ask, Auto (Edit automatically), Bypass with descriptions 'Generate a plan; no edits until approved' and 'Skip all approval prompts (dangerous)' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:66-70; packages/contracts/local-runtime/src/developer-session.ts:25).
- Chrome: Options default for approved sites: Ask, Auto, Full access, YOLO; default Auto (apps/extension/src/features/computer-use/askBeforeActing.ts:5-7, apps/extension/src/features/options/site-permission-policy.ts:11-38).
- Web connectors: per-category presets 'Read-only tools' and 'Write and delete tools' with Allow, Ask, Deny (ToolPermissionsPanel.tsx:56-57, :198-215).

**Before you start**

- Signed in for the account default on Web and Mobile cloud; the CLI and Chrome store theirs locally.

**Screens and controls**

- Labels from the shared table: 'Ask before every action' (short 'Ask'), 'Run read-only actions without asking' ('Auto'), 'Skip approvals' ('Skip') (tool-approval-policy.ts:50-75).
- Skip approvals is shown unavailable with 'Your workspace does not allow skipping approvals.' (ToolApprovalDefaultsPanel.tsx:20, :155).

**Journey**

1. 1. Open the setting.
2. 2. Pick a mode; the page saves it to the account ('Saving...', then 'Saved').
3. 3. The next turn reads the policy fresh (tool-approval-policy.ts:48) and applies it.
4. 4. If the save fails the previous choice returns and 'Save failed: ...' shows (ToolApprovalDefaultsPanel.tsx:80-84).

**What the person sees and gets**

- Status line 'Synced to your account' / 'Saving...' / 'Saved' (ToolApprovalDefaultsPanel.tsx:109-120).
- Mobile 'Approval default not in sync' with a Retry button on error (auto-approve.tsx:99-125).

**Settings**

- Preference namespace 'tool-approvals' with defaultPolicy (tool-approval-policy.ts:1).
- Workspace key allowAutonomousToolApprovals (tool-approval-policy.ts:80).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Gate: ordered ranks; a saved Deny wins, then a saved Allow, then a saved Ask, then the account policy for read-only tools, then ask in manual mode (tool-call-gate.ts:68-128).
- Ask every time: nothing is auto-approved. Read-only policy: only declared, reversible read tools without an egress path are auto-approved; device and browser command tools never are. Skip approvals: everything except destructive or unknown tools (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:1083-1100; test apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.permission-matrix.test.ts:190).
- A workspace that does not permit Skip approvals turns a stored Skip back into Ask every time, not into the read-only policy (tool-approval-policy.ts:93-100; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:48-62).
- A read of the policy that fails falls back to Ask every time (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:66).
- Lethal-trifecta escalation: untrusted content plus a private source plus an egress call asks even under Skip approvals, and denies if unattended and cannot pause (tool-call-gate.ts:78-110, :130-136).
- CLI Plan mode is a real read-only profile; Default, Auto (edits allowed), Bypass and headless modes map to profiles (apps/cli/src/permissions.rs:303-340).
- VS Code carries four developer modes; Chrome four browser modes (developer-session.ts:25, askBeforeActing.ts:5).

**Incomplete**

- No global read-only mode that refuses write, send and execute tools exists on Web: the 'read-only' policy only skips asking for reads, and per-connector 'Write and delete tools' = Deny is a manual preset (tool-metadata.ts:1083, ToolPermissionsPanel.tsx:57). CLI Plan mode is the real one; VS Code 'Plan' is plan-then-approve (webviewContent.ts:66).
- The default is inconsistent: Web and Mobile cloud use Skip approvals when nothing is saved (apps/web/shared/types/toolApprovalPolicy.ts:29, :45; apps/mobile/src/features/settings/tool-approvals/toolApprovalPolicyOwner.ts:181) while the shared constant is Ask every time (tool-approval-policy.ts:11) and Mobile tags Ask as 'Recommended' (auto-approve.tsx:28).

**Present but disconnected or switched off**

- Mobile Local mode stores a policy on the phone (toolApprovalPolicyOwner.ts:86; apps/mobile/stores/settingsStore.ts:122) but no reader outside settings code was found by search; the composer control is hidden in Local (ComposerApprovalModeControl.tsx:26).

**Not available**

- Read-only mode on Mobile (brief lists none).
- A mode switch on Desktop's device prompts: they are per capability, not per mode (permissionManager.ts:334).

## 4. Required behaviour

**Established requirements**

- The user can pick a permission mode that governs how every tool runs. (source: S59.08)
- The user can switch into a read-only mode where write, send and execute tools are refused. (source: S59.09)
- A mode lets reads run automatically but stops and asks before any write, send or execute action. (source: S59.10)
- A mode auto-approves low-risk actions while riskier actions still ask. (source: S59.11)
- If the workspace forbids skip-approvals, a stored skip choice drops to the default ask mode, not to read-only. (source: code comment tool-approval-policy.ts:89-92 and test ToolApprovalDefaultsPanel.test.tsx:84)
- Do not use one generic approval setting; domains differ. (source: doc: docs/product/experience-contract.md section 9.3)

**Acceptance criteria**

1. Under Ask every time a read tool asks.
2. Under the read-only policy a declared read tool runs unasked and a write asks.
3. Under Skip approvals a destructive or undeclared tool still asks.
4. A per-tool Deny blocks the tool under every policy.
5. With the workspace key false, a stored Skip behaves as Ask every time.
6. CLI Plan mode refuses a file write.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A new account should start on one documented default; today web shows Skip approvals as 'Default' [inferred from ToolApprovalDefaultsPanel.tsx:118-130].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Align default, label 'Recommended' and shared constant.
- [proposed] Add a true read-only mode on Web and Mobile that refuses writes.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | tool approval policy options and defaults | `packages/contracts/types/src/tool-approval-policy.ts` | Policies, labels, org key, effective policy (lines 3-100). |
| config | web account default and parser | `apps/web/shared/types/toolApprovalPolicy.ts` | WEB_ACCOUNT_DEFAULT = cloud default (lines 29, 45). |
| service | loadToolApprovalPolicy | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Reads user_settings, applies workspace rule (line 48). |
| service | policyAutoApprovesTool | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | What each policy auto-approves (line 1083). |
| service | TOOL_CALL_GATE_RANKS | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | Ordered gate table (line 68). |
| table | user_settings | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Settings row holding the tool-approvals namespace (line 54). |
| component | ToolApprovalDefaultsPanel | `apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx` | Web radio group. |
| screen | AutoApproveScreen | `apps/mobile/app/(app)/settings/auto-approve.tsx` | Mobile Action approvals screen (line 46). |
| store | toolApprovalPolicyOwner | `apps/mobile/src/features/settings/tool-approvals/toolApprovalPolicyOwner.ts` | Syncs the policy for Cloud, stores locally for Local. |
| component | ComposerApprovalModeControl | `apps/mobile/src/features/chat/components/ComposerApprovalModeControl.tsx` | Composer sheet 'Tool approvals'. |
| store | settingsStore toolApprovalPolicy | `apps/mobile/stores/settingsStore.ts` | Local policy value (lines 44, 122, 143). |
| service | permission_profile_for | `apps/cli/src/permissions.rs` | CLI mode to profile mapping (line 303). |
| service | InteractionMode | `apps/cli/src/tui/tui_app.rs` | Shift+Tab cycle (lines 63-130). |
| schema | DEVELOPER_AGENT_MODES | `packages/contracts/local-runtime/src/developer-session.ts` | VS Code and desktop developer modes (line 25). |
| component | VS Code mode options | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Mode labels and descriptions (lines 66-90). |
| config | BrowserPermissionMode | `apps/extension/src/features/computer-use/askBeforeActing.ts` | Chrome ask, auto, full, yolo (line 5). |
| component | ToolPermissionsPanel presets | `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Read-only and write category presets. |
| service | LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Lockdown denies all connector tools (line 388). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person saves the policy; page writes the 'tool-approvals' preference namespace to the account. | device and our servers | ToolApprovalDefaultsPanel.tsx:72-90 |
| Each turn and each resume reads the policy fresh from user_settings and checks every governing workspace. | our servers | tool-approval-policy.ts:37-62 |
| The tool gate combines saved level, policy, mode and escalation into allow, ask or deny. | our servers | tool-call-gate.ts:138-160 |
| CLI converts the chosen mode to a permission profile and checks tools on the device. | device | permissions.rs:303-340 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| defaultPolicy | table user_settings (namespace tool-approvals) | Yes across Web, Mobile cloud, Desktop web | Until changed |
| Workspace allowAutonomousToolApprovals | Organization policy metadata | Yes | Until changed |
| Mobile Local policy | store:settingsStore on the phone | No | Until changed |
| Chrome mode | chrome.storage.local key agi_cu_ask_before_acting | Browser profile only | Until changed |

**Models and providers.** Model choice does not change the gate. A model that cannot call tools has no connector verdicts, but the policy is still loaded because it decides whether provider-native search is replaced by the gated search tool (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:94-100 comment).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and Mobile cloud need sign-in; CLI, VS Code and Chrome modes are stored locally. |
| Permissions | Members set their own default; only a workspace admin sets allowAutonomousToolApprovals, never the member (tool-approval-policy.ts:77-80). |
| Subscription | none found in the code for choosing a mode. |
| Limits and metering | none found in the code. |
| Feature flags | Lockdown mode denies connector tools whatever the policy (connector-tool-permissions.ts:388). CLI bypass modes need the session to allow them (tui_app.rs:112). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local: the policy is kept on the phone and works without the server in the settings code (toolApprovalPolicyOwner.ts:86) but no runtime reader was found. CLI and Chrome work locally. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Mobile shows 'Loading account approval default…' and disables rows. | auto-approve.tsx:106-110 |
| Load error | Web: 'Your saved default could not be loaded'; Mobile: 'Your approval default could not be loaded. Check your connection and retry.' with Retry. | ToolApprovalDefaultsPanel.tsx:114, toolApprovalPolicyOwner.ts:200 |
| Save error | Previous value restored. | ToolApprovalDefaultsPanel.tsx:80-84 |
| Workspace forbids Skip | Option disabled and effective value is Ask every time. | ToolApprovalDefaultsPanel.tsx:96-100 |
| Policy unreadable at runtime | Ask every time. | tool-approval-policy.ts:66 (server lib) |
| Unattended run meets escalation | Denied unless the run can pause. | tool-call-gate.ts:150-155 |
| Temporary chat | Standing allows and the read-only account default do not apply; each call asks. | connector-tool-permissions.ts:455-470 |
| Accessibility | Web radiogroup with label; Mobile rows have accessibilityLabel and state. | ToolApprovalDefaultsPanel.tsx:118, auto-approve.tsx:215 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/tool-approval-policy.test.ts`: Exactly three policies; asking is the shared default; organization permission rules.
- `apps/web/features/settings/components/ToolApprovalDefaultsPanel.test.tsx`: Skip approvals shown for an unconfigured website account; saving read-only and autonomous; restore on save failure; unavailable when workspace forbids.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.test.ts`: Published precedence table, every rank reachable, verdict per rank.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.permission-matrix.test.ts`: Stored policy x workspace x tool class; undeclared tool always asks; per-tool Deny beats autonomous.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.approval-policy.test.ts`: Account-wide default policy with hosted writes.
- `apps/web/shared/types/toolApprovalPolicy.test.ts`: Web policy parsing; cases not read.
- `apps/mobile/__tests__/AutoApproveSettings.test.tsx`: Offers exactly the server's policies; selectable in Local mode without the server.
- `apps/mobile/__tests__/tool-approval-policy-owner.test.ts`: Shared GET and save admission, account and mode changes, Local versus Cloud callbacks.
- `apps/extension/__tests__/browser-approval-modes.test.ts`: Approval behaviour in Auto, Ask and Full.
- `apps/cli/src/permissions.rs`: Inline tests of profiles (for example lines 1326-1353).

**Test scenarios**

- **Fresh account default**
  1. Use an account with no saved preference
  2. Open Tool approvals
  - Expected: Skip approvals is marked Default on web; Mobile shows it selected after load but tags Ask as Recommended.
- **Read-only policy**
  1. Choose read-only
  2. Trigger a search then a write
  - Expected: Search runs unasked; write asks.
- **Workspace forbids skip**
  1. Save Skip
  2. Set allowAutonomousToolApprovals false on the workspace
  3. Trigger a read tool
  - Expected: It asks (Ask every time), not read-only behaviour.
- **CLI Plan mode**
  1. Press Shift+Tab to Plan
  2. Ask for a file edit
  - Expected: Edit refused.
- **Trifecta**
  1. Under Skip approvals read untrusted web content then call a send tool
  - Expected: A high-risk approval appears.

**Where to look when it fails**

- Warn '[tool-approvals] account default policy unavailable; requiring approval'.
- Gate reasons blocked_by_user_permission, always_allow, user_requires_approval, manual_approval_mode, auto_approval_mode, account_default_read_only, lethal_trifecta (tool-call-gate.ts:17-25).
- Table user_settings.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md)
- Desktop: [70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md)
- Mobile: [70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md)
- CLI: [70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md)
- VS Code: [70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md)
- Chrome: [70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md)

## 10. Gaps and dependencies

- **Default differs between the shared constant (Ask) and web/mobile cloud (Skip); Mobile marks Ask 'Recommended'.** Affects: Web, Desktop (hosted), Mobile cloud users. Evidence: tool-approval-policy.ts:11,13; toolApprovalPolicy.ts:29; auto-approve.tsx:28. Work needed: Decide the product default and align constants and copy.
- **No global read-only mode that refuses writes on Web, Mobile, Chrome.** Affects: Those apps. Evidence: tool-metadata.ts:1083-1100. Work needed: Add a refusing mode or relabel the policy.
- **Mobile Local policy has no runtime reader found.** Affects: Mobile Local. Evidence: search of toolApprovalPolicy in apps/mobile. Work needed: Confirm the consumer or remove the Local setting.
- **Brief code lines (request-processor.ts:3731/4573, webviewContent.ts:3549) not matched to mode code.** Affects: Brief accuracy. Evidence: webviewContent.ts:3549 is a subagents panel. Work needed: Refresh the brief.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-model-catalog-and-routing
- SYS-agents-tools-and-automation
- F059-03
- F059-06
- table:user_settings
- store:settingsStore
- surface:web
- surface:mobile
- surface:cli
- surface:chrome

## Unknown

- Whether any Mobile Local code reads the stored policy under another name.
- How Desktop (Electron) coding sessions pick DEVELOPER_AGENT_MODES (dispatcher.ts optionalAgentMode) in the UI.
- The request-processor lines the brief cites (3731, 4573) were not traced.
- Whether Chrome 'Full access' and 'YOLO' still ask before protected actions in every case (hint text says protected actions still ask).
