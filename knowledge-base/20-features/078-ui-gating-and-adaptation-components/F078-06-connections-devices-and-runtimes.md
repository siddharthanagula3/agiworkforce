---
id: "F078-06"
type: "feature"
title: "Connections, devices and runtimes"
aliases: ["Required connection detection", "Required device detection", "Required runtime detection", "Continue on desktop", "Continue on another device", "Connector checklist", "Companion pairing status"]
area: "78 UI gating and adaptation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S78.13", "S78.14", "S78.15", "S78.20", "S78.23"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-sync-and-continuity", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-local-inference", "SYS-authentication-and-identity", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:GET /api/settings/devices", "api:GET /api/code/sessions", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F078-06 Connections, devices and runtimes

Finds out when a feature needs an account connection, a paired desktop or phone, or a runtime, says which is missing and offers a way forward. Web shows a connector checklist and a Continue on desktop link; mobile shows desktop pairing state; CLI and VS Code offer continue commands.

Area: [78. UI gating and adaptation components](README.md). Requirement items: [S78.13](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7813), [S78.14](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7814), [S78.15](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7815), [S78.20](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7820), [S78.23](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7823).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Detects a missing connector, device or runtime before the person relies on it, and gives an action to connect, pair, install or continue on another device.

**Why it exists.** Features that depend on a connector, a paired computer or a local program fail in confusing ways unless the app checks first.

**Who uses it.** People using plugins, code sessions, the phone companion, the CLI and VS Code.

**Problems it solves**

- A plugin that needs a connector fails halfway.
- A person starts work on the web that fits the desktop better.
- The CLI binary is missing in VS Code and nothing says so.

**Use cases**

- Open a plugin page and see which connectors are still not connected.
- Open the Code rail and choose 'Work with local code' to hand the session to the desktop app.
- Open the mobile companion screen and see 'Not connected' or '<desktop>, offline'.
- In the CLI run /continue-elsewhere to get the web link for the account chat.

## 2. User experience

**Where to find it**

- Web plugin page: list labelled 'Required connectors' (apps/web/app/plugins/[id]/ConnectorChecklist.tsx:20, 91).
- Web Code page: rail menu item 'Work with local code' and session menu item 'Desktop app' (apps/web/features/code/components/CodeRail.tsx:169-173; apps/web/features/code/components/CodeSessionMenu.tsx:95-100; apps/web/features/code/code-surface.ts:116, 355).
- Web Code page notices 'Your plan does not include managed environments.' (apps/web/features/code/code-surface.ts:213).
- Web browser tools dialog for the paired browser (apps/web/features/desktop-host/components/BrowserToolsDialog.tsx).
- Mobile companion screens: pairing status, 'Reconnect', 'Scan a new code' (apps/mobile/src/features/companion/components/PairingStatus.tsx; ConnectionStateViews.tsx:49-97).
- CLI: /continue-elsewhere [open], /continue-with-cloud (apps/cli/src/cloud/mod.rs:241-254; apps/cli/src/claude_parity.rs:139).
- VS Code: command 'Code: Continue in the Cloud' (apps/extension-vscode/package.json:591-595) and CLI path messages (apps/extension-vscode/src/platform/remoteEnvironment.ts:160-186).

**Before you start**

- Web paired-device check needs a signed-in account and a registered desktop device.
- CLI continue needs a Managed Cloud session saved to the account.

**Screens and controls**

- Checklist rows: 'Connected', a 'Connect' link to /connectors, or 'Checking…' (ConnectorChecklist.tsx:84-98).
- Continue link with a green dot when the desktop is online and a hover text such as '<name> is online' (apps/web/features/desktop-host/components/ContinueOnDesktop.tsx:48-72).
- Mobile 'Reconnect' and 'Scan a new code' buttons.

**Journey**

1. 1. Person opens a page or action that needs a connector, device or runtime.
2. 2. The app looks up what is connected (connectors list, devices list, local CLI probe).
3. 3. If something is missing the app names it and offers Connect, a download link, Reconnect or a command.
4. 4. For continue, the app opens a deep link or prints the web address.
5. 5. The person finishes the work on the other device.

**What the person sees and gets**

- 'Your connections could not be read just now, so this list shows what the pack needs rather than what you have already connected.' (ConnectorChecklist.tsx:19-20).
- Status text '<name> is online', 'is asleep and wakes when Desktop opens', 'is offline; open Desktop on it first' (use-paired-desktop.ts:19-23).
- CLI text 'This conversation runs in <mode> mode, so it stays on this device. Switch it to your account with /continue-with-cloud...' (cloud/mod.rs:213-216).

**Settings**

- None found for these checks.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web connector checklist lists required connectors with Connected or Connect, shows 'Checking…' while loading, and warns when the status cannot be read (ConnectorChecklist.tsx:56-98).
- When connectors are not yet released the checklist shows a locked list with 'coming soon' text instead (ConnectorChecklist.tsx:44-62, 120-125).
- Paired desktop hook fetches /api/settings/devices only when not inside the desktop app, ranks online before sleeping before offline, and returns in-desktop, no-desktop or desktop (apps/web/features/desktop-host/hooks/use-paired-desktop.ts:19-23, 52-91).
- ContinueOnDesktop renders nothing inside the desktop app, a download link when no desktop is paired, or a deep link with presence status when one is (ContinueOnDesktop.tsx:34-72).
- Deep links use the agiworkforce-cloud scheme and open a chat or code session (apps/web/features/desktop-host/lib/deep-links.ts:21-27).
- Web Code page shows deployment-disabled or plan-not-entitled notices from the sessions availability reply (apps/web/features/code/CloudCodePage.tsx:2068-2105; apps/web/app/api/code/sessions/route.ts:57-63).
- Mobile companion shows connected, stale, reconnecting, session expired, error and disconnected states, and an offline view with Reconnect and Scan a new code (PairingStatus.tsx:51-76; ConnectionStateViews.tsx:49-100).
- Mobile model rows show download and unavailable runtime states (ModelRow.tsx:75-78, 98-99).
- CLI continue-elsewhere prints the web chat address, can open it, and refuses with a reason when the chat is not an account chat (apps/cli/src/cloud/mod.rs:200-254); a desktop thread link can open a local thread in the desktop app (cloud/mod.rs:283, 300-304).
- VS Code resolves the CLI binary and reports 'was not found', 'is not executable' or a relative-path refusal (remoteEnvironment.ts:120-160, 182-186).

**Incomplete**

- Connector detection and connect-account explanation are missing on mobile, CLI and VS Code (brief S78.13, S78.20).
- Device detection is missing on CLI and VS Code (brief S78.14).
- Chrome device and continue were attributed in the brief to files that belong to the web app; no Chrome code for them found in a quick search of the side panel (apps/extension/src/side_panel.ts).

**Present but disconnected or switched off**

- Connector checklist shows 'coming soon' while the connector release state is not live (ConnectorChecklist.tsx:120-125).

**Not available**

- Mobile has no 'Continue on another device' action in the brief (S78.23).

## 4. Required behaviour

**Established requirements**

- The product detects when a feature needs an account connection that is missing and says which one. (source: brief S78.13)
- The surface detects whether a required device is available and says so before the user relies on it. (source: brief S78.14)
- The surface detects whether the needed runtime (sandbox, local model runtime, CLI) is available and gates the feature. (source: brief S78.15)
- When a feature needs an account connection, the user is told which account and given a way to connect it. (source: brief S78.20)
- When work fits another device better, the surface offers an action that continues it there. (source: brief S78.23)
- Moving a Local chat to another trust boundary is an explicit fork with consent. (source: doc: AGENTS.md §6)

**Acceptance criteria**

1. A plugin page lists every required connector and marks each Connected or Connect.
2. If the connections list cannot be read the page says so and still lists the needed connectors.
3. With an online paired desktop the Continue link shows the desktop name and online state.
4. With no paired desktop the Continue link goes to the download page, not a dead link.
5. The mobile companion shows 'Not connected' when never paired and the desktop name with 'offline' when it was.
6. In VS Code with no CLI the extension names the missing CLI path reason.
7. In the CLI a Local chat refuses /continue-elsewhere and names /continue-with-cloud.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Treating a failed devices request like 'no desktop' hides the real cause [inferred from use-paired-desktop.ts:70-73].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show 'could not check your devices' separately from 'no desktop paired'.
- [proposed] Add connector detection to mobile, CLI and VS Code where plugins or connector tools are offered.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ConnectorChecklist | `apps/web/app/plugins/[id]/ConnectorChecklist.tsx` | Required connector list and Connect links. |
| hook | useConnectors | `apps/web/features/connectors/hooks/use-connectors.ts` | Connected connector ids, loading, error. |
| hook | usePairedDesktop | `apps/web/features/desktop-host/hooks/use-paired-desktop.ts` | Finds the best paired desktop and its presence. |
| component | ContinueOnDesktop | `apps/web/features/desktop-host/components/ContinueOnDesktop.tsx` | Continue link with fallback to download. |
| service | deep-links | `apps/web/features/desktop-host/lib/deep-links.ts` | Builds and parses agiworkforce-cloud links. |
| component | CodeRail | `apps/web/features/code/components/CodeRail.tsx` | Hosts the Continue on desktop item. |
| component | CodeSessionMenu | `apps/web/features/code/components/CodeSessionMenu.tsx` | Session menu Desktop app item. |
| component | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Availability notices for managed environments. |
| endpoint | GET /api/code/sessions | `apps/web/app/api/code/sessions/route.ts` | Returns availability: deploymentEnabled, planEntitled, planTier, maxSessions. |
| endpoint | GET /api/settings/devices | `apps/web/app/api/settings/devices/route.ts` | Device list with presence; path used by the hook. |
| component | BrowserToolsDialog | `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx` | Paired browser tools dialog. |
| component | PairingStatus (mobile) | `apps/mobile/src/features/companion/components/PairingStatus.tsx` | Mobile pairing state labels. |
| component | ConnectionStateViews (mobile) | `apps/mobile/src/features/companion/components/ConnectionStateViews.tsx` | Offline and disconnected views. |
| service | CLI cloud continue | `apps/cli/src/cloud/mod.rs` | continue_elsewhere and desktop thread link. |
| command | CLI slash commands | `apps/cli/src/claude_parity.rs` | /continue-elsewhere, /continue-with-cloud, /continue-with-byok. |
| service | VS Code remote environment | `apps/extension-vscode/src/platform/remoteEnvironment.ts` | CLI resolution and probe messages. |
| config | VS Code continueInCloud command | `apps/extension-vscode/package.json` | Declares 'Code: Continue in the Cloud'. |
| schema | Host bridge contract | `packages/contracts/local-runtime/src/host-bridge.ts` | Shared handoff contract named in the brief; not opened. |
| test | ConnectorChecklist test | `apps/web/app/plugins/[id]/ConnectorChecklist.test.tsx` | Covers the checklist. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web checklist reads the person's connected connectors from the server. | our servers | apps/web/features/connectors/hooks/use-connectors.ts (named in brief S78.13); ConnectorChecklist.tsx:67 |
| Web hook fetches the device list when not inside the desktop app. | our servers | use-paired-desktop.ts:52-66 |
| Link opens a deep link; the desktop app handles it. | device | use-paired-desktop.ts:84; deep-links.ts:25-27 |
| Code sessions availability is read from the server. | our servers | apps/web/app/api/code/sessions/route.ts:57-63 |
| Mobile companion talks to the paired desktop and shows its state. | device | PairingStatus.tsx:51-76 |
| CLI finds the account chat id and prints or opens the web address. | device and our servers | apps/cli/src/cloud/mod.rs:200-254 |
| VS Code runs the CLI --version to probe the runtime. | device | remoteEnvironment.ts:126-146 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Device list and presence | Server device registry | Server is the source | unknown |
| Account chat copy used by continue | Account chat history | Yes for Managed Cloud chats only | Chat stays until deleted; deleted chats stay in Recently deleted 30 days (apps/cli/src/claude_parity.rs:462 text) |

**Models and providers.** No model is chosen here. Local and own-key CLI sessions stay on the device and cannot be continued elsewhere until moved to the account (cloud/mod.rs:213-216).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Device and connector checks need a signed-in account. |
| Permissions | The desktop opens a local thread only for a folder its owner already added; the link grants no folder access (cloud/mod.rs:262-263 comment). |
| Subscription | Managed environments need a plan that includes them (CloudCodePage.tsx:2068-2073; code-surface.ts:213). |
| Limits and metering | Maximum sandboxes per plan (apps/web/app/api/code/sessions/route.ts:46). |
| Feature flags | Connector release state gates the checklist (ConnectorChecklist.tsx:120-125). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | CLI Local and own-key chats cannot continue elsewhere (cloud/mod.rs:213-216). Web local-model selection blocks attachments and may need a folder grant on desktop. Mobile Local mode has no connector or device dependency found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connections loading | Rows show 'Checking…' | ConnectorChecklist.tsx:84-91 |
| Connections unreadable | Notice shown, list shows what the pack needs | ConnectorChecklist.tsx:69-73 |
| Inside the desktop app | Continue link not shown | ContinueOnDesktop.tsx:34 |
| No desktop paired or device request failed | Falls back to download link; failure is not told apart | use-paired-desktop.ts:63-73 |
| Desktop asleep or offline | Status text says to open Desktop first | use-paired-desktop.ts:19-23 |
| Mobile heartbeat missed | Label '<desktop>, heartbeat missed' | PairingStatus.tsx:51-56 |
| Mobile reconnecting or session expired | Animated 'Reconnecting...' or 'Session expired' | PairingStatus.tsx:57-69 |
| Sandbox deployment disabled | Notice from CODE_COPY.deploymentDisabled | CloudCodePage.tsx:2068-2072 |
| CLI binary missing in VS Code | Message names the reason and the cliPath setting | remoteEnvironment.ts:182-186 |
| Accessibility | Presence is repeated in screen-reader-only text; green dot is aria-hidden | ContinueOnDesktop.tsx:57-70 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/plugins/[id]/ConnectorChecklist.test.tsx`: Connector checklist.
- `apps/mobile/__tests__/CompanionComponents.test.tsx`: Mobile companion components.
- `apps/web/app/api/settings/devices/__tests__/route.test.ts`: Devices route.
- `apps/extension/__tests__/browser-tools-capabilities.test.ts`: Chrome browser tools capabilities.
- `packages/contracts/cloud-contracts/src/__tests__/device-capability-advertisement.test.ts`: Device capability advertisement contract.

**Test scenarios**

- **Missing connector**
  1. Open a plugin page that lists a connector you have not connected.
  - Expected: Row shows 'Connect'; pressing it goes to /connectors; after connecting the row shows 'Connected'.
- **Connections unreadable**
  1. Block the connectors request.
  2. Open the plugin page.
  - Expected: The notice appears and all required connectors are still listed.
- **Online desktop**
  1. Pair a desktop and open web Code in a browser.
  2. Open the rail menu.
  - Expected: 'Work with local code' shows the green dot and 'is online'; it opens the desktop.
- **No desktop**
  1. Use an account with no desktop.
  2. Open the same menu.
  - Expected: The item links to the download page.
- **Mobile offline desktop**
  1. Pair the phone, close the desktop app, open the companion screen.
  - Expected: '<desktop>, offline' with Reconnect and Scan a new code.
- **CLI continue**
  1. Start a Managed Cloud chat, send a message, run /continue-elsewhere.
  2. Repeat in a Local session.
  - Expected: First prints the web address; second refuses and names /continue-with-cloud.

**Where to look when it fails**

- Web network call to /api/settings/devices and the connectors list.
- Mobile PairingStatus label text.
- CLI message strings in cloud/mod.rs.
- VS Code message 'The AGI CLI at <path> <reason>'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md)
- Desktop: [70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md)
- Mobile: [70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md)
- CLI: [70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md)
- VS Code: [70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md)

## 10. Gaps and dependencies

- **Connector detection and connect-account explanation absent on mobile, CLI, VS Code and Chrome.** Affects: Those four apps. Evidence: brief S78.13, S78.20. Work needed: Add the check where connector features exist, or record not applicable.
- **Device list failure is shown as 'no desktop paired'.** Affects: Web. Evidence: use-paired-desktop.ts:70-73. Work needed: Separate error from empty.
- **Brief says the action is hidden or disabled with a reason when no device is paired; code shows a download link.** Affects: Web. Evidence: ContinueOnDesktop.tsx:36-45. Work needed: Update the requirement.
- **Device detection missing on CLI and VS Code; Chrome continue and device evidence not found in code searched.** Affects: CLI, VS Code, Chrome. Evidence: brief S78.14; side_panel.ts search. Work needed: Confirm and implement or mark n/a.
- **Mobile has no continue-on-another-device action.** Affects: Mobile. Evidence: brief S78.23 has no mobile status. Work needed: Decide if needed.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-sync-and-continuity
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-local-inference
- SYS-authentication-and-identity
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:GET /api/settings/devices
- api:GET /api/code/sessions
- mode:local
- mode:cloud

## Unknown

- How the connector list is produced on the server (useConnectors not opened).
- What the Chrome extension does for device detection and continue.
- Whether the desktop app applies the same checks natively or only the hosted web page.
- Retention of device presence records.
- Content of packages/contracts/local-runtime/src/host-bridge.ts (not opened).
