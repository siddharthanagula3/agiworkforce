---
id: "F074-11"
type: "feature"
title: "Limits, recovery, updates and accounts"
aliases: ["Limits, recovery, updates and accounts", "Unsupported-page notice", "Page access unavailable", "Worker suspension recovery", "Keep-alive port", "Private windows", "S74.20", "S74.24", "S74.25", "S74.26", "S74.27", "S74.28"]
area: "74 Browser extension"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S74.20", "S74.24", "S74.25", "S74.26", "S74.27", "S74.28"]
depends_on: ["surface:chrome", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-agents-tools-and-automation", "SYS-observability-and-operations", "SYS-authentication-and-identity", "F074-07", "file:apps/extension/src/side_panel.ts", "file:apps/extension/src/background.ts", "file:apps/extension/manifest.json", "store:chrome-storage-session"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-11 Limits, recovery, updates and accounts

Covers how the Chrome extension behaves at its edges. It explains pages it cannot use and recovers chats and browser runs after Chrome stops its background worker. It does not support private windows or tell people about updates or browser differences. It has no account switcher.

Area: [74. Browser extension](README.md). Requirement items: [S74.20](../../10-requirements/capabilities/074-browser-extension.md#s7420), [S74.24](../../10-requirements/capabilities/074-browser-extension.md#s7424), [S74.25](../../10-requirements/capabilities/074-browser-extension.md#s7425), [S74.26](../../10-requirements/capabilities/074-browser-extension.md#s7426), [S74.27](../../10-requirements/capabilities/074-browser-extension.md#s7427), [S74.28](../../10-requirements/capabilities/074-browser-extension.md#s7428).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Tells the person when a page is off limits (Chrome pages, Web Store, blocked sites), keeps chats and browser tasks recoverable or clearly ended when Chrome stops the background worker, keeps the extension out of private windows, and handles first install. It leaves out update notices, private-window messages, browser comparison and an account switcher.

**Why it exists.** Chrome extensions run as short-lived workers and cannot touch some pages. The brief lists six items: account switching (not applicable), unsupported-page explanation, update notice, private-window controls, browser differences and recovery after worker suspension (doc: knowledge-base/data/area-briefs/074-browser-extension.md:97-134).

**Who uses it.** Every Chrome extension user, usually without noticing until something fails.

**Problems it solves**

- Not knowing why the extension does nothing on a page
- Lost or frozen chat streams after Chrome stops the worker
- A browser task that seems to run forever
- Confusion in private windows or after an update

**Use cases**

- Open the side panel on a Chrome settings page and see 'Page access unavailable'
- Leave the panel open for a long chat while Chrome stops the worker and have the stream resume
- Have a browser task end with a clear sentence after the worker was stopped
- Install the extension and see the welcome page

## 2. User experience

**Where to find it**

- surface:chrome: side panel chat area card titled 'Page access unavailable' with a Retry button (apps/extension/src/side_panel.ts:13710-13735).
- surface:chrome: the Computer Use tab hint 'AGI cannot act on this page. Open an ordinary website.' (computerUsePanel.ts:1650).
- surface:chrome: banner 'Browser control stopped' with the worker-stopped sentence (computerUsePanel.ts:769-835).
- surface:chrome: welcome page opened on first install (apps/extension/src/background.ts:7694-7700).
- Other apps: not part of this feature.

**Before you start**

- None for the notices. Chat recovery needs a signed-in Managed Cloud chat.

**Screens and controls**

- Blocked card text: 'You can still chat, but Chrome does not let extensions read or automate this page. That covers Chrome's own pages, the Web Store, and pages an administrator has restricted.' with button 'Retry'.
- Context button tooltip 'Page context is unavailable on this browser page' and the button disabled.
- Site you blocked: 'You blocked AGI on <host>, so it does not read or act there. Remove it from Blocked sites under Extension settings, Permissions, to use it here.' (locale key spSiteBlockedByYou).
- Recovery messages listed in feedback.

**Journey**

1. Open a restricted page: the card appears, the context button is disabled, chat still works.
2. Start a long chat: the panel opens a keep-alive port and sends a heartbeat every 20 seconds.
3. If the worker stops anyway, a cloud chat resumes from its saved run; otherwise the stream ends with an error message.
4. If a browser task was running, the panel is told on the next worker start and shows 'Chrome stopped the extension in the background, so this task ended and nothing more will happen on the page. Start the task again to continue.'
5. Press Retry on the blocked card or move to another tab to refresh the state.

**What the person sees and gets**

- 'The extension service restarted before the run was saved.' when no saved run exists (side_panel.ts:6925-6935).
- 'No AGI Cloud activity was received for 90 seconds.' after inactivity (side_panel.ts:6985-6992).
- 'The background service stopped reporting on this run, so it is no longer being tracked here.' (computerUsePanel.ts:1020-1040).
- Welcome page on install only.

**Settings**

- Blocked sites and approved sites under Options, Permissions (they change the notices).
- None for updates, private windows or browser differences.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Unsupported page explanation (S74.25): restricted prefixes chrome://, chrome-extension://, chrome-untrusted://, devtools://, edge://, about:, data:, file:///, view-source:, the Web Store addresses are treated as blocked; the card shows, the context button is disabled, and chat stays available because the surface policy keeps chat true (apps/extension/src/features/side-panel/surface-policy.ts:20-45; side_panel.ts:10824-10856, 13710-13735). The first draft said the input is disabled; it is disabled only when the managed chat state is not 'ready'.
- The card text mentions pages an administrator restricted, but isRestrictedPageUrl tests address prefixes only; administrator policy is handled elsewhere in site policy (surface-policy.ts:36-45) [inferred].
- Chat recovery (S74.28): the panel opens a port named by the client instance and sends MANAGED_CHAT_KEEPALIVE every 20 seconds while streaming; if the port drops during a cloud run with a saved run reference the run resumes, otherwise the stream ends with the restart message (side_panel.ts:6905-6990; background.ts:1857-1880).
- Browser run recovery (S74.28): a marker written when a run starts is found on the next worker start; the worker stops the page input watch, detaches the debugger, ungroups the tab, and announces an error state with reason worker_restarted; the panel shows the sentence above (apps/extension/src/features/computer-use/runMarker.ts:100-130; background.ts:9219-9236; computerUsePanel.ts:826-830). The panel also checks after 90 seconds of silence and adopts a live run on reopen.
- Native desktop link recovery: the give-up flag is kept in session storage across worker restarts (background.ts:1462-1472).
- Private windows (S74.26, manifest only): manifest sets incognito to not_allowed (apps/extension/manifest.json:9), tested in manifest-contract.test.ts:64-65 ('disallows incognito because Chrome local storage is shared across profiles'); the worker's tab list drops incognito tabs (background.ts:4668). With not_allowed Chrome should not run the extension in private windows [inferred from Chrome behaviour, not verified here].
- First install (part of S74.24 area): onInstalled opens a welcome page when reason is install (background.ts:7694-7700).

**Incomplete**

- Update notice (S74.24): onInstalled handles only reason install; no update branch or what-changed text found (background.ts:7694-7700; search for onUpdateAvailable and details.reason found only that one use).
- Private window messaging (S74.26): no message or setting found; only the manifest rule and the tab-list filter.
- Browser differences (S74.27): no in-product explanation found. A release script for Microsoft Edge Add-ons exists (apps/extension/scripts/publish-edge-addons.mjs; test edge-addons-publish.test.ts), so Edge is a shipping target; what differs there is unknown.
- Restricted-page list is a fixed list of prefixes in code.

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Account or workspace switcher inside the extension (S74.20): none found; the brief marks it not applicable (search of apps/extension/src and locales for 'switch account', 'switchAccount', 'switch workspace' returned nothing).
- Update notice, private-window messaging and browser-difference page on surface:chrome.

## 4. Required behaviour

**Established requirements**

- The user switches account or workspace inside the extension. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.20)
- On pages the extension cannot use it says why. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.25)
- After an update the extension tells the user what changed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.24)
- The extension has clear controls or messaging for private or incognito windows. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.26)
- The extension explains which features differ between supported browsers. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.27)
- After Chrome suspends the background worker, chats and agent runs recover or report clearly. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.28)
- The manifest keeps incognito not allowed. (source: code: apps/extension/__tests__/manifest-contract.test.ts:64-65)

**Acceptance criteria**

1. On chrome://extensions or the Web Store the blocked card appears, the context button is disabled and a chat message can still be sent.
2. On a site the person blocked, the 'You blocked AGI on <host>' sentence is shown.
3. A chat stream interrupted by a worker restart either resumes (cloud run saved) or ends with 'The extension service restarted before the run was saved.'
4. A browser task whose worker was stopped ends with the worker-stopped sentence and the tab no longer shows the debugging banner or dock.
5. A private window does not run the extension (manifest incognito not_allowed).
6. After first install the welcome page opens; after an update nothing is shown today (record as a known gap).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A tab list in the panel must never include private-window tabs [from background.ts:4668].
- Recovery messages must not claim the run continued [from the copy text].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a 'What is new' card after an update using onInstalled reason update.
- [proposed] Add one line in Options, Help explaining that private windows are off and why.
- [proposed] Add a short table of what differs between Chrome and Edge.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Surface policy | `apps/extension/src/features/side-panel/surface-policy.ts` | Restricted address prefixes and chrome availability (chat true, page context false on restricted pages). |
| screen | Blocked state card and handlers | `apps/extension/src/side_panel.ts` | setBlockedState (10824), updateActivePage (10810), card text (13710-13735). |
| hook | Managed chat keep-alive | `apps/extension/src/side_panel.ts` | ensureManagedChatKeepalivePort and startManagedChatKeepalive, 20 second heartbeat, resume or error on port loss (6905-6957). |
| service | Keep-alive port handler | `apps/extension/src/background.ts` | handleManagedChatKeepalivePort accepts only trusted extension pages (1857-1880). |
| service | Run marker recovery | `apps/extension/src/features/computer-use/runMarker.ts` | Marker in session storage and recoverLostComputerUseRun. |
| service | Worker start recovery call | `apps/extension/src/background.ts` | lostComputerUseRunRecovery wiring: stop input watch, detach debugger, ungroup tab, announce worker_restarted (9219-9236). |
| component | Stop-reason copy and watchdog | `apps/extension/src/features/side-panel/computerUsePanel.ts` | Sentences per stop reason and the 90 second silence check. |
| config | Manifest incognito rule | `apps/extension/manifest.json` | incognito not_allowed at line 9. |
| service | Install handler | `apps/extension/src/background.ts` | onInstalled opens the welcome page on install only (7694-7700). |
| screen | Welcome page | `apps/extension/src/welcome.ts` | First-install page (welcome.html and welcome.ts exist; contents not read). |
| service | Tab list filter | `apps/extension/src/background.ts` | Excludes incognito tabs at line 4668. |
| service | Edge publish script | `apps/extension/scripts/publish-edge-addons.mjs` | Release tool for Microsoft Edge Add-ons; shows Edge is a target; not a user message. |
| test | service-worker-lifecycle.test.ts | `apps/extension/__tests__/service-worker-lifecycle.test.ts` | Worker wake rules and run lost with the worker. |
| test | side-panel-surface-policy.test.ts | `apps/extension/__tests__/side-panel-surface-policy.test.ts` | Restricted pages and surface ownership. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Active tab change updates the blocked state from the tab address. | device | side_panel.ts:10810-10856 |
| While a chat streams the panel keeps a port to the worker open and pings every 20 seconds so Chrome keeps the worker alive. | device | side_panel.ts:6905-6957 |
| If the port drops, a saved cloud run is re-attached by asking AGI Cloud for its progress; otherwise an error ends the stream. The endpoint used for resume was not traced. | device and our servers | side_panel.ts:6990; endpoint unknown |
| On worker start the marker is read, tabs released and the panel told the run ended. | device | runMarker.ts:100-130; background.ts:9219-9236 |
| First install opens the welcome page. | device | background.ts:7694-7700 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run marker | store:chrome-storage-session key agi_cu_run_in_progress | no | removed on run end or recovery |
| Composer draft | store:chrome-storage-session under a key built from account and conversation | no | removed when the text is cleared (side_panel.ts:10105-10115) |
| Native reconnect give-up flag | store:chrome-storage-session | no | cleared on manual reconnect |

**Models and providers.** No model chooses anything here. Resumed chat runs continue on whichever model the cloud run already used.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Notices need no account. Chat resume needs the signed-in owner of the stream (side_panel.ts:6990-7010). |
| Permissions | Manifest incognito not_allowed; port connections accepted only from trusted extension pages (background.ts:1857-1880). |
| Subscription | none found in the code. |
| Limits and metering | Keep-alive 20 seconds; inactivity limit 90 seconds for a chat stream; panel silence check 90 seconds for browser runs. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Everything except cloud chat resume runs on the device; no Local mode of AI is involved. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Restricted page | Card visible, context button disabled; chat enabled unless chat state is not ready. | side_panel.ts:10824-10856 |
| Blocked by the person | Specific sentence naming the host. | locale spSiteBlockedByYou; side_panel.ts:7825 |
| Worker stopped during chat with no saved run | Stream ends with 'The extension service restarted before the run was saved.' | side_panel.ts:6925-6935 |
| Worker stopped during chat with saved cloud run | resumeManagedCloudRun re-attaches. | side_panel.ts:6918-6925 |
| Worker stopped during browser task | Ended with the worker-stopped sentence; tabs released. | runMarker.ts:100-130 |
| Private window | Extension not run; no message to the person found. | manifest.json:9; background.ts:4668 |
| Update | not handled in the code beyond install. | background.ts:7694-7700 |
| Other browser | not handled in the code: no browser detection or message found. | search of apps/extension/src found none |
| Accessibility | Blocked card text has no live-region role in the lines read; the browser run banner and status hints use live regions elsewhere. | side_panel.ts:13710-13735; computerUsePanel.ts:1620 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/side-panel-restricted-page.test.ts`: 'restricted page card' and 'agent page indicator'.
- `apps/extension/__tests__/side-panel-surface-policy.test.ts`: 'captured tab document lifetime', 'attached page context on protected browser pages', 'Chrome side-panel surface ownership', 'isRestrictedPageUrl'.
- `apps/extension/__tests__/service-worker-lifecycle.test.ts`: 'the worker is only woken when there is work', 'a computer-use run that dies with the worker ends visibly', 'a page load does not wake the worker on a site the user never approved'.
- `apps/extension/__tests__/computer-use-run-marker.test.ts`: 'a browser task that dies with the worker'.
- `apps/extension/__tests__/managed-chat-port.test.ts`: 'Managed chat keepalive port protocol'.
- `apps/extension/__tests__/manifest-contract.test.ts`: Manifest rules including incognito not_allowed (line 64-65).
- `apps/extension/__tests__/edge-addons-publish.test.ts`: Edge Add-ons publish script, not a user message.
- `apps/extension/__tests__/side-panel-stream-persistence.test.ts`: Name only: stream persistence; contents not opened.

**Test scenarios**

- **Restricted page**
  1. Open chrome://extensions and open the side panel.
  2. Look at the card and the context button.
  3. Send a chat message.
  - Expected: Card 'Page access unavailable'; context button disabled; chat message sends.
- **Stop the worker during a browser task**
  1. Start a browser task.
  2. In chrome://extensions stop the service worker (or use Terminate in the worker inspector).
  3. Reopen or wait for the panel.
  - Expected: Run ends with the worker-stopped sentence; no debugging banner remains; the tab is ungrouped.
- **Stop the worker during a chat stream**
  1. Send a long chat message in a signed-in chat.
  2. Terminate the worker mid-stream.
  - Expected: Stream resumes if a cloud run was saved; otherwise ends with 'The extension service restarted before the run was saved.'
- **Private window**
  1. Open a private window.
  2. Look for the extension action.
  - Expected: Extension is not offered or active in the private window; no message from AGI (confirm in Chrome).
- **Update**
  1. Install an older build, then update it.
  - Expected: Today no notice appears (gap).
- **Edge**
  1. Install the same build in Edge and open Options and Help.
  - Expected: Today no text about browser differences (gap).

**Where to look when it fails**

- Worker console: 'A browser task lost with the previous worker could not be cleaned up' when recovery fails.
- Side panel errors 'The extension service restarted before the run was saved.' and 'No AGI Cloud activity was received for 90 seconds.'
- Session key agi_cu_run_in_progress left behind means recovery did not run.

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/074-browser-extension.md](../../70-qa/test-plans/chrome/074-browser-extension.md)

## 10. Gaps and dependencies

- **No update notice (S74.24).** Affects: All surface:chrome users after an update.. Evidence: background.ts:7694-7700 handles install only.. Work needed: Handle reason update, show a what-changed card once per version, add a test.
- **No private-window messaging or control (S74.26).** Affects: People who expect the extension in private windows.. Evidence: manifest.json:9; no text in locales.. Work needed: Add help text; decide whether private windows should ever be supported (shared local storage is the stated reason against).
- **No explanation of browser differences (S74.27).** Affects: Edge and other Chromium users.. Evidence: No code found; Edge publish script exists.. Work needed: List real differences by testing, then add a short help section.
- **Blocked card claims administrator-restricted pages are covered, but detection checks fixed prefixes only.** Affects: People on administrator-restricted sites.. Evidence: surface-policy.ts:20-45.. Work needed: Confirm where admin policy denials show and align the copy or the detection.
- **Cloud chat resume endpoint and behaviour not traced.** Affects: Confidence in S74.28 for chats.. Evidence: side_panel.ts:6990.. Work needed: Trace resumeManagedCloudRun and test with a real worker stop.

**Depends on**

- surface:chrome
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-agents-tools-and-automation
- SYS-observability-and-operations
- SYS-authentication-and-identity
- F074-07
- file:apps/extension/src/side_panel.ts
- file:apps/extension/src/background.ts
- file:apps/extension/manifest.json
- store:chrome-storage-session

## Unknown

- Which endpoint resumeManagedCloudRun calls and how long a saved run stays resumable.
- Whether Chrome really hides the extension from private windows with not_allowed in the shipped build (Chrome behaviour not tested here).
- What differs between Chrome and Edge for this extension.
- Why the brief marks account switching not applicable (no decision text read).
- Contents of the welcome page and the stream persistence test.
- Whether any worker-suspension recovery has been tried on a real browser; no result file found.
