---
id: "F073-08"
type: "feature"
title: "Commands, keyboard shortcuts, model and mode controls, status bar"
aliases: ["Command Palette actions", "Keyboard bindings", "Status-bar indicator", "Model picker", "Agent mode and effort controls", "Select Model", "Choose Agent Mode", "S73.17", "S73.18", "S73.19", "S73.20"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.17", "S73.18", "S73.19", "S73.20"]
depends_on: ["surface:vscode", "mode:local", "mode:own-key", "mode:cloud", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "SYS-authentication-and-identity", "file:apps/extension-vscode/src/core/statusBar.ts", "file:apps/extension-vscode/src/core/commandSetup.ts", "F073-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-08 Commands, keyboard shortcuts, model and mode controls, status bar

AGI Code in VS Code puts its actions in the Command Palette, gives common actions keyboard shortcuts, shows a bottom-right status-bar item with the model and the mode that opens the model picker, and lets the person pick model, agent mode and reasoning effort. VS Code only.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.17](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7317), [S73.18](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7318), [S73.19](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7319), [S73.20](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7320).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Provides the command, shortcut and status-bar entry points for the extension and the controls for the model, the agent permission mode and the reasoning effort.

**Why it exists.** The brief requires every action in the Command Palette (S73.17), default shortcuts for key actions (S73.18), a status-bar item showing model and mode that opens the picker (S73.19) and a way to pick model, permission mode and effort (S73.20).

**Who uses it.** Developers using AGI Code in VS Code.

**Problems it solves**

- Finding an action without a toolbar
- Seeing at a glance which model and mode are active
- Changing the model without opening the chat
- Avoiding accidental high-authority modes

**Use cases**

- Click the status-bar item, pick another model and read the scope message.
- Press the shortcut for Ask About Code in the editor.
- Run 'Code: Choose Agent Mode' and pick Plan before a risky change.
- Change agent mode in settings and approve the runtime restart.

## 2. User experience

**Where to find it**

- Command Palette: titles all start with 'Code:' (for example 'Code: Select Model', 'Code: Choose Agent Mode', 'Code: Set Agent Mode', 'Code: Set Reasoning Effort') (apps/extension-vscode/package.json:132-133, 187-188, 469-470, 474-475). The first draft said to type 'AGI Workforce'; the code shows the 'Code:' prefix and the extension display name 'AGI Code' (package.json:4).
- Status bar, right side, text like '$(hubot) AGI: <model>' or '$(hubot) AGI: <model> · <mode>' (apps/extension-vscode/src/core/statusBar.ts:3-6; apps/extension-vscode/src/extension.ts:403-412).
- Keyboard shortcuts (package.json:1485-1566), for example ctrl+shift+a opens chat, ctrl+shift+alt+g opens agent mode, ctrl+shift+alt+a asks about code, ctrl+shift+alt+x explains an error, ctrl+shift+alt+t runs a terminal command, ctrl+shift+alt+n starts a new conversation, ctrl+n starts a new conversation only when the chat is focused. On Mac the cmd key replaces ctrl.
- Settings: agiWorkforce.agent.mode (package.json:1404) and agiWorkforce.agent.effort (package.json:1428).

**Before you start**

- Extension active (activates on startup finished, package.json:41-52).
- For model choices beyond Local: a signed-in plan or own keys; locked choices offer an unlock or upgrade (apps/extension-vscode/src/core/commandSetup.ts:1302-1380).

**Screens and controls**

- Status-bar item with tooltip 'Code, click to change model' (extension.ts:405).
- Quick pick 'Code, Select Model' with placeholder 'Current: <model>' (commandSetup.ts:1319-1323).
- Quick pick 'Code, Modes' with Ask, Auto, Plan and Bypass items (commandSetup.ts:1872-1920).
- Quick pick 'Code, Effort' (commandSetup.ts:1925-1945).
- Modal 'Apply the changed agent permissions?' with button 'Restart Local Runtime' (extension.ts:313-324).

**Journey**

1. 1. The person clicks the status-bar item or runs 'Code: Select Model'.
2. 2. The picker lists models grouped for the person's plan and route; unreachable, locked or boundary-crossing choices are explained instead of switched (commandSetup.ts:1302-1366).
3. 3. If a switch would lose abilities, a modal asks 'Switch to <model>?' (commandSetup.ts:1355-1366).
4. 4. After a switch the extension says whether this chat or new chats now use the model (commandSetup.ts:1370-1378).
5. 5. For mode, the person runs 'Code: Choose Agent Mode' or edits the setting; Bypass needs a modal risk confirmation (package.json:1415-1417; apps/extension-vscode/src/features/permissions/agentModeConsent.ts:11-12).
6. 6. The status bar refreshes (extension.ts:431-471) and, if permissions changed, the restart prompt appears.

**What the person sees and gets**

- Information messages '<Code> agent mode set to: <label>' and '<Code> effort set to: <label>' (commandSetup.ts:1906-1913, 1938-1943).
- Status-bar text updates.
- Warning when the chat's trust boundary forbids the switch: 'this chat keeps its work inside one trust boundary...' (commandSetup.ts:1336-1341).
- Upgrade prompt 'This model switch requires an eligible AGI plan.' with 'Upgrade' (commandSetup.ts:1350-1359).

**Settings**

- agiWorkforce.agent.mode: ask, auto, plan, bypass; default auto; user scope (package.json:1404-1420).
- agiWorkforce.agent.effort: none to max; default medium; a composer choice for a model overrides it (package.json:1428-1448).
- agiWorkforce.model (package.json:1219).
- agiWorkforce.agent.requireShellApproval (package.json:1422-1427).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Status-bar text built from model label and mode; the mode suffix is omitted when the mode is auto, but the item itself is always shown (apps/extension-vscode/src/core/statusBar.ts:3-6; extension.ts:408-413). The first draft said it is hidden when mode is auto; that is wrong.
- Status bar refreshes on active model change, on consent reconciliation and on changes to model, plan mode, mode or effort settings (extension.ts:417-440, 460-471).
- Clicking the item runs agi-workforce.selectModel (extension.ts:404; commandSetup.ts:1302).
- Model picker with plan tiers, host model reachability, trust-boundary refusal, unlock offer, provider-switch guard and loss warning (commandSetup.ts:1302-1380).
- Mode and effort pickers with consent handling (commandSetup.ts:1872-1945; features/permissions/agentModeConsent.ts).
- Permission change restart prompt: Cancel keeps running turns; Restart stops running local turns (extension.ts:313-345).
- Command Palette hides some commands by when-clause, for example explain needs a selection, accept and reject diff need a diff, and several internal commands are hidden with when false (package.json:1052-1130 area).
- Shortcut contexts are checked by tests so every custom context key is set somewhere (apps/extension-vscode/src/__tests__/keybindingContextParity.test.ts:57-80).

**Incomplete**

- Custom 'Config.agentMode()' falls back to a deprecated planMode flag when mode is invalid (apps/extension-vscode/src/platform/config.ts:210-216), kept for compatibility.
- No in-product list of all shortcuts was found beyond the manifest [inferred].

**Present but disconnected or switched off**

- Commands with when false in the palette exist only for internal calls (package.json:1065-1130 area).

**Not available**

- Other apps have their own model and mode controls; this feature is VS Code only (brief S73.17 to S73.20).

## 4. Required behaviour

**Established requirements**

- Extension actions are available from the Command Palette. (source: S73.17)
- Key actions have default keyboard shortcuts. (source: S73.18)
- A status-bar item shows the current model and agent mode and opens the model picker. (source: S73.19)
- The user can pick the model and the agent permission mode (and effort) from the extension. (source: S73.20)
- One account has one suite entitlement on every surface; VS Code does not need its own subscription. (source: doc: docs/product/definition.md:117)
- VS Code must align with Codex and Claude IDE baselines: chat, edit and agent modes. (source: doc: docs/product/definition.md:517-518)

**Acceptance criteria**

1. Every command in package.json is registered at runtime and the reverse.
2. Status bar shows '$(hubot) AGI: <name>' in auto mode and '... · <mode>' in other modes, and is visible after activation.
3. Clicking the status bar opens 'Code, Select Model'.
4. Changing agiWorkforce.agent.mode updates the status bar without reload.
5. Changing a permission-affecting setting while a turn runs shows the restart modal, and Cancel leaves the turn running.
6. Choosing Bypass requires explicit confirmation.
7. A model on a locked tier shows an unlock or upgrade offer, never a silent switch.
8. ctrl+n starts a new conversation only while the chat view is focused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The picker should show Local models without any paid plan, because a Local tier exists in the resolver [inferred from apps/extension-vscode/src/integrations/tierResolver.ts:18-28].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the keyboard shortcuts in the model and mode pickers.
- [proposed] Show the effort in the status bar when it is not the default.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | buildExtensionStatusBarText | `apps/extension-vscode/src/core/statusBar.ts` | Builds the status-bar string from model label and mode. |
| service | Status bar item and refresh | `apps/extension-vscode/src/extension.ts` | Creates the item (403-406), updateStatusBar (408-413), configuration listeners (431-471). |
| service | Permission restart prompt | `apps/extension-vscode/src/extension.ts` | offerPermissionRuntimeRestart (313-345). |
| command | agi-workforce.selectModel | `apps/extension-vscode/src/core/commandSetup.ts` | Model picker flow (line 1302). |
| command | agi-workforce.setAgentMode / agentMode | `apps/extension-vscode/src/core/commandSetup.ts` | Mode picker (1872) and the alias command (1141). |
| command | agi-workforce.setAgentEffort | `apps/extension-vscode/src/core/commandSetup.ts` | Effort picker (line 1925). |
| service | Agent mode and effort consent | `apps/extension-vscode/src/features/permissions/agentModeConsent.ts` | Bypass and max-effort consent, reconcileAgentControlConsent (line 286). |
| service | Config accessors | `apps/extension-vscode/src/platform/config.ts` | agentMode (210) and agentEffort (217). |
| service | Model constants and display labels | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | modelDisplayLabel (line 532), picker options. |
| service | Provider switch guard | `apps/extension-vscode/src/integrations/providerSwitchGuard.ts` | guardProviderSwitch decides allow or upgrade-required. |
| service | Tier resolver | `apps/extension-vscode/src/integrations/tierResolver.ts` | Resolves the plan tier from account capability data, cached. |
| config | Commands, menus, when clauses, keybindings, settings | `apps/extension-vscode/package.json` | commandPalette when clauses (1052), keybindings (1485), settings (1219, 1404, 1428). |
| service | Chat focus context | `apps/extension-vscode/src/features/sidebar-webview/chatFocus.ts` | Sets agi-workforce.chatFocused used by ctrl+n. |
| service | Local runtime pool | `apps/extension-vscode/src/integrations/localRuntimePool.ts` | requiresPermissionRestart and restartAll. |
| test | statusbar and extension tests | `apps/extension-vscode/src/__tests__/extension.test.ts` | buildExtensionStatusBarText cases. |
| test | commandParity | `apps/extension-vscode/src/__tests__/commandParity.test.ts` | Manifest and runtime command parity. |
| test | keybindingContextParity | `apps/extension-vscode/src/__tests__/keybindingContextParity.test.ts` | When-clause contexts and zero-argument keybound commands. |
| test | agentConfigCommands | `apps/extension-vscode/src/__tests__/agentConfigCommands.test.ts` | Agent configuration commands (contents not opened). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The extension creates a right-aligned status-bar item and fills it from the active model and the configured mode. | device | apps/extension-vscode/src/extension.ts:403-413 |
| Selecting the item opens the model picker, which asks the local CLI runtime for host models and the account for the tier. | device and our servers | apps/extension-vscode/src/core/commandSetup.ts:1302-1320; readHostModels at commandSetup.ts:~430-443; tierResolver.ts imports fetchTierInfo |
| The choice is applied to this chat or to new chats by the sidebar provider. | device | commandSetup.ts:1372-1378 |
| A mode or effort change writes the VS Code setting after consent and triggers status refresh and the restart prompt. | device | extension.ts:431-441; agentModeConsent.ts:286-296 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| agent.mode and agent.effort settings | VS Code user settings (scope application) | By VS Code Settings Sync if the person enabled it; not by this product [inferred] | Until changed |
| Consent records for Bypass and max effort | VS Code global state, keyed by workspace identity (agentModeConsent.ts:14-17, 33-42) | unknown | Versioned; new consent version asks again |
| Cached tier and capability document | VS Code global state keys tierStatus.* (tierResolver.ts:44-46), cached for 300,000 ms (tierResolver.ts:53-57) | No | Refreshed on change events |

**Models and providers.** The list of models comes from the shared catalog helpers and the CLI host (commandSetup.ts:1308-1316). The picker applies provider-switch and trust-boundary rules. No model identifier is written in this page.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The picker works signed out for Local and own-key choices; Cloud models need sign-in and plan [inferred from tier resolver and unlock offer, commandSetup.ts:1342-1349]. |
| Permissions | Mode and effort are user-scope settings; a folder cannot override agent.mode, agent.effort or agent.requireShellApproval in an untrusted workspace (package.json:54-76 lists requireShellApproval; mode and effort have scope application, package.json:1417, 1435). |
| Subscription | Manual model choice can be locked by plan: 'Your plan uses Auto; upgrade ...' (ChatStateManager.ts:988-992). Managed developer access needs Premium or higher (doc: docs/product/definition.md:378-382). |
| Limits and metering | The status bar does not show usage. Usage meter exists elsewhere in the sidebar (not this feature). |
| Feature flags | none found in the code for this feature. |
| Model compatibility | Effort applies to models that support reasoning effort (package.json:1445-1447 description). |
| Provider restrictions | A chat keeps one trust boundary; switching to a model across the boundary is refused (commandSetup.ts:1336-1341). Switching providers inside a thread needs an eligible plan (providerSwitchGuard.ts:24-40). |
| Local mode | Local models appear through the CLI host list and are reachable only when running (commandSetup.ts:1308-1316, 1325-1331). The local tier is the lowest tier and is never treated as paid (apps/extension-vscode/src/__tests__/trust-boundary.test.ts:71-75). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No active workspace folder | Host models are not read (readHostModels returns undefined). | commandSetup.ts:~430-433 |
| Model unreachable | An offer explains how to reach it instead of switching. | commandSetup.ts:1328-1331 |
| User cancels a picker | Nothing changes. | commandSetup.ts:1326 |
| Restart prompt cancelled | Running turns continue with interruption and approval controls; person can restart later with 'Restart Local Runtime'. | extension.ts:318-326 |
| Restart fails | Error message 'Local runtime restart failed, ...' and surfaces refresh. | extension.ts:328-338 |
| Fork or editor without status bar support | not handled in the code beyond host API use; unknown. | not handled in the code |
| Accessibility | Status item has a tooltip text; no explicit accessibilityInformation was found on it. | extension.ts:403-406 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/extension.test.ts`: buildExtensionStatusBarText output for auto and other modes and for catalog or fixture models.
- `apps/extension-vscode/src/__tests__/commandParity.test.ts`: Every manifest command is registered and the reverse; no duplicates.
- `apps/extension-vscode/src/__tests__/keybindingContextParity.test.ts`: Custom context keys in keybinding when clauses are set; keybound commands tolerate zero arguments.
- `apps/extension-vscode/src/__tests__/diffKeybindingCommands.test.ts`: Diff accept and reject keybinding commands.
- `apps/extension-vscode/src/__tests__/trust-boundary.test.ts`: Tier ordering and that the local tier cannot reach paid features.
- `apps/extension-vscode/src/__tests__/configTrustBoundary.test.ts`: Workspace settings cannot override user-owned model and boundary settings.

**Test scenarios**

- **Status bar follows the mode**
  1. Open VS Code with the extension.
  2. Set agiWorkforce.agent.mode to plan.
  3. Set it back to auto.
  - Expected: Text shows '· plan' then drops the suffix; the item stays visible.
- **Open the model picker from the status bar**
  1. Click the status-bar item.
  - Expected: 'Code, Select Model' opens with the current model in the placeholder.
- **Permission restart**
  1. Start a long turn.
  2. Change agent mode to a different value.
  3. Choose Cancel in the modal.
  - Expected: The turn keeps running and approvals still work.
- **Locked model**
  1. Sign in on a plan that uses Auto.
  2. Pick a locked model.
  - Expected: An unlock or upgrade offer appears and the model does not change.
- **Shortcut context**
  1. Focus the chat view and press ctrl+n.
  2. Focus the editor and press ctrl+n.
  - Expected: A new conversation starts only in the first case.

**Where to look when it fails**

- Message text quoted above.
- recordFailure keys 'agent-mode-consent' and 'permission-runtime-restart' (extension.ts:342, 438).
- VS Code Developer: Toggle Keyboard Shortcuts Troubleshooting for key conflicts [inferred].

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **The first draft's claim that the status bar hides in auto mode is wrong; only the suffix hides. Docs and tests must say so.** Affects: Testers. Evidence: apps/extension-vscode/src/core/statusBar.ts:3-6. Work needed: Use the corrected wording.
- **The effort setting is not shown in the status bar.** Affects: VS Code users. Evidence: statusBar.ts:3-6. Work needed: Decide whether to show it.
- **No test covers the model picker flow end to end (locked, unreachable, boundary refusal).** Affects: Testers. Evidence: no test file found by name for selectModel. Work needed: Add tests for each branch.
- **Subscription gating of manual model choice is by tier name in code; whether it matches the single AGI Subscription entitlement contract was not verified.** Affects: VS Code users on paid plans. Evidence: apps/extension-vscode/src/integrations/tierResolver.ts:44-57; doc: docs/product/definition.md:117. Work needed: Trace to the shared entitlement contract.

**Depends on**

- surface:vscode
- mode:local
- mode:own-key
- mode:cloud
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- SYS-authentication-and-identity
- file:apps/extension-vscode/src/core/statusBar.ts
- file:apps/extension-vscode/src/core/commandSetup.ts
- F073-09

## Unknown

- Contents of agentConfigCommands.test.ts were not opened.
- Whether the status-bar item is always shown in forks without a chat API.
- Whether Settings Sync carries agent mode between machines.
- Exact list of palette-hidden commands beyond those read.
