---
id: "F074-08"
type: "feature"
title: "Desktop app pairing and connection status"
aliases: ["Desktop app pairing", "Desktop connection", "Pair with Desktop", "Native host connection", "Native bridge", "Desktop tools notice", "Chrome pairing (web app Chrome section)", "S74.18 Desktop-app pairing", "S74.19 Native-host connection status"]
area: "74 Browser extension"
available_on: ["desktop", "cli", "chrome"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S74.18", "S74.19"]
depends_on: ["surface:chrome", "surface:desktop", "surface:cli", "mode:local", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-agents-tools-and-automation", "file:apps/extension/src/features/native-bridge/pairing.ts", "file:apps/desktop/electron/browser/bridgeServer.ts", "store:chrome-storage-local", "store:chrome-storage-session"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-08 Desktop app pairing and connection status

Connects the Chrome extension to the AGI desktop app on the same computer. The person starts pairing in the extension's Options page and types a code the desktop app shows. The side panel shows a 'Desktop tools are optional and currently disconnected' notice with Reconnect. Desktop and CLI read the pairing state.

Area: [74. Browser extension](README.md). Requirement items: [S74.18](../../10-requirements/capabilities/074-browser-extension.md#s7418), [S74.19](../../10-requirements/capabilities/074-browser-extension.md#s7419).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates a trusted link between one Chrome profile and the AGI desktop app: the extension asks the desktop bridge on the local loopback address for a pairing request, the desktop app shows an 8-character code in its own window, the person types it into the extension, and the desktop app issues a token. After that Chrome starts the desktop's native host and the extension answers browser commands from the desktop and the CLI (apps/extension/src/features/native-bridge/pairing.ts; apps/desktop/electron/browser/bridgeServer.ts:401-465).

**Why it exists.** The desktop app and the CLI can use the person's browser only through the extension, and only if the person has agreed on this computer. The brief requires that the extension pairs with the desktop app and shows whether the native host is connected, with a way to reconnect (doc: knowledge-base/data/area-briefs/074-browser-extension.md:87-96).

**Who uses it.** People who use both the AGI desktop app (or the CLI) and the Chrome extension on one computer.

**Problems it solves**

- Letting desktop chat or the CLI read and act in Chrome without opening an unsafe local door
- Knowing whether the desktop link is up
- Recovering after Chrome or the desktop app restarts
- Removing a pairing from either side

**Use cases**

- Pair Chrome once so desktop chat can screenshot the current page
- See 'Paired and answering' in the desktop app before asking for a browser action
- Press Reconnect in the side panel after restarting the desktop app
- Unpair a browser from the desktop app before selling the computer

## 2. User experience

**Where to find it**

- surface:chrome: Options page, section 'Account' group, subsection titled 'Desktop app', row 'Desktop connection' (apps/extension/src/features/options/destinations.ts:25-45, 108-111; desktop-pairing-rows.ts:34-197).
- surface:chrome: side panel notice 'Desktop tools are optional and currently disconnected.' with button 'Reconnect' (side_panel.ts:15637-15650).
- surface:desktop: the hosted web app Settings, Capabilities section, block headed 'Chrome', shown only inside the desktop app (apps/web/features/desktop-host/components/BrowserPairingSection.tsx:1-182; used by apps/web/features/settings/sections/CapabilitiesSection.tsx).
- surface:desktop: a native dialog titled 'Pair Chrome with <desktop product name>' shows 'Pairing code ...' (apps/desktop/electron/main.ts:462-473).
- surface:cli: no screen; the CLI reads pairing state to decide whether to offer browser tools (apps/cli/src/browser_bridge.rs:209-251).
- surface:web, surface:mobile, surface:vscode: not available.

**Before you start**

- The AGI desktop app is installed and running with its local bridge listening (default port from BROWSER_BRIDGE_DEFAULT_PORT, packages/contracts/types/src/browser-bridge.ts:15).
- The bridge address in the extension is a local one: localhost, 127.0.0.1 or [::1] (apps/extension/src/background/policy.ts:310-326).
- Signing in to AGI Cloud is not required to pair; a pairing made while signed out binds to the first account seen later (pairing.ts:236-250).

**Screens and controls**

- Options row: status text 'Not paired', 'Pairing…', 'Enter the code shown in Desktop', 'Paired' with a fingerprint, 'Pairing failed'; buttons 'Pair with Desktop' (or 'Retry Pairing'), 'Confirm Code', 'Unpair'; code field with placeholder ABCD-EFGH; unpair confirmation 'Unpair the desktop app? Browser actions that run through Desktop stop working until you pair again.' with 'Keep paired' (desktop-pairing-rows.ts:34-197; locale keys spPairing*, optPairing*).
- Side panel notice with dot, text and 'Reconnect'.
- Desktop web block: 'Install extension', 'Register the browser host again', 'Unpair' with confirmation 'Unpair this browser?', status 'Paired and answering' or 'Paired, not answering right now' (BrowserPairingSection.tsx:100-170).

**Journey**

1. In the desktop app or web block, nothing needs doing yet.
2. In Chrome open the extension Options page, go to Account, find 'Desktop app', press 'Pair with Desktop'.
3. The extension posts to the desktop bridge /pair/request; the desktop app shows the pairing code in a dialog and the status reads 'Enter the code shown in Desktop' (valid for 2 minutes, packages/contracts/types/src/browser-bridge.ts:121).
4. Type the code and press 'Confirm Code'; the extension posts /pair/confirm and stores the issued token; the desktop host manifest is installed and the extension asks the worker to reconnect.
5. Status reads 'Paired'; desktop web block reads 'Paired and answering'.
6. If the link drops, the side panel shows the disconnected notice; press 'Reconnect'.
7. To remove, press 'Unpair' in Options or in the desktop app.

**What the person sees and gets**

- Status text and error text in the Options row (aria-live polite).
- Side panel notice visible whenever the link is not connected.
- Desktop shows fingerprint and state; CLI gets availability Paired, PairedNotAnswering, NotPaired or ShellNotRunning (browser_bridge.rs:209-251).
- After an unpair that Desktop could not hear: 'Unpaired in this browser, but Desktop could not be reached to remove the pairing. It is removed the next time Desktop is open while Chrome is running, or you can remove it in Desktop's settings now.' (pairing.ts:31).

**Settings**

- Bridge address stored under key agi_bridge_url in store:chrome-storage-local (pairing.ts:300-310); no UI to change it was found.
- Paired record under key agi_paired_desktop and flag connectedToDesktop (pairing.ts:21-30).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Pairing phases idle, requesting, awaiting-code, confirming, paired, error (pairing.ts:1-11). A failure stores the error and moves to the error phase (pairing.ts:64-68).
- Only local bridge addresses are accepted, else 'Pairing is only supported with local desktop bridge' (pairing.ts:316-323; policy.ts:310-326).
- Request and confirm are plain fetches with an 8 second timeout and no redirects (pairing.ts:326-352). Desktop binds the pairing to the extension id taken from the request Origin, not from the body (bridgeServer.ts:238-260, 395-400).
- Desktop generates a code of 8 characters, expires it after 2 minutes, and limits attempts and pending requests (bridgeServer.ts:141-180, 322-345; browser-bridge.ts:120-121; constants MAX_PAIR_CONFIRM_ATTEMPTS and MAX_PENDING_PAIR_REQUESTS).
- A pairing belongs to the signed-in account: if the account changes or signs out the pairing is released and an unpair is owed to Desktop (pairing.ts:112-125, 270-290; background.ts:1515-1545).
- Connection uses Chrome native messaging to host com.agiworkforce.browser with a connect handshake carrying the pair token, a session secret and a ping (background.ts:1389, 1990-2050).
- Status reaches the side panel by GET_CONNECTION_STATUS at open and CONNECTION_STATUS_CHANGED pushes (side_panel.ts:16264-16276, 15860-15868; background.ts:7428-7450).
- GET_CONNECTION_STATUS tries connecting whenever the browser is paired, not connected, not already connecting and has not given up; it pings an existing connection (background.ts:5074-5108). This differs from the first draft, which said once per worker start.
- Reconnect back-off: 1 s doubling to a 30 s cap; the timed delays are 1, 2, 4, 8, 16, 30, 30 seconds; at the 8th scheduling the delay is null, the worker gives up and logs 'Max native reconnect attempts reached; giving up until user action' (reconnect.ts:1-30; background.ts:1698-1735). The give-up flag is saved in session storage so it survives a worker restart (background.ts:1462-1472). Manual 'Reconnect' (RECONNECT_NATIVE) resets it (background.ts:1668-1698).
- Permanent errors (host not found, forbidden, not allowed) stop retries, mark Desktop unpaired and release the stored pairing (reconnect.ts:10-17; background.ts:2433-2453). The first draft only said retries stop.
- Unpair: the worker tells Desktop while the pairing still authorises the message. If Desktop is unreachable the unpair is recorded as owed, the pairing is released here, and the notice above shows; it is retried at most every 5 minutes. Only when the debt cannot be stored is the pairing kept, with 'Desktop could not be reached, so the pairing was kept. Try again.' (background.ts:1553-1580, 5115-5122; pairing.ts:455-495). The first draft described only the kept case.
- Desktop side: bridge routes for pair request, pair confirm and a legacy token-authorised pair; unpair removes the host registration and pairing; dispatcher commands browser_pairing_state, browser_pairing_install_host, browser_pairing_unpair (bridgeServer.ts:905-958; apps/desktop/electron/runtime/dispatcher.ts:3127-3133).
- CLI reads the desktop bridge file and POSTs /client/state with a local token, once per session, and offers browser tools only if paired (apps/cli/src/agent/mod.rs:1097-1103; browser_bridge.rs:209-251).

**Incomplete**

- The operator path with a pasted bridge token exists in code (requestPairing, storeBridgeSecret, header X-Bridge-Token) but no screen or message handler calls storeBridgeSecret; only tests do (grep of apps/extension/src). The error text still tells the person to paste the token 'here' (pairing.ts:411-417).
- Desktop copy says to open the side panel and choose 'Connect to Desktop'; the extension has no such label. Pairing starts from Options with 'Pair with Desktop' (BrowserPairingSection.tsx:14-17 vs _locales/en/messages.json spPairingPair).
- The side panel Reconnect button has no visible result of its own; failure only goes to the console (side_panel.ts:15646-15649).

**Present but disconnected or switched off**

- The bridge-token paste path described above.

**Not available**

- surface:web (outside the desktop app), surface:mobile, surface:vscode: no pairing screen.
- mode:local and mode:own-key as AI modes do not apply; this feature is local-only plumbing.

## 4. Required behaviour

**Established requirements**

- The extension pairs with the desktop app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.18)
- The extension shows whether its desktop native host is connected and lets the user reconnect. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.19)
- Pairing works only with a local bridge. (source: code: apps/extension/src/background/policy.ts:310-326)
- Pairing is authorised by a code that never crosses the HTTP channel. (source: doc: apps/extension/docs/threat-model.md (Local Desktop bridge row))

**Acceptance criteria**

1. With a non-local bridge address, pressing Pair shows 'Pairing is only supported with local desktop bridge'.
2. With the desktop app running, Pair shows a code in a desktop dialog and the Options row asks for it.
3. Typing the correct code ends in 'Paired' with a fingerprint and 'Paired and answering' in the desktop app.
4. A wrong code shows an error; while the request is still valid the row returns to asking for the code.
5. Quitting the desktop app makes the side panel show the disconnected notice; reopening it and pressing Reconnect clears the notice.
6. Unpair from the Options row removes the pairing in both places when Desktop is reachable, and shows the owed notice when it is not.
7. Switching the signed-in AGI account releases the pairing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI must only offer browser tools when the answer is 'paired and answering' [inferred from the test name a_paired_browser_that_stopped_answering_is_not_usable, browser_bridge.rs:535].
- Desktop commands still pass the extension's own approved-site rules, because a paired desktop is only a caller [from desktopCommands.ts:19-27].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a field to Options for the operator bridge token, or remove that code path and its error message.
- [proposed] Align the desktop copy with the extension label.
- [proposed] Show a result on the side panel Reconnect button.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Pairing client | `apps/extension/src/features/native-bridge/pairing.ts` | Pairing phases, request, confirm, unpair, stored pair record, account binding, owed revocation. |
| component | Desktop pairing rows | `apps/extension/src/features/options/desktop-pairing-rows.ts` | Options UI for pair, code, confirm, unpair and status. |
| screen | Desktop app options section | `apps/extension/src/features/options/destinations.ts` | createDesktopSection adds the rows under title 'Desktop app'. |
| service | Reconnect policy | `apps/extension/src/features/native-bridge/reconnect.ts` | Delay schedule, attempt cap and permanent-error test. |
| service | Native connection and status handlers | `apps/extension/src/background.ts` | connectToNativeHost, openNativeConnection, scheduleNativeReconnect, GET_CONNECTION_STATUS, RECONNECT_NATIVE, UNPAIR_NATIVE, releaseDesktopPairing. |
| service | Bridge URL policy | `apps/extension/src/background/policy.ts` | validateBridgeUrl and the allowed loopback hosts. |
| component | Bridge notice | `apps/extension/src/side_panel.ts` | Disconnected notice, Reconnect button, status probe and push handling. |
| service | Desktop command handler | `apps/extension/src/features/native-bridge/desktopCommands.ts` | Carries out desktop-issued page actions under the extension's own site rules. |
| service | Desktop bridge server | `apps/desktop/electron/browser/bridgeServer.ts` | Loopback HTTP server: pair request, confirm, legacy pair, client state and command routes, code generation and expiry. |
| store | Desktop pairing store | `apps/desktop/electron/browser/pairingStore.ts` | Persists the pairing record and tokens in the app's user data folder (browser-pairing.json, file mode 0600). |
| service | Native host installer | `apps/desktop/electron/browser/hostInstaller.ts` | Registers the native messaging host for the paired extension (file exists; used by installHostForPairedExtension). |
| component | BrowserPairingSection | `apps/web/features/desktop-host/components/BrowserPairingSection.tsx` | Desktop-hosted web UI for pairing state, host registration and unpair. |
| command | browser_pairing_state / install_host / unpair | `apps/desktop/electron/runtime/dispatcher.ts` | Runtime commands behind the web block (dispatcher.ts:3127-3133). |
| service | CLI browser bridge | `apps/cli/src/browser_bridge.rs` | Reads desktop-bridge.json and asks /client/state whether a browser is paired and answering. |
| hook | refresh_browser_availability | `apps/cli/src/agent/mod.rs` | Resolves once per session whether to offer browser tools. |
| config | Browser bridge contract | `packages/contracts/types/src/browser-bridge.ts` | Default port, route names, code length 8, request lifetime 2 minutes. |
| config | Locale strings | `apps/extension/_locales/en/messages.json` | Keys spPairing*, optPairing*, optDesktopTitle, spBridgeNotice*. |
| test | pairing tests | `apps/extension/__tests__/pairing.test.ts` | State, account binding, confirmPairing. |
| test | Desktop bridge test | `apps/desktop/electron/__tests__/browserBridge.test.ts` | Bridge routes; contents partly seen (uses onPairRequest). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses 'Pair with Desktop'. The extension posts its id to the bridge's pair request route on 127.0.0.1 or localhost. | device | pairing.ts:326-352, 410-440; policy.ts:316-326 |
| Desktop creates a pending request with a random 8 character code, shows it in a native dialog, and returns only a request id, code length and lifetime. | device | bridgeServer.ts:401-424; main.ts:462-473 |
| Person types the code; the extension posts request id and code to the confirm route; Desktop checks code, extension origin and attempts, then issues a token and installs the native host manifest. | device | bridgeServer.ts:426-448; pairing.ts:354-395, 440-475 |
| The extension stores the token and fingerprint locally bound to the signed-in account and asks the worker to reconnect. | device | pairing.ts:354-395 |
| Chrome starts the native host; the worker sends a connect with the pair token, negotiates a session secret, pings, then starts polling for desktop browser commands. | device | background.ts:1990-2060, 4713-4760 |
| The side panel learns the state from GET_CONNECTION_STATUS and pushes; failures schedule timed reconnects or give up. | device | background.ts:1698-1735, 5074-5110 |
| CLI and desktop chat read pairing state from the bridge; nothing in this feature calls AGI servers. | device | browser_bridge.rs:209-251; bridgeServer.ts:925-935 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pair token and fingerprint | store:chrome-storage-local keys agi_paired_desktop and connectedToDesktop | no (local storage, restricted to extension pages) | removed on unpair, account change or permanent host failure |
| Pending pair request | store:chrome-storage-session key agi_pair_request | no | expires after 2 minutes; removed on pair or unpair |
| Owed unpair record | store:chrome-storage-local key agi_pending_desktop_revocation | no | removed once Desktop confirms |
| Reconnect gave-up flag | store:chrome-storage-session | no | cleared by manual reconnect or successful connect |
| Desktop pairing record, bridge token, host token | desktop user data file browser-pairing.json | no | pairing cleared by unpair; tokens stay |

**Models and providers.** No model or provider takes part. This is local plumbing between the extension, the desktop app and the CLI.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No sign-in needed to pair; a pairing made signed out is bound to the first account seen later and is released when the account changes (pairing.ts:236-250; background.ts:1515-1545). |
| Permissions | Chrome permission nativeMessaging; the host is registered by Desktop for the paired extension id; loopback only; pairing request must come from a chrome-extension origin (manifest.json permissions; bridgeServer.ts:238-260). |
| Subscription | none found in the code. No plan check around pairing in the extension, desktop bridge or CLI files read. |
| Limits and metering | Code length 8, request lifetime 2 minutes, request timeout 8 seconds, reconnect delays 1 to 30 seconds with give-up at the 8th scheduling, owed-unpair retry every 5 minutes (DESKTOP_REVOCATION_RETRY_MS), body size limit 4 KiB on pairing routes (bridgeServer.ts:57). |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | This feature is local by design and needs no AGI subscription or Cloud call. Whether the paired desktop browser actions need Cloud sign-in is decided in the desktop and not read here: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Options row loads state with loadPairingState on open and when pairing is released elsewhere. | desktop-pairing-rows.ts:192-196; pairing.ts:296-310 |
| Empty or not paired | Row reads 'Not paired'; side panel shows the disconnected notice. | desktop-pairing-rows.ts:128; side_panel.ts:9851-9862 |
| Error | Error text shown under the row; button becomes 'Retry Pairing'; a 401 on confirm with an unexpired request returns to asking for the code. | desktop-pairing-rows.ts:145-149; pairing.ts:440-475 |
| Timeout | Requests time out after 8 seconds; the code request expires after 2 minutes; stored request older than expiry is ignored. | pairing.ts:48-60, 95-105 |
| Offline or desktop not running | Request fails with the fetch error text; native connect fails and schedules reconnect. | pairing.ts:403-408; background.ts:2414-2442 |
| Reconnect and give-up | Seven timed reconnects, then stops until the person presses Reconnect. | reconnect.ts:1-30; background.ts:1698-1735 |
| Paired elsewhere or removed by Desktop | Handshake refusal releases the pairing and sets 'Desktop no longer recognizes this browser profile, so the pairing was removed here. Pair it again in the extension settings.'; a refusal of an older pairing never removes a newer one. | background.ts:1406-1410, 1930-1990 |
| Account change | Pairing released and unpair owed. | background.ts:1515-1545 |
| Accessibility | Status text has aria-live polite; unpair confirm has aria-labelledby; desktop block uses role alert for errors. | desktop-pairing-rows.ts:39-45, 90; BrowserPairingSection.tsx:112-118 |
| Other browsers or operating systems | not handled in the code read: only Chrome native messaging is used; hostInstaller.ts was not opened. | background.ts:1389 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/pairing.test.ts`: 'getPairingState', 'loadPairingState', 'a pairing is a credential of the signed-in account', 'confirmPairing'.
- `apps/extension/__tests__/pairing-e2e.test.ts`: Pairing flow IDLE to REQUESTING to PAIRED, fingerprint match, idempotent re-requests, and that only the bridge secret authorises a manifest install.
- `apps/extension/__tests__/pairing-transport.test.ts`: Pairing HTTP transport; uses storeBridgeSecret.
- `apps/extension/__tests__/bridge-url-validation.test.ts`: validateBridgeUrl accepts localhost, 127.0.0.1, [::1] and rejects 0.0.0.0.
- `apps/extension/__tests__/connection-lifecycle.test.ts`: isPermanentNativeDisconnect, nativeReconnectDelayMs, notifyConnectionStatusChange, waitForNativeConnection.
- `apps/extension/__tests__/background.reconnect.test.ts`: isPermanentNativeDisconnect heuristic.
- `apps/extension/__tests__/desktop-pairing-proof.test.ts`: Profile proves its pairing before desktop work; command pickup after Desktop was away; pairing removed while connected; older refusal never removes a newer pairing.
- `apps/extension/__tests__/desktop-revocation-handshake.test.ts`: Reconnecting while Desktop is owed an unpair.
- `apps/desktop/electron/__tests__/browserBridge.test.ts`: Desktop bridge routes.
- `apps/desktop/electron/__tests__/pairingWindow.test.ts`: Pairing window; name only.
- `apps/web/features/desktop-host/__tests__/BrowserPairingSection.test.tsx`: Web pairing block; name only.

**Test scenarios**

- **Pair with the code**
  1. Start the desktop app.
  2. In Chrome Options, Account, Desktop app, press 'Pair with Desktop'.
  3. Read the code in the desktop dialog and type it; press 'Confirm Code'.
  - Expected: Row shows 'Paired' with fingerprint; the desktop Chrome block shows 'Paired and answering'.
- **Wrong or expired code**
  1. Start pairing and wait over 2 minutes, or type a wrong code.
  - Expected: Error text appears; a wrong code within lifetime lets you retype; after expiry press 'Retry Pairing'.
- **Non-local bridge**
  1. Set the stored bridge address to a non-local host in a test profile and press Pair.
  - Expected: 'Pairing is only supported with local desktop bridge'.
- **Reconnect after quitting Desktop**
  1. Pair, quit the desktop app, open the side panel.
  2. Wait for the notice, start Desktop, press 'Reconnect'.
  - Expected: Notice disappears after the connection returns.
- **Give-up after repeated failures**
  1. With Desktop closed, wait through the back-off (about 90 seconds).
  - Expected: Worker logs the give-up line; no more automatic tries until Reconnect.
- **Unpair with Desktop unreachable**
  1. Pair, quit Desktop, press 'Unpair' and confirm.
  - Expected: Pairing is gone in Chrome and the owed-unpair notice is shown.

**Where to look when it fails**

- Worker console lines: 'Native host disconnected', 'Native host permanently unavailable; halting reconnect', 'Max native reconnect attempts reached; giving up until user action', 'Scheduling native reconnect', 'Native host handshake failed', 'Desktop no longer holds this pairing; releasing it here'.
- Storage keys agi_paired_desktop, agi_pair_request, agi_pending_desktop_revocation.
- Desktop: file browser-pairing.json in the app user data folder; the web block shows bridgeListening and unavailableReason.
- Chrome error text 'Specified native messaging host not found' marks a missing host.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/074-browser-extension.md](../../70-qa/test-plans/desktop/074-browser-extension.md)
- CLI: [70-qa/test-plans/cli/074-browser-extension.md](../../70-qa/test-plans/cli/074-browser-extension.md)
- Chrome: [70-qa/test-plans/chrome/074-browser-extension.md](../../70-qa/test-plans/chrome/074-browser-extension.md)

## 10. Gaps and dependencies

- **Bridge token paste path has no screen.** Affects: Operators who cannot see the Desktop window; surface:chrome.. Evidence: storeBridgeSecret is called only from tests; error text pairing.ts:411-417 points to a field that does not exist.. Work needed: Add the field or remove the path and message.
- **Desktop copy and extension labels disagree on where pairing starts.** Affects: People following the desktop instructions; surface:desktop and surface:chrome.. Evidence: BrowserPairingSection.tsx:14-17 says side panel, 'Connect to Desktop'; the extension has 'Pair with Desktop' in Options.. Work needed: Change one side, or add a side panel entry that opens the Options anchor.
- **Reconnect button gives no feedback on failure.** Affects: surface:chrome side panel.. Evidence: side_panel.ts:15646-15649 logs to console only.. Work needed: Show a short result or busy state.
- **Support for other Chromium browsers and operating systems is not shown.** Affects: Edge, Brave and non-Mac users.. Evidence: Native host name fixed (background.ts:1389); hostInstaller.ts not read.. Work needed: Read the installer and document or test each platform.

**Depends on**

- surface:chrome
- surface:desktop
- surface:cli
- mode:local
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-agents-tools-and-automation
- file:apps/extension/src/features/native-bridge/pairing.ts
- file:apps/desktop/electron/browser/bridgeServer.ts
- store:chrome-storage-local
- store:chrome-storage-session

## Unknown

- Whether pairing works on non-Chrome browsers and on Windows or Linux (hostInstaller.ts not read).
- Whether desktop-driven browser actions need AGI Cloud sign-in.
- Whether the desktop tokens in browser-pairing.json are encrypted at rest (file mode 0600 seen; encryption not seen).
- Contents of tests marked name only.
- Exact values of MAX_PAIR_CONFIRM_ATTEMPTS and MAX_PENDING_PAIR_REQUESTS.
