---
id: "F102-09"
type: "feature"
title: "Editor and browser extensions"
aliases: ["Editor and browser extensions", "AGI Code (VS Code extension, display name)", "VS Code extension", "agi-workforce (extension id)", "IDE extension-host runtime (S102.20)", "IDE webview runtime (S102.21)", "AGI Extension (Chrome, manifest name)", "Chrome extension", "browser-extension background runtime (S102.22)", "browser content-script runtime (S102.23)"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.20", "S102.21", "S102.22", "S102.23"]
depends_on: ["SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "SYS-shared-ui-and-design", "surface:vscode", "surface:chrome", "surface:cli", "mode:local", "mode:own-key", "mode:cloud", "file:apps/extension/manifest.json", "file:apps/extension-vscode/package.json", "F102-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-09 Editor and browser extensions

Two separate extensions. AGI Code runs in VS Code's extension host, starts the local AGI CLI per workspace and shows its chat in a sidebar webview. AGI Extension for Chrome runs a Manifest V3 service worker and content scripts, and acts on a site only after the person approves it.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.20](../../10-requirements/capabilities/102-runtime-inventory.md#s10220), [S102.21](../../10-requirements/capabilities/102-runtime-inventory.md#s10221), [S102.22](../../10-requirements/capabilities/102-runtime-inventory.md#s10222), [S102.23](../../10-requirements/capabilities/102-runtime-inventory.md#s10223).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** VS Code: a sidebar chat (webview) plus commands, backed by a local AGI CLI runtime started by the extension (apps/extension-vscode/src/core/chatSetup.ts:60-63; src/integrations/localRuntimeClient.ts:2543-2575). Chrome: a side panel, a background service worker and content scripts that read pages and, on approved sites, click and type (apps/extension/manifest.json:3-4, 40-52).

**Why it exists.** Developers want the agent inside the editor, and browser users want it beside the page. Product order lists Chrome Extension and VS Code Extension as surfaces 4 and 6 (doc: docs/product/requirements.md:76-84).

**Who uses it.** VS Code users (workspace on disk, locally or via remote windows); Chrome users on version 132 or newer (manifest.json:minimum_chrome_version).

**Problems it solves**

- Chat and agent runs without leaving the editor.
- Act on web pages only where the person has said yes.
- Keep browser actions behind a clear approval step.

**Use cases**

- Select code in VS Code and use 'Code: Explain Selection'.
- Open the 'AGI Code' activity bar view and ask for a fix.
- In Chrome, open the side panel with Alt+Shift+K (Command+Shift+K on Mac) and ask a question about the page.
- Approve a site once and let the agent fill a form there.

## 2. User experience

**Where to find it**

- VS Code: activity bar container titled 'AGI Code' with a webview view named 'AGI Code' (apps/extension-vscode/package.json:953-971). Commands start with 'Code:' such as 'Code: Open Chat' and 'Code: Restart Local Runtime' (package.json:~140-170).
- Chrome: toolbar button 'AGI Extension' (manifest.json action default_title), side panel (manifest.json side_panel), options page, keyboard shortcut Alt+Shift+K, capture shortcut Alt+Shift+Y (manifest.json commands).
- Web, Desktop, Mobile, CLI: not this feature.

**Before you start**

- VS Code 1.100 or newer; a trusted, non-virtual workspace. In an untrusted workspace the local runtime is not started, so chat, agent runs and history are unavailable (package.json:engines, capabilities.untrustedWorkspaces, virtualWorkspaces).
- Chrome 132 or newer, not an incognito window (manifest.json: incognito not_allowed).
- Chrome: approve the site before the agent acts on it (site allow list).

**Screens and controls**

- VS Code sidebar webview with composer, model picker (locked options show a hint), agent mode and effort controls (webviewContent.ts:1-60).
- VS Code setting 'agiWorkforce.agent.requireShellApproval': ask before every shell command, default false (package.json:1422-1427).
- Chrome side panel, in-page panel, options page with a site list, welcome page on install (background.ts:7694-7699).

**Journey**

1. VS Code: 1. Open a folder. 2. The extension activates on startup or when the view opens (package.json activationEvents). 3. extension.ts creates a LocalRuntimePool (extension.ts:125-139). 4. Open the AGI Code view; the sidebar webview loads (chatSetup.ts:60-63). 5. A message starts the CLI app-server for this folder and streams results back.
2. Chrome: 1. Install; welcome page opens. 2. Open the side panel. 3. The content script asks the background for page access; features start only if the page is approved (content.ts:136-185). 4. For an action the background checks the site policy; a not-approved site raises a permission request that the person can grant (background.ts:8441-8460). 5. The agent acts and results show in the panel.

**What the person sees and gets**

- VS Code: streamed answers, approval cards, diffs, status bar, tree views for conversations, cloud tasks, schedules, projects, artifacts, connectors, memory (chatSetup.ts:44-110).
- Chrome: messages in the panel; refusals use the org's wording or 'not approved' wording (site-policy/store.ts:102-113); 'Site access was not granted. No browser action was taken.' (background.ts:8455).

**Settings**

- VS Code: many agiWorkforce.* settings, some restricted in untrusted workspaces (package.json:~48-76).
- Chrome: site allow list (storage key from background/policy), admin site policy via managed storage (site-policy/store.ts:25-60), managed schema (managed-schema.json), browser approval modes (computer-use/askBeforeActing).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- VS Code registers the sidebar webview view with retained context when hidden (chatSetup.ts:60-63).
- VS Code starts the local runtime per workspace only when the workspace is trusted, restarts on trust grant, and drops runtimes for removed folders (localRuntimeClient.ts:2543; extension.ts:347-357; localRuntimePool.ts).
- The webview page sets a strict Content-Security-Policy with nonces (webviewContent.ts:180-185).
- Chrome manifest is Manifest V3 with a module service worker (manifest.json:1, 39-42) and content scripts for all http and https pages at document idle, top frame only (manifest.json:43-52).
- Content script starts features only after the background says the page is approved (content.ts:136-185, 200-231).
- The site check: evaluateSiteAccess plus assertSiteAccess throw BrowserSitePermissionRequired when a site is not allow-listed (features/site-policy/store.ts:89-113); tool tabs are authorised through authorizeBrowserToolTab (features/browser-tools/tabAuthority.ts:67-92); the background catches it and asks the panel to request access (background.ts:8441-8460).
- One-time site grants are released on browser start and install (background.ts:7692-7699).

**Incomplete**

- The brief's pointer 'apps/extension/src/background.ts:200-215' is an import block, and 'package.json:74' is the restricted-settings list; the actual throw is store.ts:100-111 and the shell-approval setting is defined at package.json:1422-1427.
- The earlier draft said content scripts run only after approval. In fact they are injected on every http and https page; the features inside them start only after approval.

**Present but disconnected or switched off**

- VS Code is marked preview in package.json ('preview': true) and version 0.0.2; Chrome version 0.0.6 (manifest.json). Release state beyond that: unknown.

**Not available**

- Virtual workspaces are not supported in VS Code (package.json virtualWorkspaces).
- Incognito windows are not supported in Chrome (manifest.json).

## 4. Required behaviour

**Established requirements**

- The VS Code extension runs in the extension host. Platform status: done. (source: S102.20 (brief item))
- The VS Code extension renders its UI in a webview. Platform status: done. (source: S102.21 (brief item))
- The Chrome extension runs an MV3 background service worker. Platform status: done. (source: S102.22 (brief item))
- The Chrome extension runs content scripts in pages. Platform status: done. (source: S102.23 (brief item))
- VS Code registers the sidebar as a webview view with retained context. (source: S102.20/21 Should line; verified at chatSetup.ts:60-63)
- The Chrome background worker checks the site allow list before it acts and throws BrowserSitePermissionRequired when a site is not approved. (source: S102.22 Should line; verified at features/site-policy/store.ts:100-113 (not background.ts:209-215))
- Chrome extension and VS Code extension are part of one product with shared model, provider and session rules, not unrelated tools. (source: doc: docs/product/requirements.md:255-264)

**Acceptance criteria**

1. Opening the 'AGI Code' view shows the chat; hiding and showing it keeps the chat state.
2. In an untrusted workspace the local runtime does not start; granting trust starts it without reloading the window.
3. With 'agiWorkforce.agent.requireShellApproval' on, every shell command asks first.
4. On a site not in the allow list, a browser action is refused with a permission request and no click or typing occurs.
5. After the person grants the site, the same action proceeds.
6. A prerendered or hidden page does not start extension features until activated (content.ts:whenPageIsActive).
7. Chrome incognito: the extension is not available.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Both extensions must show the same plan limits as the web app because they use one subscription system [inferred from the product context and sidebar tier code].
- The Chrome service worker must survive being stopped and restarted by the browser; tests named service-worker-lifecycle.test.ts and background.reconnect.test.ts exist [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Fix the brief pointers to store.ts:100-113, tabAuthority.ts:67-92 and package.json:1422-1427.
- [proposed] Document plan gating for both extensions once read.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | VS Code manifest | `apps/extension-vscode/package.json` | Name 'AGI Code', view container and view (953-971), activation events, trust capabilities, settings (1422-1427). |
| service | activate | `apps/extension-vscode/src/extension.ts` | Boots the extension (82), creates LocalRuntimePool (125-139), trust events (347-357). |
| service | setupChat | `apps/extension-vscode/src/core/chatSetup.ts` | Registers the chat participant and sidebar webview view provider (44-63). |
| component | SidebarProvider | `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts` | WebviewViewProvider with viewId 'agi-workforce.sidebar' (31); builds the page. |
| component | getWebviewContent | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | HTML, styles, CSP and strings for the webview (1-190). |
| service | LocalRuntimeClient | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Spawns the CLI 'app-server' child for a workspace (2543-2575). |
| service | LocalRuntimePool | `apps/extension-vscode/src/integrations/localRuntimePool.ts` | One runtime per workspace folder; restart and retain (19-80). |
| service | tierResolver | `apps/extension-vscode/src/integrations/tierResolver.ts` | Resolves plan tier used for model options [inferred from name and sidebarProvider use]. |
| config | Chrome manifest | `apps/extension/manifest.json` | MV3, permissions, service worker (40), content scripts (43-52), side panel, commands, CSP. |
| service | Background service worker | `apps/extension/src/background.ts` | Message hub (1751-1754), site-permission catch (8441), startup release of one-time grants (7692-7699). |
| service | Site policy store | `apps/extension/src/features/site-policy/store.ts` | Admin policy, user allow list, evaluateSiteAccess, BrowserSitePermissionRequired (25-113). |
| service | Tab authority | `apps/extension/src/features/browser-tools/tabAuthority.ts` | authorizeBrowserToolTab and authorizeBrowserToolUrl (67-92). |
| service | Browser control consent | `apps/extension/src/features/computer-use/browserControlConsent.ts` | Per-origin consent for browser control (imported in background.ts). |
| component | Content script | `apps/extension/src/content.ts` | Page access request, in-page panel, message handler (118-231). |
| screen | Side panel | `apps/extension/src/side_panel.ts` | Chat UI in the Chrome side panel; also checks site access (7822, 10563). |
| integration | Native messaging host | `apps/extension/native-host/install.sh` | Installs the native host the manifest permits (permission nativeMessaging). |
| config | Managed policy schema | `apps/extension/managed-schema.json` | Enterprise policy shape for managed storage. |
| test | Chrome manifest and site tests | `apps/extension/__tests__` | manifest-contract, manifest-no-remote-code, site-policy-engine, site-allowlist-*, content-page-access, service-worker-lifecycle tests. |
| test | VS Code tests | `apps/extension-vscode/src/__tests__` | localRuntimePool, localRuntimeClient, trust-boundary, activationResilience, sidebarShell.webview tests (193 files). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| VS Code starts the extension, creates the sidebar and a pool of local runtimes. | device | apps/extension-vscode/src/extension.ts:82-139; core/chatSetup.ts:44-63 |
| When the workspace is trusted, the extension spawns the local AGI CLI as an 'app-server' child process for the folder and talks to it over standard streams. | device | apps/extension-vscode/src/integrations/localRuntimeClient.ts:2543-2575 [stdio is inferred from the ChildProcessWithoutNullStreams type at line 2] |
| Model calls from that CLI go to a local model server, the user's own provider key, or AGI Cloud depending on the CLI's route. | device and our servers | apps/extension-vscode/package.json:5 (description); route detail in F102-07 |
| The webview posts messages to the extension host; the host replies with state and streamed output. | device | sidebarProvider.ts:60-110; protocol/webviewMessages |
| Chrome content script asks the background for page access; the background evaluates the user allow list and the admin policy. | device | apps/extension/src/content.ts:136-185; features/site-policy/store.ts:85-113 |
| Chat in Chrome is sent to AGI's managed cloud using the signed-in account. | our servers | background.ts imports features/cloud-bridge/managedChatHandler and getManagedCloudAuthContext (lines ~150-165, 8425) [Local and own-key routes for Chrome: unknown] |
| Approved actions run in the page through the debugger and scripting permissions. | device | manifest.json permissions debugger, scripting; features/computer-use/cdpDriver |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| VS Code secrets and settings | VS Code SecretStorage, globalState, workspaceState | Not by this feature [inferred] | Managed by VS Code and user |
| Chrome site allow list and consent | chrome.storage.local (key SITE_ALLOWLIST_STORAGE_KEY in background/policy); admin policy in chrome.storage.managed or local | Local storage; admin copy may be synced by the signed-in surface (store.ts:14-24) | One-time grants are released at browser start and install (background.ts:7692-7699) |
| Conversations | Account (Cloud) or CLI session files for local runtime | Unknown | Unknown |

**Models and providers.** Neither extension fixes a model. VS Code takes model options by tier and normalises the configured model id (sidebarProvider.ts:~70-85); Chrome routes chat through a managed cloud bridge. Provider routing is described in SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | VS Code: local runtime can work with local models or own keys per its description (package.json:5); account need per route unknown. Chrome: sign-in through the managed cloud auth context (background.ts:~8425) for Cloud chat. |
| Permissions | VS Code: workspace trust required to start the runtime; consent store per workspace (extension.ts:116-139). Chrome: permissions activeTab, tabs, storage, nativeMessaging, alarms, contextMenus, sidePanel, scripting, cookies, notifications, tabGroups, debugger, downloads; optional history; optional host access for all http and https sites (manifest.json:6-30). |
| Subscription | VS Code resolves a plan tier and locks some model options with a hint (webviewContent.ts:2; sidebarProvider.ts:~85). Chrome has a test named chrome-subscription.test.ts. Exact entitlements per plan for either extension: unknown. |
| Limits and metering | Unknown for both; a usage meter test exists in VS Code (usageMeterTrustBoundary.test.ts) [inferred from name]. |
| Feature flags | VS Code: agiWorkforce.* settings including requireShellApproval and inlineCompletions.enabled (package.json:48-76, 1422). Chrome: managed policy keys (managed-schema.json). |
| Model compatibility | VS Code lists models by tier through getModelPickerOptionsForTier (webviewContent.ts:2). Chrome: not read. |
| Provider restrictions | Chrome host_permissions limit fixed hosts to localhost, 127.0.0.1, agiworkforce.com and api.agiworkforce.com; extension-page connect-src also lists a storage host and error-reporting hosts (manifest.json:30-35, CSP). |
| Local mode | VS Code can run with local models through the CLI runtime (package.json:5; CLI local servers in F102-07). Chrome: no local-inference runtime found in the code read; native messaging to the desktop exists (manifest permission) but its role in local inference is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Untrusted workspace (VS Code) | Runtime not started; chat, agent runs and history unavailable; some settings cannot be overridden by the workspace. | package.json capabilities.untrustedWorkspaces; localRuntimeClient.ts:2543 (WorkspaceNotTrustedError) |
| Trust granted (VS Code) | Records consent and refreshes runtime surfaces. | extension.ts:347-357 |
| Runtime restarting or shutting down | forWorkspace throws 'AGI local runtime is restarting; retry after restart completes'. | localRuntimePool.ts:30-35 |
| Boot failure of providers (VS Code) | Degraded provider state; code intelligence reported unavailable. | extension.ts:103-120 |
| Site not approved (Chrome) | BrowserSitePermissionRequired; the side panel is asked to request access; if declined, 'Site access was not granted. No browser action was taken.' | store.ts:100-113; background.ts:8441-8460 |
| Admin policy unreadable (Chrome) | Denies every capability everywhere until it reads cleanly. | store.ts:14-24, 53-64 |
| Prerendered page (Chrome) | Waits for activation before asking for access. | content.ts:121-134 |
| Back-forward cache restore (Chrome) | Page access is asked again on pageshow persisted. | content.ts:~226 |
| Accessibility | A test file accessibleNames.webview.test.ts exists for the VS Code webview [inferred from name]; Chrome accessibility: not read, so unknown. | apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts (file name only) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/localRuntimePool.test.ts`: Runtime pool behaviour [inferred from name].
- `apps/extension-vscode/src/__tests__/localRuntimeClient.test.ts`: Spawning and talking to the CLI runtime [inferred from name].
- `apps/extension-vscode/src/__tests__/trust-boundary.test.ts`: Trust boundary rules [inferred from name]; AGENTS.md section 6 names per-surface trust-boundary tests.
- `apps/extension-vscode/src/__tests__/activationResilience.test.ts`: Activation with failing subsystems [inferred from name].
- `apps/extension-vscode/src/__tests__/sidebarShell.webview.test.ts`: Sidebar webview shell [inferred from name].
- `apps/extension-vscode/src/__tests__/configTrustBoundary.test.ts`: Restricted settings in untrusted workspaces [inferred from name].
- `apps/extension/__tests__/manifest-contract.test.ts`: Manifest shape [inferred from name].
- `apps/extension/__tests__/site-policy-engine.test.ts`: Site policy evaluation [inferred from name].
- `apps/extension/__tests__/content-page-access.test.ts`: Content-script page access [inferred from name].
- `apps/extension/__tests__/service-worker-lifecycle.test.ts`: Service worker start and stop [inferred from name].
- `apps/extension/__tests__/browser-one-time-site-grant.test.ts`: One-time grants [inferred from name].
- `apps/extension/__tests__/tab-updated-allowlist.test.ts`: Allow list on tab navigation [inferred from name].
- `apps/extension/e2e/smoke.mjs`: Browser smoke run [inferred from name].

**Test scenarios**

- **VS Code sidebar**
  1. Open a trusted folder in VS Code.
  2. Click the 'AGI Code' activity bar icon.
  3. Send a message, hide the view and show it again.
  - Expected: Chat loads, replies stream, state survives hiding.
- **Untrusted workspace**
  1. Open a folder in restricted mode.
  2. Open the AGI Code view and send a message.
  3. Trust the folder.
  - Expected: Chat unavailable until trust is granted, then the runtime starts without a window reload.
- **Shell approval**
  1. Turn on 'agiWorkforce.agent.requireShellApproval'.
  2. Ask the agent to run a harmless command.
  - Expected: An approval card appears before the command runs.
- **Chrome unapproved site**
  1. Install the extension.
  2. Open a site not on the allow list.
  3. Ask the agent to click a button.
  - Expected: A permission request appears; no click happens until approved.
- **Chrome approve and act**
  1. Approve the site.
  2. Repeat the click request.
  - Expected: Action runs; restart Chrome and confirm one-time grants are released.
- **Chrome incognito**
  1. Try to enable the extension in incognito.
  - Expected: Not available (manifest: incognito not_allowed).

**Where to look when it fails**

- VS Code: 'Code: Check the CLI in This Environment' and 'Code: Restart Local Runtime' commands; developer output channel (chatSetup.ts registerDeveloperOutput); subsystem health (core/subsystemHealth.ts).
- Chrome: errors 'Site access was not granted...', 'The original browser site changed.', 'Tab not found.' (background.ts:8455-8460; tabAuthority.ts:70-75); logger messages 'Site access could not be reconciled'.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief pointers for S102.20-S102.23 land on imports and a settings list, not on the behaviour they describe.** Affects: Engineers using the brief.. Evidence: background.ts:200-215 is an import block; package.json:74 is in restrictedConfigurations; real code at store.ts:100-113, tabAuthority.ts:67-92, package.json:1422-1427.. Work needed: Correct the brief.
- **Plan gating, usage limits and sign-in rules for VS Code and Chrome were not established, so one-subscription-system compliance is unverified.** Affects: VS Code and Chrome users.. Evidence: Only tier lookups (sidebarProvider.ts:~85) and a test name (chrome-subscription.test.ts) were seen.. Work needed: Read tierResolver and the Chrome cloud-bridge entitlement code; document.
- **Chrome has no found Local or own-key chat route, only a managed cloud bridge.** Affects: Chrome users who want Local or own-key mode.. Evidence: background.ts imports managedChatHandler and managed auth.. Work needed: Confirm and, if intended, record that Chrome is Cloud-only.

**Depends on**

- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- SYS-shared-ui-and-design
- surface:vscode
- surface:chrome
- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- file:apps/extension/manifest.json
- file:apps/extension-vscode/package.json
- F102-07

## Unknown

- Plan gating and usage limits for both extensions.
- Whether Chrome offers Local or own-key chat.
- What the Chrome native messaging host exchanges with the desktop.
- Release state of both extensions beyond version numbers and the VS Code preview flag.
- Conversation sync and deletion rules inside the extensions.
- Contents of the listed tests (only names seen).
