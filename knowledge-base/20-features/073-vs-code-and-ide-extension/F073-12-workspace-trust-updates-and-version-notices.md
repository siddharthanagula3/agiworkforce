---
id: "F073-12"
type: "feature"
title: "Workspace trust, updates and version notices"
aliases: ["Workspace trust experience", "Restricted Mode handling", "Manage Trust", "Extension update notice", "What’s new notice", "Native chat unavailable notice", "Client update required", "S73.27", "S73.29", "S73.30"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.27", "S73.29", "S73.30"]
depends_on: ["surface:vscode", "surface:cli", "mode:local", "mode:own-key", "mode:cloud", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-authorization-and-workspaces", "SYS-observability-and-operations", "SYS-api-and-contracts", "file:apps/extension-vscode/src/core/hostNotices.ts", "F073-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-12 Workspace trust, updates and version notices

In an untrusted VS Code folder AGI Code keeps the CLI runtime, file reading, commands and inline completions off and points to Manage Trust. It also announces an updated version with a What’s new link, tells forks without native chat that @agi is unavailable, and offers an update when the server rejects an old extension. VS Code only.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.27](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7327), [S73.29](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7329), [S73.30](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7330).

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

**What it does.** Limits risky features in Restricted Mode, explains why, links to VS Code's Manage Trust, announces version changes and tells the person when the editor lacks a needed feature or the extension is too old.

**Why it exists.** The brief requires limited features and a Manage Trust link in untrusted workspaces (S73.27), an update flow with what changed (S73.29) and clear messages on unsupported editor versions or forks (S73.30). Opening a repository must not run its code.

**Who uses it.** Anyone opening unknown repositories, and users of VS Code forks.

**Problems it solves**

- A cloned repository changing settings to redirect the CLI or model
- Running commands in an unreviewed folder
- Not knowing why chat does nothing in Restricted Mode
- Silent breakage after an update or on a fork

**Use cases**

- Open a downloaded repository in Restricted Mode and read why chat is disabled.
- Click Manage trust, grant trust and see the runtime start.
- After an update, click What’s new.
- Use a fork without a Chat view and read the notice once.

## 2. User experience

**Where to find it**

- Sidebar chat setup card: heading 'Review this workspace first.' with text 'AGI keeps project files and tools disabled while VS Code is in Restricted Mode.' and button 'Manage trust' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3757-3762).
- Warning messages with button 'Manage Trust' (ChatStateManager.ts:3160-3172; commandSetup.ts:536-543).
- Sessions tree item that opens trust management (apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:80-90).
- Information message '<Code> was updated to <version>.' with 'What’s new' (apps/extension-vscode/src/core/hostNotices.ts:9-20).
- Information message about missing native Chat with 'Open chat' (hostNotices.ts:25-36).
- Error block action 'update-extension' that opens the extension page (errorPresentation.ts:176-181; ChatStateManager.ts:1912-1915).

**Before you start**

- VS Code Restricted Mode for the trust path.
- Minimum editor version ^1.100.0 (package.json:16-18).

**Screens and controls**

- Setup card button 'Manage trust' sends manageWorkspaceTrust and runs workbench.trust.manage (ChatStateManager.ts:1499-1502; localRuntimeClient.ts:113).
- 'Manage Trust' button on warnings.

**Journey**

1. 1. Open a folder in Restricted Mode.
2. 2. Open the AGI Code sidebar; the setup card says to review the workspace (ChatStateManager.ts:4513-4525).
3. 3. Click 'Manage trust' and choose to trust the folder.
4. 4. The extension records the grant and refreshes surfaces (extension.ts:301-308).
5. 5. The runtime starts and chat works.
6. 6. After an extension update, the next start shows the update message once per version (hostNotices.ts:9-20).

**What the person sees and gets**

- Setup card text and warning texts such as 'This folder is in Restricted Mode, so the AGI CLI is not started here. Trust the folder to use AGI in it.' (localRuntimeClient.ts:115-121).
- Chat participant text 'Trust this workspace before starting a developer session.' (apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:335-338).
- Run command text 'command execution is disabled in untrusted workspaces...' (terminalProvider.ts:136-141).
- Update-required text 'This version of ... is older than ... now supports. Update the extension to continue.' (apps/extension-vscode/src/utils/api.ts:853-855).

**Settings**

- Settings that a folder cannot override while untrusted: apiEndpoint, cliPath, model, autoApplyFixes, memory.enabled, telemetryEnabled, activateOnStartup, useTerminal, inline completions, chatLocation, and others (package.json:54-76).
- agiWorkforce.cliPath uses only the user value when untrusted (apps/extension-vscode/src/platform/config.ts:339-343).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Manifest declares limited support and lists restrictedConfigurations; says the CLI runtime is not started and inline completions are off until trust (package.json:54-77).
- LocalRuntimeClient throws WorkspaceNotTrustedError instead of starting the CLI (localRuntimeClient.ts:115-121, 2543).
- Chat state posts 'workspace-untrusted' status and shows the setup card (ChatStateManager.ts:4459-4465, 4513-4525; webviewContent.ts:3757-3762).
- Resume of a session in an untrusted folder is refused with a Manage Trust warning (ChatStateManager.ts:2874-2876, 3160-3172).
- Editor utilities refuse to send content from an untrusted workspace (outboundContentGuard.ts:15).
- Git context and some tools check isTrusted before use (composerContext.ts:170; applyEdit.ts:53).
- A trust grant is recorded and surfaces refresh (extension.ts:301-308).
- Update notice compares the last seen version in global state with the current one; first install shows nothing (hostNotices.ts:9-20).
- Missing native Chat notice shows once and offers the sidebar (hostNotices.ts:25-36; extension.ts:426-428; chatSetup.ts:135).
- Server-forced update: an HTTP response flagged as client-update-required becomes an error with an 'update the extension' action that opens the extension page (api.ts:850-856; errorPresentation.ts:99, 176-181).

**Incomplete**

- The CLI protocol mismatch error also says 'update the extension' (localRuntimeClient.ts:2501) and so triggers the same action by text match (errorPresentation.ts:99) [inferred].
- No check for a newer extension version is made by the extension itself; VS Code's own update handles that. The first draft's 'update is needed or available' (S73.29) is met only by the post-update notice and the server-forced path (hostNotices.ts; api.ts:850-856).
- The minimum editor version is enforced by VS Code through engines; the extension adds its own message only for a missing Chat view. Messages for other missing APIs were not found.

**Present but disconnected or switched off**

- Inline completions and the CLI runtime stay off until trust is granted (package.json:55-56).

**Not available**

- Other apps use different trust models; this is the VS Code Workspace Trust experience only.

## 4. Required behaviour

**Established requirements**

- In an untrusted workspace the extension limits risky features, explains why and links to Manage Trust. (source: S73.27)
- The extension tells users when an update is needed or available and what changed, and lets them update. (source: S73.29)
- Users on an unsupported VS Code version or a fork without needed APIs are told what is incompatible. (source: S73.30)
- Security behaviour fails closed; validate at trust boundaries. (source: AGENTS.md section 6 (repository rule))
- VS Code opens one CLI process per trusted workspace. (source: doc: docs/product/definition.md:511-512)

**Acceptance criteria**

1. In Restricted Mode no CLI process starts and the sidebar shows 'Review this workspace first.' with 'Manage trust'.
2. Clicking Manage trust opens VS Code's trust editor; granting trust starts the runtime without reload.
3. A workspace setting for cliPath, model or apiEndpoint is ignored while untrusted.
4. Explain Terminal Output and Run Terminal Command refuse in Restricted Mode.
5. After installing a newer version, one message 'was updated to <version>' appears with 'What’s new'; a second start shows nothing.
6. First install shows no update message.
7. In an editor without a Chat view the missing-chat notice appears once and 'Open chat' focuses the sidebar.
8. A server response requiring a newer client shows the update-required text and an action that opens the extension page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Inline completions and runtime must also turn on after trust without a reload [inferred from onDidGrantWorkspaceTrust refresh, extension.ts:301-308].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the What’s new link point to a page for the installed version.
- [proposed] Add a check message for editors older than the supported minimum if the host does not block install.
- [proposed] Show a short Restricted Mode banner in the Context panel, which still reads files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | untrustedWorkspaces and virtualWorkspaces capabilities | `apps/extension-vscode/package.json` | Lines 54-81; restricted settings and text. |
| config | engines.vscode | `apps/extension-vscode/package.json` | Line 17; minimum ^1.100.0. |
| service | WorkspaceNotTrustedError and MANAGE_WORKSPACE_TRUST_COMMAND | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Lines 113-121; thrown at 2543 when not trusted. |
| component | Untrusted status and setup card | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | _postWorkspaceUntrusted (4513), manageWorkspaceTrust handler (1499), _rejectResume Manage Trust (3160-3172). |
| component | Setup card text and actions | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Lines 3757-3762 and 3823, 4211. |
| service | Workspace consent store and trust grant listener | `apps/extension-vscode/src/extension.ts` | Lines 121-125 and 301-308. |
| service | offerWorkspaceTrust | `apps/extension-vscode/src/core/commandSetup.ts` | Line 536; warning with Manage Trust. |
| component | Sessions tree restricted item | `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts` | Lines 80-90. |
| service | Config trust handling | `apps/extension-vscode/src/platform/config.ts` | cliPath ignores workspace values when untrusted (339-343); settings snapshot reports workspaceTrusted. |
| service | Outbound content guard | `apps/extension-vscode/src/core/outboundContentGuard.ts` | Blocks sending content from untrusted workspaces. |
| service | announceExtensionUpdate and announceMissingNativeChat | `apps/extension-vscode/src/core/hostNotices.ts` | Update and fork notices with global state keys agi.lastSeenExtensionVersion and agi.nativeChatUnavailableNoticeShown. |
| service | Extension version | `apps/extension-vscode/src/platform/version.ts` | getExtensionVersion (contents not opened). |
| service | Client update required error | `apps/extension-vscode/src/utils/api.ts` | Lines 850-856; AgiWorkforceClientUpdateRequiredError. |
| service | Error presentation update action | `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | Lines 99 and 176-181; offer('update-extension'). |
| service | Chat setup nativeChatAvailable | `apps/extension-vscode/src/core/chatSetup.ts` | Line 135. |
| test | configTrustBoundary.test | `apps/extension-vscode/src/__tests__/configTrustBoundary.test.ts` | Workspace values do not override user-owned settings. |
| test | sessionHandoffCommands.test | `apps/extension-vscode/src/__tests__/sessionHandoffCommands.test.ts` | Restricted Mode folder offers trust and starts nothing. |
| test | forkCompatibility.test | `apps/extension-vscode/src/__tests__/forkCompatibility.test.ts` | Fork compatibility, including chat focus context (contents partly seen). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| At activation the runtime pool is built with a trust check function from VS Code. | device | apps/extension-vscode/src/extension.ts:121-131 |
| When chat opens, the runtime client refuses to start in an untrusted workspace and the chat shows the setup card. | device | localRuntimeClient.ts:2543; ChatStateManager.ts:4459-4465 |
| Manage trust runs the VS Code command that opens the trust editor. | device | ChatStateManager.ts:1499-1502 |
| After trust is granted the extension records consent and refreshes the surfaces. | device | extension.ts:301-308 |
| On startup the update notice compares versions in global state and may open the release notes page in the browser. | device and our servers | hostNotices.ts:9-20 |
| A server reply meaning 'client too old' becomes an error with an update action. | our servers | apps/extension-vscode/src/utils/api.ts:850-856 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Last seen extension version | VS Code global state key agi.lastSeenExtensionVersion | No | Overwritten at each start |
| Native chat notice flag | VS Code global state key agi.nativeChatUnavailableNoticeShown | No | Kept |
| Workspace trust consent time | WorkspaceConsentStore in global state | No | unknown |

**Models and providers.** Not involved. Trust gates all routes the same way [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for trust or notices. |
| Permissions | VS Code Workspace Trust is the gate (package.json:54-77). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | Manifest 'preview' flag is true (package.json:23 area) [inferred label only]. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Restricted Mode blocks the local CLI runtime, so no Local-model chat starts until trust is granted (package.json:56; localRuntimeClient.ts:2543). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Restricted Mode | Runtime off, setup card shown, risky commands refuse. | ChatStateManager.ts:4513-4525; terminalProvider.ts:136 |
| Trust granted while open | Consent recorded and surfaces refresh. | extension.ts:301-308 |
| First install | No update message because there is no previous version. | hostNotices.ts:13-14 |
| Same version | No message. | hostNotices.ts:13-14 |
| Fork without Chat view | One-time notice; flag set before the message is shown. | hostNotices.ts:25-28 |
| Update-required reply | Not retryable; action opens the extension page. | errorPresentation.ts:176-181 |
| Offline | Update notice only needs local state; the What’s new link needs a browser. | hostNotices.ts:9-20 |
| Accessibility | Setup card is part of the webview with an Escape handler on the onboarding block; screen-reader labels not traced. | webviewContent.ts:3812-3818 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/configTrustBoundary.test.ts`: Workspace overrides ignored for user-owned settings and inline completions.
- `apps/extension-vscode/src/__tests__/sessionHandoffCommands.test.ts`: A session link in a Restricted Mode folder offers trust and starts nothing.
- `apps/extension-vscode/src/__tests__/terminalShellIntegration.test.ts`: Not trust-specific; none.
- `apps/extension-vscode/src/__tests__/forkCompatibility.test.ts`: Fork behaviour for chat focus context (partly seen).
- `apps/extension-vscode/src/__tests__/usageMeterTrustBoundary.test.ts`: Usage meter and trust boundary (not opened).

**Test scenarios**

- **Restricted Mode setup**
  1. Open a new folder in Restricted Mode.
  2. Open the AGI Code sidebar.
  - Expected: Card 'Review this workspace first.' with 'Manage trust'; no CLI process.
- **Grant trust**
  1. Click 'Manage trust'.
  2. Trust the folder.
  - Expected: Runtime status becomes ready and chat is usable.
- **Hostile workspace setting**
  1. In an untrusted folder add a workspace setting for agiWorkforce.cliPath.
  2. Check the resolved CLI.
  - Expected: The workspace value is ignored.
- **Update notice**
  1. Install an older version, start, then install a newer one.
  2. Restart.
  - Expected: One message with 'What’s new'; a further restart shows none.
- **Fork notice**
  1. Run in an editor without a Chat view.
  - Expected: One notice offering 'Open chat'.

**Where to look when it fails**

- Message texts above.
- Global state keys agi.lastSeenExtensionVersion and agi.nativeChatUnavailableNoticeShown.
- Error class names WorkspaceNotTrustedError and AgiWorkforceClientUpdateRequiredError.

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **No test found for announceExtensionUpdate or announceMissingNativeChat.** Affects: Testers. Evidence: grep for hostNotices in src/__tests__ found no match. Work needed: Add unit tests for both notices.
- **No proactive 'update available' check; S73.29 is met only after an update or on server rejection.** Affects: VS Code users on old versions. Evidence: apps/extension-vscode/src/core/hostNotices.ts:8-20; api.ts:850-856. Work needed: Decide whether VS Code's own updater is enough and document it.
- **The Context panel still reads project files in an untrusted folder.** Affects: Restricted Mode users. Evidence: apps/extension-vscode/src/data/projectInstructions.ts:18-35. Work needed: Confirm it is acceptable (display only) or gate it.
- **Brief references (webviewContent.ts:2715, ChatStateManager.ts:744, 1047) point to unrelated lines; the real code is at webviewContent.ts:3757 and ChatStateManager.ts:3160 and 4513.** Affects: Engineers using the brief. Evidence: files read. Work needed: Correct the brief.
- **No recorded run in a real Restricted Mode window.** Affects: All. Evidence: no result file found. Work needed: Run the scenarios and record them.

**Depends on**

- surface:vscode
- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-authorization-and-workspaces
- SYS-observability-and-operations
- SYS-api-and-contracts
- file:apps/extension-vscode/src/core/hostNotices.ts
- F073-11

## Unknown

- Whether any CI job runs the VS Code integration tests in Restricted Mode.
- Retention of WorkspaceConsentStore records.
- Which other editor APIs a fork may lack and whether messages exist for them.
- Contents of usageMeterTrustBoundary.test.ts and forkCompatibility.test.ts beyond the lines seen.
- What release notes page exists at the What’s new URL.
