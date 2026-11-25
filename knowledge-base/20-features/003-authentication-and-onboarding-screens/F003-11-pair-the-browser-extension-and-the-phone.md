---
id: "F003-11"
type: "feature"
title: "Pair the browser extension and the phone"
aliases: ["Browser pairing", "Connect to Desktop", "Chrome pairing", "Remote Control", "Pair a phone", "Mobile device pairing", "Companion", "Unpair", "Remote Control pairing in VS Code"]
area: "3 Authentication and onboarding screens"
available_on: ["desktop", "mobile", "vscode", "chrome"]
implementation: {web: "n/a", desktop: "built", mobile: "built", cli: "n/a", vscode: "built", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S3.30", "S3.31"]
depends_on: ["surface:desktop", "surface:chrome", "surface:mobile", "surface:vscode", "mode:local", "mode:cloud", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "api:POST /api/pair/claim", "api:POST /api/pair/initiate", "F003-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-11 Pair the browser extension and the phone

Connects the Chrome extension or a phone to the desktop app. Chrome: Desktop shows an 8-character code in a native dialog and the extension types it in. Phone: Desktop shows a QR (and code) and the phone claims it through the account and a relay. Both can be unpaired. Mobile pairing exists but is switched off in the current mobile build.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.30](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s330), [S3.31](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s331).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates a trusted link between the Desktop app and either the Chrome extension (so chat can read and act in the browser, with approval) or a phone and VS Code (Remote Control: follow and steer coding sessions, approve steps).

**Why it exists.** The extension and phone should act only for the person who owns the computer. A one-time code or QR proves a human at that computer started the pairing.

**Who uses it.** Desktop users who use Chrome automation; paid-plan users who want to follow coding sessions from a phone or VS Code.

**Problems it solves**

- Any local program or web page pretending to be the extension.
- A stranger's phone joining someone's desktop.
- Stale links: pairings expire and can be removed.

**Use cases**

- A user opens the extension side panel, chooses Connect to Desktop, reads the code from Desktop and types it; Chrome can then be used from chat.
- A user opens Desktop > Remote Control, presses 'Pair a phone', scans the QR with the phone and allows it in the dialog.
- A VS Code user runs 'Code: Remote Control' and scans the panel's QR.
- A user unpairs Chrome from Desktop > Chrome.

## 2. User experience

**Where to find it**

- Desktop: Settings pane 'Chrome' (apps/web/features/desktop-host/components/BrowserPairingSection.tsx:14,114) and pane 'Remote Control' (RemoteControlSection.tsx:37).
- Chrome extension: side panel 'Connect to Desktop' (as named in the Desktop text, BrowserPairingSection.tsx:17-18).
- Mobile: Remote/companion screens, currently unavailable (apps/mobile/app/(app)/settings/remote-control.tsx:131).
- VS Code: command 'Code: Remote Control' (package.json:272-274) opening a panel with a QR.

**Before you start**

- Desktop app running with the local pairing bridge listening; browser host registered (BrowserPairingSection.tsx:21-24).
- Remote Control: a paid plan that includes it (RemoteControlSection.tsx:50), workspace policy and the server switch allowing it (remote-control-gate.ts:97-125), and a signed-in phone on the same account (manualPairing.ts claim route).

**Screens and controls**

- Desktop Chrome pane: 'Install extension' (when nothing asked yet), text 'The code is in a dialog Desktop opened on this Mac. It is never shown on this page.', state 'Paired and answering' or 'Paired, not answering right now', buttons 'Register the browser host again' and 'Unpair'.
- Desktop Remote Control pane: 'Pair a phone', dialog 'Pair your phone' with QR and code, 'Cancel pairing', 'Disconnect phone', 'Stop Remote Control', and a copy-link option for a browser.
- Native confirm dialog before a phone connects: 'Pairing code ...' with a warning to allow only the phone you just used (remoteControlService.ts:196-210).

**Journey**

1. Chrome: install the extension; in its side panel choose Connect to Desktop; Desktop opens a native dialog with an 8-character code; type it in Chrome within two minutes (three tries).
2. Desktop shows 'Paired and answering' and a fingerprint; the browser host is registered so Chrome can reach the app.
3. Phone: on Desktop open Remote Control and press 'Pair a phone'; on the phone open the pairing scan screen and scan the QR; Desktop asks you to allow that phone; confirm.
4. To undo: Desktop > Chrome > 'Unpair', or Desktop > Remote Control > 'Disconnect phone'; to pair a different phone stop Remote Control and pair again.

**What the person sees and gets**

- Wrong code: 'That code does not match the one shown in <Desktop name>.'; after three wrong codes 'Too many wrong codes. Start pairing again from Chrome.' (bridgeServer.ts:341-360).
- Phone messages: 'That pairing code is invalid or expired. Generate a new code on Desktop.', 'That pairing code is already connected to a phone.', 'That pairing code belongs to a different account. Sign in as that account on Desktop.' (manualPairing.ts:163-200).
- 'Remote Control comes with paid plans.' on lower plans (RemoteControlSection.tsx:50).
- 'Connection lost. Reconnecting so your phone can pick up where it left off.' (RemoteControlSection.tsx:49).

**Settings**

- Desktop Settings > Chrome and Remote Control panes.
- Workspace policy and server switch for Remote Control (cannot be set by the person).
- Mobile feature flags FEATURES.companion and FEATURES.dispatch (both false).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome pairing on Desktop: pending requests expire after 120 seconds, code is 8 characters from a 32-letter alphabet, 3 wrong tries end the request, timing-safe compare, request must come from the extension named in its origin (packages/contracts/types/src/browser-bridge.ts:119-123; apps/desktop/electron/browser/bridgeServer.ts:142-201,324-361,365-395).
- On success Desktop saves the pairing and installs the native-messaging host manifest and returns a token and fingerprint (bridgeServer.ts:365-379).
- Unpair from Desktop: browser_pairing_unpair removes host and pairing (apps/desktop/electron/runtime/dispatcher.ts:3127-3133).
- Extension binds the pairing to the signed-in account locally and drops it if another account signs in (apps/extension/src/features/native-bridge/pairing.ts:119-135,259-290).
- Phone claim: POST /api/pair/claim requires a signed-in session, CSRF, rate limit and the Remote Control standing check, then asks the relay to mint a token for that account; the relay refuses another account (apps/web/app/api/pair/claim/route.ts).
- The QR carries a secret (scheme agiw3:) and the 12-character code alone no longer secures a connection (apps/mobile/services/manualPairing.ts:10-33; packages/contracts/types/src/pairing.ts:50).
- Phone commands are signed with a key derived per session (HMAC, envelope version 3) (apps/mobile/lib/dispatchHmac.ts:18-30).
- Desktop and VS Code ask the person to confirm the phone before it connects (remoteControlService.ts:196-210 in both).
- VS Code: command opens a webview with the QR and calls /api/pair/initiate (apps/extension-vscode/src/features/remote-control/remoteControlService.ts:154-175).

**Incomplete**

- Mobile pairing code is present but turned off: FEATURES.companion and FEATURES.dispatch are false, and the Remote settings screen shows 'FeatureUnavailable' (apps/mobile/lib/v1FeatureFlags.ts:8-16; app/(app)/settings/remote-control.tsx:131). The brief's 'mobile done' is code-complete but not user-reachable.
- Typing the code alone on the phone is not enough; the draft (code typed on the phone) does not match: manual entry requires the secret from the QR (manualPairing.ts:36-37).

**Present but disconnected or switched off**

- Mobile companion and dispatch flags are false (v1FeatureFlags.ts).
- Remote Control start is refused for plans without it (UI at RemoteControlSection.tsx:50-51; server at remote-control-gate.ts:97-125).

**Not available**

- Web: no pairing screen (not applicable).
- CLI: not applicable (brief).
- Pairing from Chrome when Desktop is not installed: unavailable; the Chrome pane says to install the extension and start from its side panel.

## 4. Required behaviour

**Established requirements**

- The browser extension can be paired with the desktop app (or account) through a guided code/confirm step, with a way to unpair. (source: Brief S3.30)
- A phone can be paired with the desktop app by QR or short code, and the pairing is bound to the signed-in account. (source: Brief S3.31)
- A pairing request expires after 120 seconds and allows 3 wrong codes. (source: packages/contracts/types/src/browser-bridge.ts:121-123)
- The code proves a person at the computer read it; it is never shown on the web page. (source: apps/desktop/electron/browser/bridgeServer.ts:166-170; BrowserPairingSection.tsx:31-32)
- A pairing never outlives the reasons that would have refused it (plan, workspace policy, switch). (source: apps/web/lib/feature-flags/remote-control-gate.ts:83-96)

**Acceptance criteria**

1. Starting pairing from Chrome shows a code only in a Desktop dialog; entering it pairs and the Chrome pane shows the fingerprint.
2. A wrong code three times ends the request; a request older than 120 seconds is gone.
3. Unpair on Desktop removes the pairing and the extension notices the release.
4. A pairing made while signed in as account A is rejected when account B signs in to the extension.
5. On a plan without Remote Control the 'Pair a phone' path says it comes with paid plans and no pairing is created.
6. A phone signed in as another account gets 'belongs to a different account'.
7. An older QR without the secret is rejected with the update message.
8. With mobile flags off, Settings > Remote shows the unavailable notice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop pairing with Chrome is local only (loopback bridge) and does not need our servers [inferred from bridgeServer.ts being a local server and the bridge URL being validated as local in pairing.ts].
- Remote Control needs our relay and gateway, so it does not work offline [inferred from the claim route and relay URL checks].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide the date to turn on mobile companion and update the brief status to disabled until then.
- [proposed] Show a pairing expiry countdown in the Desktop dialog.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | BrowserPairingSection | `apps/web/features/desktop-host/components/BrowserPairingSection.tsx` | Desktop 'Chrome' pane: state, register host, unpair. |
| component | RemoteControlSection | `apps/web/features/desktop-host/components/RemoteControlSection.tsx` | Desktop 'Remote Control' pane: start, QR, disconnect. |
| service | bridgeServer | `apps/desktop/electron/browser/bridgeServer.ts` | Local pairing bridge: code, expiry, attempts, token. |
| command | browser_pairing_* commands | `apps/desktop/electron/runtime/dispatcher.ts` | browser_pairing_state, _install_host, _unpair (lines 3127-3133). |
| service | remoteControlService (desktop) | `apps/desktop/electron/remote/remoteControlService.ts` | Starts Remote Control, confirmation dialog, relay. |
| component | pairingWindow | `apps/desktop/electron/remote/pairingWindow.ts` | Window that shows the pairing code and QR. |
| config | browser-bridge constants | `packages/contracts/types/src/browser-bridge.ts` | PAIR_CODE_LENGTH, PAIR_REQUEST_TTL_MS, MAX_PAIR_CONFIRM_ATTEMPTS. |
| service | Extension pairing | `apps/extension/src/features/native-bridge/pairing.ts` | Request, confirm, store token, bind account, release. |
| endpoint | POST /api/pair/initiate | `apps/web/app/api/pair/initiate/route.ts` | Creates a Remote Control pairing for Desktop or VS Code. |
| endpoint | POST /api/pair/claim | `apps/web/app/api/pair/claim/route.ts` | Phone claims a pairing for its signed-in account. |
| endpoint | /api/pair/standing | `apps/web/app/api/pair/standing/route.ts` | Rechecks a live pairing against plan and policy. |
| service | remote-control-gate | `apps/web/lib/feature-flags/remote-control-gate.ts` | Workspace policy, plan and switch refusals. |
| service | signaling server | `services/signaling-server/src/pair-token.ts` | Relay that mints pair tokens and checks the account. |
| service | manualPairing | `apps/mobile/services/manualPairing.ts` | Parses QR or code, claims through the gateway. |
| service | dispatchHmac | `apps/mobile/lib/dispatchHmac.ts` | Per-session signing of phone commands. |
| store | connectionStore | `apps/mobile/stores/connectionStore.ts` | Phone connection and signed message handling. |
| config | mobile v1 feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | companion and dispatch switched off. |
| service | VS Code remote control | `apps/extension-vscode/src/features/remote-control/remoteControlService.ts` | Pairing request and phone confirmation in VS Code. |
| service | VS Code remote control panel | `apps/extension-vscode/src/features/remote-control/index.ts` | Status bar and QR webview. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Extension asks the local Desktop bridge for a pairing; Desktop creates a request id and an 8-character code and shows it only in a native dialog. | device | bridgeServer.ts:324-336; BrowserPairingSection.tsx:31 |
| Person types the code in the extension; the bridge compares it in constant time, counting failures. | device | bridgeServer.ts:338-360 |
| On match Desktop installs the native-host manifest, saves the pairing and returns a token and fingerprint; extension stores the token and binds the signed-in account. | device | bridgeServer.ts:365-379; pairing.ts:271-275 |
| Remote Control start on Desktop asks the gateway for a pairing (plan, policy and switch checked) and shows a QR. | device and our servers | RemoteControlSection.tsx; apps/web/app/api/pair/initiate/route.ts; remote-control-gate.ts:97-125 |
| Phone scans the QR, then calls /api/pair/claim with its session; the gateway asks the relay to mint a phone token for that account. | device and our servers | manualPairing.ts:165-200; claim/route.ts |
| Relay refuses if the pairing belongs to another account; Desktop shows a native confirmation naming the pairing code. | outside service | claim/route.ts comments; remoteControlService.ts:196-210 |
| Phone and Desktop exchange commands signed with a per-session HMAC key. | device | dispatchHmac.ts:18-30 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chrome pair token and fingerprint | Desktop pairing record and the extension's local storage (agi_paired_desktop) | No | Removed on Unpair; extension keeps a pending revocation until Desktop confirms (pairing.ts:197-235). |
| Pending pair request (id, code, attempts) | Desktop memory | No | Deleted on success, expiry or three failures. |
| Remote Control pairing and pair token | Signaling relay and the gateway's account record (relay storage not read) | Server side | Rechecked against plan and policy; ended when disallowed. |
| Phone connection state and signed-session key | Phone memory and secure storage (not read in detail) | No | Reconnects while Remote Control is on. |

**Models and providers.** No model or inference provider is involved in pairing. Once paired, tasks sent from a phone or Chrome run through the same chat pipeline as the desktop app (see SYS-agents-tools-and-automation).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chrome pairing to Desktop needs no account to start; the extension binds to the signed-in account if there is one. Phone pairing needs a signed-in phone on the same account as Desktop. |
| Permissions | The person must be at the computer (code or QR) and must confirm the phone in a native dialog. Workspace policy can disable Remote Control. |
| Subscription | Remote Control is a paid-plan capability: canUseBillingPlanCapability(plan, 'remote_control') (RemoteControlSection.tsx:51-53; remote-control-gate.ts:61-80). Chrome-to-Desktop pairing: no plan rule found. |
| Limits and metering | Pairing request life 120 s; 3 attempts; rate limit 'device-link' on claim; no usage metering found. |
| Feature flags | Mobile FEATURES.companion false and FEATURES.dispatch false; server Remote Control switch (remoteControlRefusal). |
| Model compatibility | Not applicable. |
| Provider restrictions | Phone pairing relays only through the first-party relay host or first-party hosts (apps/desktop/electron/config.ts:135-144). |
| Local mode | Chrome-to-Desktop pairing runs entirely on the computer. Phone pairing needs our servers and an account, so it is unavailable in account-free Local use. No payment is needed for Chrome pairing. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Bridge not listening | Pane says to quit and reopen Desktop. | BrowserPairingSection.tsx:23-24,168-172 |
| Host not registered | Pane offers 'Register the browser host again'. | BrowserPairingSection.tsx:21-22,157-162 |
| Pairing expired or wrong | Request deleted; error text shown in Chrome. | bridgeServer.ts:160-165,341-360 |
| Account changed | Extension rejects the old pairing for a different account. | pairing.ts:259-264,284 |
| Phone disconnected | 'Your phone disconnected. It reconnects on its own while Remote Control is on.' | RemoteControlSection.tsx:43-44 |
| Plan lacks Remote Control | Upgrade hint; server answers plan_upgrade_required. | RemoteControlSection.tsx:50; remote-control-gate.ts:68-80 |
| Plan unreadable | 'Your plan could not be checked, so Remote Control did not start. Try again.' | remote-control-gate.ts:55-66 |
| Old Desktop QR | 'This QR code was made by an older Desktop version...' | manualPairing.ts:29-30 |
| Relay unreachable | Claim returns 503 'Signaling server unavailable'. | claim/route.ts |
| Stop with consequence | Confirm dialog names that the phone can no longer follow or steer sessions. | RemoteControlSection.tsx:52-53 |
| Accessibility | Spinner aria-label 'Loading pairing state'; status text in aria-live regions. | BrowserPairingSection.tsx:118,132 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/desktop-host/__tests__/BrowserPairingSection.test.tsx`: Desktop Chrome pane.
- `apps/web/features/desktop-host/__tests__/RemoteControlSection.test.tsx`: Desktop Remote Control pane.
- `apps/web/features/desktop-host/__tests__/RemotePairingRefresh.test.tsx`: Pairing refresh.
- `apps/desktop/electron/__tests__/pairingWindow.test.ts`: Pairing window.
- `apps/extension/__tests__/pairing.test.ts`: Extension pairing logic.
- `apps/extension/__tests__/pairing-e2e.test.ts`: Pairing end to end in tests.
- `apps/extension/__tests__/pairing-transport.test.ts`: Pairing transport.
- `apps/extension/__tests__/desktop-pairing-proof.test.ts`: Proof of the Desktop pairing.
- `apps/web/app/api/pair/claim/__tests__/route.test.ts`: Claim route.
- `apps/web/app/api/pair/initiate/__tests__/route.audit.test.ts`: Initiate audit.
- `apps/web/app/api/pair/standing/__tests__/route.test.ts`: Standing recheck.
- `apps/web/app/api/pair/__tests__/remote-control-switch.test.ts`: Remote Control switch.
- `apps/mobile/__tests__/manual-pairing.test.ts`: Manual pairing parse and claim.
- `apps/mobile/__tests__/pairing-payload-contract.test.ts`: QR payload contract.
- `apps/mobile/__tests__/dispatchHmac.test.ts`: Signing.
- `apps/mobile/__tests__/CompanionPairingRecovery.test.tsx`: Companion pairing recovery.
- `services/signaling-server/__tests__/pair-token.test.ts`: Relay pair token.

**Test scenarios**

- **Chrome pair and unpair**
  1. Start Desktop, open Settings > Chrome.
  2. In the extension choose Connect to Desktop.
  3. Read the code in the Desktop dialog, type it.
  4. Press Unpair on Desktop.
  - Expected: Pane shows Paired and answering with fingerprint, then returns to the empty state; extension drops its pairing.
- **Wrong codes**
  1. Start pairing, type a wrong code three times.
  - Expected: 'Too many wrong codes. Start pairing again from Chrome.'
- **Expiry**
  1. Start pairing, wait over two minutes, type the right code.
  - Expected: 'No pairing request is waiting for that code.'
- **Cross-account phone**
  1. Pair on Desktop as account A.
  2. Sign the phone in as account B and claim.
  - Expected: 'belongs to a different account'; nothing connects.
- **Plan gate**
  1. Use a plan without Remote Control, press 'Pair a phone'.
  - Expected: Upgrade message and no pairing.
- **Mobile flag**
  1. Open Settings > Remote in the current phone build.
  - Expected: Unavailable notice (flags off).

**Where to look when it fails**

- Desktop console warning '[remote-control] could not show the pairing code'.
- Gateway log 'Pairing is unconfigured: SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET are both required' and 'Signaling server unreachable while claiming a pairing'.
- Log '[remote-control] plan unreadable; pairing refused'.
- Error codes pairing_not_found, pairing_role_in_use, pairing_belongs_to_another_account, plan_upgrade_required.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)
- VS Code: [70-qa/test-plans/vscode/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/vscode/003-authentication-and-onboarding-screens.md)
- Chrome: [70-qa/test-plans/chrome/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/chrome/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **Mobile pairing is built but switched off, so the brief's 'done' is not user-reachable.** Affects: Mobile.. Evidence: apps/mobile/lib/v1FeatureFlags.ts:8-16; settings/remote-control.tsx:131.. Work needed: Decide launch timing; update brief wording.
- **Draft says the code is typed on the phone; the code alone is no longer enough.** Affects: Mobile users and docs.. Evidence: apps/mobile/services/manualPairing.ts:36-37.. Work needed: Update help text to say scan the QR.
- **Chrome-to-Desktop pairing has no account requirement to start, only a binding afterwards.** Affects: Chrome and Desktop.. Evidence: pairing.ts:271-275 binds only when signed in.. Work needed: Confirm this matches 'bound to the signed-in account'.
- **Live verification of phone pairing across the relay is not recorded in any file.** Affects: Mobile, Desktop, VS Code.. Evidence: No run record found.. Work needed: Run the scenario on devices after the flags are on.

**Depends on**

- surface:desktop
- surface:chrome
- surface:mobile
- surface:vscode
- mode:local
- mode:cloud
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- api:POST /api/pair/claim
- api:POST /api/pair/initiate
- F003-08

## Unknown

- Where the relay stores pairings and their retention.
- Whether a plan rule applies to Chrome-to-Desktop pairing (none found).
- Which plans include Remote Control (read from the billing catalog, not opened).
- Exact Chrome label 'Connect to Desktop' in the extension locale file (only the Desktop text names it).
- Whether a live phone pairing has ever been run end to end.
