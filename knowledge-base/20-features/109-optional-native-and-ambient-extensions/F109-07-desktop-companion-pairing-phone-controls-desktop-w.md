---
id: "F109-07"
type: "feature"
title: "Desktop companion pairing (phone controls desktop work)"
aliases: ["Remote Control", "Remote", "Pair a phone", "Pair a computer", "Companion", "Desktop companion", "Dispatch (phone-sent tasks)", "remote_control capability", "agiw: / agiw3: pairing QR"]
area: "109 Optional native and ambient extensions"
available_on: ["desktop", "mobile", "vscode"]
implementation: {web: "n/a", desktop: "built", mobile: "built", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S109.04"]
depends_on: ["surface:desktop", "surface:web", "surface:mobile", "surface:vscode", "mode:cloud", "plan:basic", "plan:pro", "plan:max", "plan:team", "plan:enterprise", "api:POST /api/pair/initiate", "api:POST /api/pair/claim", "table:device_registrations", "file:apps/desktop/electron/remote/remoteControlService.ts", "file:apps/web/lib/feature-flags/remote-control-gate.ts", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-sync-and-continuity", "SYS-agents-tools-and-automation"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-07 Desktop companion pairing (phone controls desktop work)

Remote Control lets a paid account pair a phone with a computer running AGI Desktop (or the AGI VS Code extension). The phone then follows coding sessions, reads diffs and answers the agent's approval requests. The computer owner must allow each phone. The phone side is switched off in the current mobile build.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.04](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10904).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** The computer (Desktop app, or VS Code) asks our server for a short-lived pairing code and QR code. The phone scans it and claims the pairing through the same server. A relay then carries messages between the two. The phone can list coding sessions on the computer, start or interrupt a turn, read the working-tree diff and answer approval and question prompts [inferred from the host callbacks: listSessions, startTurn, interruptTurn, answerApproval, answerQuestion, readDiff, startSession] (apps/desktop/electron/remote/remoteControlService.ts:219-262).

**Why it exists.** A person who starts a long coding task on a computer wants to leave the desk and still unblock the agent from a phone. The brief states that a desktop companion pairs with the phone so desktop work can be started, watched or approved from it (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md, S109.04).

**Who uses it.** Paying users who run coding sessions in AGI Desktop or the VS Code extension and own the phone app. Free accounts are refused (packages/contracts/types/src/billing-catalog.ts:352).

**Problems it solves**

- The agent stops and waits for an approval while the person is away from the computer.
- No way to see how a long coding session is going from a phone.
- Needing to be at the computer to send the next instruction.

**Use cases**

- Start Remote Control on Desktop, scan the QR code with the phone, and approve a file change from the sofa.
- Watch a test run and read the diff on the phone while the computer works.
- Pair the VS Code extension so the phone gets a push when a session needs approval or finishes (apps/extension-vscode/src/features/remote-control/remoteControlService.ts:141-152).

## 2. User experience

**Where to find it**

- Web (inside the Desktop app window, which shows the hosted web app): Settings, Capabilities section, block headed 'Remote Control'. It renders only when the page runs inside the desktop host and the host supports it (apps/web/features/desktop-host/components/RemoteControlSection.tsx:37, :166-171; apps/web/features/settings/sections/CapabilitiesSection.tsx).
- Desktop: a separate window titled 'Pair a phone' shows the QR code, the code text, 'Copy code' and 'Refresh code' (apps/desktop/electron/remote/pairingWindow.ts:14-22).
- VS Code: command 'agi-workforce.remoteControl' (start or show), 'agi-workforce.stopRemoteControl', 'agi-workforce.copyRemoteControlLink', plus a status bar item (apps/extension-vscode/src/features/remote-control/index.ts:10-12, :139).
- Mobile (hidden in this build): Settings, group 'Remote control', row 'Connections' opens the 'Remote control' screen; the companion screen is under app/(app)/companion. The group renders only when the companion flag is true and it is false (apps/mobile/src/features/settings/index.tsx:750-767; apps/mobile/lib/v1FeatureFlags.ts:16).

**Before you start**

- Signed in to an account on a paid plan (basic, pro, max, max_15x, team, team_premium, enterprise) (packages/contracts/types/src/billing-catalog.ts:332-353).
- The screen-share kill switch open and the workspace policy for remote control allowing it (apps/web/lib/feature-flags/remote-control-gate.ts:23-52, :97-110).
- Desktop or VS Code running on the computer with at least one approved folder; a phone is only given folders the agent is already allowed to run in (apps/desktop/electron/remote/remoteControlService.ts:66-79).
- A phone with the companion build. Not available in the current shipped mobile build (apps/mobile/lib/v1FeatureFlags.ts:12,16).

**Screens and controls**

- Web section: 'Pair a phone' button (label shows 'Starting…' while busy), QR image with 'Enlarge pairing QR code' and 'Refresh pairing code' icon buttons, the 'Pairing code' text, a copy-link button for browser pairing, and a stop button labelled 'Cancel pairing', 'Disconnect phone' or 'Stop Remote Control' depending on state (apps/web/features/desktop-host/components/RemoteControlSection.tsx:199-316).
- Free account text: 'Remote Control comes with paid plans.' with an upgrade link (RemoteControlSection.tsx:50, :274-276).
- Desktop dialog 'Allow this phone?' with buttons 'Cancel' and 'Allow this phone' and the pairing code in the detail (remoteControlService.ts:196-217).
- Desktop approval dialog for reserved approvals sent from the phone (remoteControlService.ts:116-194).
- Mobile screens when enabled: QR scanner, 'Pair a computer', 'Open Remote', 'Reconnect', 'Disconnect' (apps/mobile/app/(app)/settings/remote-control.tsx:156-167).

**Journey**

1. 1. On Desktop (web settings page) or VS Code, the person presses 'Pair a phone'.
2. 2. The app asks the server to create a pairing (POST /api/pair/initiate with initiator desktop) and gets a 12-character code, an expiry and a private token (apps/web/features/desktop-host/lib/remote-pairing.ts:34-60).
3. 3. Desktop opens the 'Pair a phone' window with the QR code and the code.
4. 4. On the phone, the person scans the QR code in the companion screen. The phone claims the pairing through POST /api/pair/claim (apps/mobile/services/manualPairing.ts:165).
5. 5. The computer shows 'Allow this phone?' with the pairing code. The person confirms only if it is the phone they just used.
6. 6. The phone lists sessions, opens one, sends a prompt or answers approvals.
7. 7. If the agent needs an allow that the computer reserves, the computer opens a dialog and the phone is told to wait; the person has two minutes to answer there.
8. 8. The person stops Remote Control (Disconnect phone, Stop Remote Control or Cancel pairing) to end it.

**What the person sees and gets**

- Status shown on web: pairing code and QR while waiting; reconnecting spinner with 'Connection lost. Reconnecting so your phone can pick up where it left off.'; text after a phone disconnects (RemoteControlSection.tsx:44, :49).
- Refusal messages come from the server body: plan upgrade message, 'Your plan could not be checked, so Remote Control did not start. Try again.', 'Pairing is not configured' (503) (apps/web/lib/feature-flags/remote-control-gate.ts:54-55; apps/web/app/api/pair/initiate/route.ts:69-80).
- Held-approval messages to the phone, for example 'This needs to be allowed at your computer. A dialog is open there now.' (remoteControlService.ts:90-100).
- Confirm dialog for disconnecting names the consequence: 'The phone is disconnected from this computer and can no longer follow or steer its sessions.' (RemoteControlSection.tsx:52-53, :305).

**Settings**

- Mobile 'Follow-up behavior': 'Queue' (send after the current turn) or 'Steer' (stop the current turn and send now) (apps/mobile/app/(app)/settings/remote-control.tsx:30-33).
- Pairing time to live: request field ttlSeconds, 30 to 900 seconds, default 300 (apps/web/app/api/pair/initiate/route.ts:20-27). No visible control for it was found.
- Web admin: workspace policy 'remote_control' and kill switch 'screen_share' (packages/contracts/types/src/feature-registry.json:175-198).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server creates a pairing through the signaling relay after rate limit, workspace policy, plan and kill-switch checks; records audit event 'remote_pairing_initiated' (apps/web/app/api/pair/initiate/route.ts:63-175).
- Claim route for the phone exists and binds the pairing to the same account (apps/web/app/api/pair/claim/route.ts:35-47).
- Desktop Electron host: pairing window drawn by the main process so the secret never reaches the page, phone confirmation dialog, per-folder access check, held approvals with a 120 second limit and a locked-screen refusal (apps/desktop/electron/remote/pairingWindow.ts:60-66; remoteControlService.ts:85, :116-194).
- VS Code extension starts its own pairing as the 'desktop' side, confirms the phone in a modal dialog and posts session activity so the phone gets a push (apps/extension-vscode/src/features/remote-control/remoteControlService.ts:87-100, :141-168).
- Web section handles loading, pairing, refresh, copy link, reconnecting and stop (RemoteControlSection.tsx:67-170).

**Incomplete**

- The pairing code is 12 characters (PAIRING_CODE_LENGTH), not 6, and the code alone cannot secure the link: the phone must scan the QR code (apps/mobile/services/manualPairing.ts:26; packages/contracts/types/src/pairing.ts:52). The first-draft description said 6 characters; that is wrong.
- The brief cites DrawerContent.tsx:130 as a mobile entry point; line 130 is a list of drawer items for projects and Code, and the only companion reference in that file is a path match at line 585 (apps/mobile/src/features/drawer/components/DrawerContent.tsx:585). No visible companion entry point was found there.

**Present but disconnected or switched off**

- Mobile companion and dispatch feature flags are both false, so the settings group, the companion screens and background tasks are off, and pairing deep links are not enabled in the app config (apps/mobile/lib/v1FeatureFlags.ts:12,16; apps/mobile/app.config.js:31-32, :344).
- Mobile screens return 'FeatureUnavailable' when the flag is off (apps/mobile/app/(app)/settings/remote-control.tsx:131; apps/mobile/app/(app)/companion/index.tsx:183).

**Not available**

- Web in a normal browser: the section renders nothing outside the desktop host (RemoteControlSection.tsx:166-167). Pairing from a browser uses a copied link, which is a different path.
- CLI and Chrome extension: no pairing code found (searched apps/cli and apps/extension; not opened in full) [unknown beyond the brief's n/a status].
- No code path in mobile calls POST /api/pair/initiate; the route accepts initiator 'mobile' by default but no caller was found (apps/web/app/api/pair/initiate/route.ts:22-28; grep of apps/mobile for api/pair found only claim).

## 4. Required behaviour

**Established requirements**

- A desktop companion pairs with the user's phone so desktop work can be started, watched or approved from the phone. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.04)
- A pairing is refused when the screen-share switch is closed, the plan is not paid, or the plan cannot be read, and the refusal says why. (source: apps/web/lib/feature-flags/remote-control-gate.ts:23-110)
- A pairing is rechecked while live, so it does not outlive the reasons that would have refused it. (source: apps/web/lib/feature-flags/remote-control-gate.ts:86-96; apps/web/app/api/pair/standing/route.ts)
- Revoking a pairing must take effect on the next request, and the controlled device must show that it is being controlled for as long as it is. (source: packages/contracts/types/src/feature-registry.json:175-198 (exitCriteria))
- The Remote Control feature is experimental, requires a desktop host, and is gated by entitlement 'developer_surfaces' and policy 'remote_control'. (source: packages/contracts/types/src/feature-registry.json:175-198)

**Acceptance criteria**

1. A free account pressing 'Pair a phone' (or calling POST /api/pair/initiate) gets a refusal with the paid-plan message and no code is created.
2. A paid account gets a code, expiry and QR; the code expires after 300 seconds by default, and a ttlSeconds outside 30 to 900 is rejected with 400.
3. With the screen-share switch closed, pairing is refused with the switch's message.
4. The computer shows 'Allow this phone?' with the pairing code before any session is shared; choosing 'Cancel' keeps the phone out.
5. An approval that the computer reserves is not applied until the computer owner allows it; after 120 seconds with no answer the phone is told nobody answered and the agent keeps waiting.
6. 'Stop Remote Control' or 'Disconnect phone' ends the link and the phone can no longer read sessions.
7. With companion and dispatch flags false, no Remote control row or companion screen is reachable in the mobile build.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The phone side can only be accepted when the mobile flags are turned on in a future build; until then no end-to-end pairing with a real phone is possible in the shipped build [inferred].
- A phone is limited to folders the agent may already run in on the computer [inferred from remoteRefusal].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the remaining validity time of the code in the Desktop pairing window.
- [proposed] Add a list of paired phones with a revoke button on the web settings page, not only a single Disconnect action.
- [proposed] Decide and record whether pairing in Local mode is allowed at all, since it needs our servers.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/pair/initiate | `apps/web/app/api/pair/initiate/route.ts` | Creates a pairing at the signaling relay after CSRF, auth, rate limit, policy and plan checks; returns code, expiry, QR text, relay URLs and the initiator's token. |
| endpoint | POST /api/pair/claim | `apps/web/app/api/pair/claim/route.ts` | The phone's half: claims a pairing code for the signed-in account. |
| endpoint | /api/pair/standing | `apps/web/app/api/pair/standing/route.ts` | Relay's recheck of whether a live pairing is still allowed. |
| service | remoteControlStandingRefusal / remoteControlPlanRefusal | `apps/web/lib/feature-flags/remote-control-gate.ts` | Workspace policy, plan tier and kill-switch decision with final or retry-later answer. |
| config | remote_control plan capability (paid tiers) | `packages/contracts/types/src/billing-catalog.ts` | Lists the plan tiers allowed to use Remote Control and the upgrade message. |
| config | remote_control feature registry entry | `packages/contracts/types/src/feature-registry.json` | Maturity, host, kill switch, entitlement and policy gates. |
| component | RemoteControlSection | `apps/web/features/desktop-host/components/RemoteControlSection.tsx` | Settings block with pair, refresh, copy link, stop and plan messages. |
| service | remote-pairing client | `apps/web/features/desktop-host/lib/remote-pairing.ts` | Calls /api/pair/initiate with initiator desktop and hands the result to the Desktop host. |
| service | Electron remote control service | `apps/desktop/electron/remote/remoteControlService.ts` | Configures the host, confirms phones, holds reserved approvals for 120 seconds, relays session events. |
| component | Pairing window | `apps/desktop/electron/remote/pairingWindow.ts` | Script-free window that draws the QR code, Copy code and Refresh code. |
| service | Remote control host library | `packages/utils (export ./remote-control: src/remoteControl/remoteControlHost.ts, codeRemoteController.ts, sessionEvents.ts)` (not found) | Shared host logic used by Desktop and VS Code. |
| config | Remote control state contract | `packages/contracts/local-runtime/src/remote-control.ts` | RemoteControlState statuses, start request and idle state. |
| service | VS Code remote control | `apps/extension-vscode/src/features/remote-control/remoteControlService.ts` | Requests a pairing as the desktop side, confirms the phone, posts session activity. |
| command | agi-workforce.remoteControl and related commands | `apps/extension-vscode/src/features/remote-control/index.ts` | Registers start, stop and copy-link commands and the status bar. |
| service | Mobile manual pairing | `apps/mobile/services/manualPairing.ts` | Parses agiw: and agiw3: payloads and claims the pairing. |
| screen | Companion screen | `apps/mobile/app/(app)/companion/index.tsx` | Phone-side scanner, status views, disconnect confirmation; gated by flags and plan. |
| screen | Remote control settings | `apps/mobile/app/(app)/settings/remote-control.tsx` | Connection summary, Reconnect, Disconnect, follow-up behaviour. |
| store | connectionStore | `apps/mobile/stores/connectionStore.ts` | Phone connection state; isDispatchCompanionEnabled needs both flags. |
| config | Mobile feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | companion and dispatch are false. |
| service | Signaling relay | `services/signaling-server/src/index.ts` | Creates and claims pairings, ttl 30 to 900 seconds, default from SIGNALING_PAIRING_TTL. |
| table | device_registrations (remote_enabled) | `apps/web/db/neon/0207_device_registrations.sql` | Initiate sets remote_enabled true when the desktop starts a pairing. |
| event | remote_pairing_initiated audit event | `apps/web/app/api/pair/initiate/route.ts` | Workspace audit record of each pairing start. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses 'Pair a phone'; the web page in Desktop posts to /api/pair/initiate with initiator desktop. | device | apps/web/features/desktop-host/lib/remote-pairing.ts:34-60 |
| Server checks CSRF, sign-in, rate limit ('device-link'), workspace policy, plan and kill switch. | our servers | apps/web/app/api/pair/initiate/route.ts:63-67; apps/web/lib/feature-flags/remote-control-gate.ts:97-110 |
| Server calls the signaling relay (SIGNALING_HTTP_URL, secret SIGNALING_INTERNAL_SECRET) to mint code and tokens; 10 second timeout; refuses non-secure relay URLs. | our servers | apps/web/app/api/pair/initiate/route.ts:69-125 |
| Server marks the device remote_enabled and writes an audit event, then returns code, expiry, QR text and the desktop token. | our servers | apps/web/app/api/pair/initiate/route.ts:148-175 |
| Desktop host opens a WebSocket to the relay, draws the QR in a script-free window and waits. | device | apps/desktop/electron/remote/remoteControlService.ts:230-243; pairingWindow.ts:60-66 |
| Phone claims the pairing through /api/pair/claim; server asks the relay to mint the mobile token only for the same account. | our servers | apps/web/app/api/pair/claim/route.ts:35-47, :100-110 |
| Computer asks 'Allow this phone?'; if allowed, the phone's session requests are served after a per-folder check. | device | apps/desktop/electron/remote/remoteControlService.ts:196-217, :66-79 |
| Messages between phone and computer flow through the relay; the agent runs on the computer with its own configured model. | device and our servers | remoteControlService.ts:219-262; model choice for the coding session is outside this feature [unknown] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pairing code, expiry and short-lived tokens | Relay memory or storage (not opened) and the Desktop host process; QR drawn only in the main process | Not synced; sent to the relay | Expires after ttlSeconds (default 300); ended by Stop; the relay's retention rule is unknown |
| Audit event remote_pairing_initiated | Workspace audit log in our database | Server side only | Retention rule not read (unknown) |
| device_registrations.remote_enabled flag | table device_registrations | Server side | Set true by a Desktop-initiated pairing; set false by 'Stop remote work' elsewhere [inferred from the code comment at route.ts:142-143] |
| Session content, diffs and approvals relayed to the phone | On the computer; copy in phone memory while connected | Passes through the relay | Phone state reset on forget pairing (apps/mobile/stores/connectionStore.ts:256-259) |

**Models and providers.** Remote Control carries no model choice. It relays a coding session that the computer's agent runs; which model or provider that session uses is decided in the Desktop or VS Code session, not here (apps/desktop/electron/remote/remoteControlService.ts:219-262). Pairing itself needs our servers and so is not available in pure Local mode.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account is required on the web and computer side (apps/web/app/api/pair/initiate/route.ts:46-60); the phone claim also needs the same account (apps/web/app/api/pair/claim/route.ts:35-47). |
| Permissions | The computer owner must allow each phone in a dialog; the phone reaches only folders the agent is approved for; allows reserved by the computer need a second dialog; credential paths are removed from diffs (apps/desktop/electron/remote/remoteControlService.ts:66-79, :255-258). |
| Subscription | Capability remote_control is allowed on the paid tiers basic, pro, max, max_15x, team, team_premium and enterprise; free is refused with code plan_upgrade_required (packages/contracts/types/src/billing-catalog.ts:332-353; apps/web/lib/feature-flags/remote-control-gate.ts:57-80). The feature registry also names entitlement developer_surfaces (feature-registry.json:175-198). |
| Limits and metering | Rate limit bucket 'device-link' on initiate; code lifetime 30 to 900 seconds; approval confirmation 120 seconds. No usage metering or credit use for pairing was found in the code (apps/web/app/api/pair/initiate/route.ts:63-107). |
| Feature flags | Mobile flags companion and dispatch (both false). Kill switch 'screen_share'. Workspace policy 'remote_control'. Environment names SIGNALING_HTTP_URL, SIGNALING_INTERNAL_SECRET, SIGNALING_PAIRING_TTL (names only). |
| Model compatibility | Not applicable; no model is chosen by this feature. |
| Provider restrictions | None found in the code. |
| Local mode | Pairing needs our server and the relay, so it does not work offline or in a Local-only setup. The computer's own agent may still run on a local model; whether the relay works for such a session was not verified [unknown]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web section shows a spinner labelled 'Loading Remote Control' until the host state is read. | RemoteControlSection.tsx:175 |
| Free plan | Server returns 403 with plan_upgrade_required; web shows 'Remote Control comes with paid plans.' and an upgrade link. | remote-control-gate.ts:57-80; RemoteControlSection.tsx:274-276 |
| Plan unreadable | 503 'Your plan could not be checked, so Remote Control did not start. Try again.' and a live pairing is only held, not ended. | remote-control-gate.ts:54-55, :86-96 |
| Relay not configured or down | 503 'Pairing is not configured' or 'Signaling server unavailable'; bad relay reply gives 502. | initiate/route.ts:69-80, :112-125 |
| Code expiry | Code expires (default 300 s). Refresh code stops and starts a new pairing; the Desktop window offers 'Refresh code' and tells the person to open the app if it is closed. | remote-pairing.ts:62-65; pairingWindow.ts:19-21 |
| Phone declined or unnamed | Dialog shows 'an unnamed phone' when no name is sent and cuts names to 80 characters. | remoteControlService.ts:21-30 region, :196-205 |
| Approval timeout | After 120 seconds the phone is told nobody answered and the agent keeps waiting. | remoteControlService.ts:85, :90-100, :150-152 |
| Screen locked | A reserved allow is refused with 'its screen is locked. Unlock it and answer again.' | remoteControlService.ts:132-135 |
| Network loss | Web shows 'Reconnecting' text; the phone reconnects by itself while Remote Control is on. | RemoteControlSection.tsx:44, :49 |
| Accessibility | Buttons carry aria-labels; status text uses aria-live polite. | RemoteControlSection.tsx:202-261 |
| App differences | Desktop draws its own pairing window; VS Code uses a modal dialog; mobile phone side is off in this build. | pairingWindow.ts; remoteControlService.ts (vscode):87-100; v1FeatureFlags.ts:16 |
| Older Desktop QR | The phone shows 'This QR code was made by an older Desktop version...' and asks to update. | apps/mobile/services/manualPairing.ts:23 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/pair/initiate/__tests__/route.audit.test.ts`: Initiate route audit behaviour (named by file; contents not opened).
- `apps/web/app/api/pair/claim/__tests__/route.test.ts`: Claim route (named by file; contents not opened).
- `apps/web/app/api/pair/standing/__tests__/route.test.ts`: Standing recheck route (named by file; contents not opened).
- `apps/web/app/api/pair/__tests__/remote-control-switch.test.ts`: Kill switch behaviour for pairing (by name).
- `apps/web/app/api/pair/__tests__/standing-recheck-policy.test.ts`: Recheck policy (by name).
- `apps/web/features/desktop-host/__tests__/RemoteControlSection.test.tsx`: Web settings section (by name).
- `apps/desktop/electron/__tests__/remoteControlService.test.ts`: Desktop service (by name).
- `apps/desktop/electron/__tests__/pairingWindow.test.ts`: Pairing window (by name).
- `apps/desktop/electron/__tests__/remoteControlHost.test.ts`: Host library (by name).
- `apps/extension-vscode/src/__tests__/remoteControlStartCancellation.test.ts`: VS Code start cancellation (by name).
- `apps/mobile/__tests__/RemoteCompanion.test.tsx`: Mobile companion (by name).
- `apps/mobile/__tests__/manual-pairing.test.ts`: Mobile pairing payload parsing (by name).
- `services/signaling-server/__tests__/http/pairings.test.ts`: Relay pairing HTTP routes (by name).
- `packages/contracts/local-runtime/src/__tests__/remote-control.test.ts`: State contract (by name).

**Test scenarios**

- **Free account is refused**
  1. Sign in with a free account in the Desktop app.
  2. Open Settings, Capabilities, Remote Control.
  3. Look at the section; call POST /api/pair/initiate.
  - Expected: Message 'Remote Control comes with paid plans.' with an upgrade link; API returns 403 with code plan_upgrade_required; no code is created.
- **Paid pairing and confirmation**
  1. Use a paid account in Desktop with an approved folder.
  2. Press 'Pair a phone'.
  3. Use a test client to claim the code (the mobile build has the flag off).
  - Expected: 'Pair a phone' window shows QR and code; dialog 'Allow this phone?' appears with the code; choosing 'Allow this phone' lets sessions be listed.
- **Code expiry and ttl bounds**
  1. Call initiate with ttlSeconds 10, then 901, then 300.
  2. Wait past expiry and claim.
  - Expected: First two return 400; third succeeds; claim after expiry fails.
- **Held approval times out**
  1. Pair, trigger an approval that the computer reserves, answer from the phone.
  2. Leave the computer dialog unanswered for 120 seconds.
  - Expected: Phone receives the 'Nobody answered at your computer within two minutes' message; agent still waits.
- **Kill switch**
  1. Close the screen_share switch.
  2. Press 'Pair a phone'.
  - Expected: Pairing refused with the switch's message.
- **Mobile hidden**
  1. Open the shipped mobile build, Settings.
  - Expected: No 'Remote control' group; opening the route shows the unavailable notice.

**Where to look when it fails**

- Server log lines: 'Pairing is unconfigured: SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET are both required', 'Signaling server unreachable while creating a pairing', '[remote-control] plan unreadable; pairing refused'.
- Desktop console warnings prefixed '[remote-control]'.
- Workspace audit events remote_pairing_initiated and remote_pairing_claimed; table device_registrations.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/desktop/109-optional-native-and-ambient-extensions.md)
- Mobile: [70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md)
- VS Code: [70-qa/test-plans/vscode/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/vscode/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **Phone side is switched off, so the feature cannot be used end to end in the shipped build.** Affects: Mobile users and the Desktop/VS Code owners who pair.. Evidence: apps/mobile/lib/v1FeatureFlags.ts:12,16. Work needed: Decide the release, turn on both flags, then run the full pairing on a real phone.
- **The brief says mobile is 'done' for S109.04 but the flags are false; the brief's DrawerContent citation is not a companion entry.** Affects: Anyone reading the brief status.. Evidence: area brief S109.04; DrawerContent.tsx:130, :585. Work needed: Correct the brief status to hidden.
- **No list of paired phones or per-phone revoke was found; only Stop or Disconnect.** Affects: Users with more than one phone.. Evidence: RemoteControlSection.tsx:296-316. Work needed: Add device list and revoke if required.
- **No evidence the revoke 'takes effect on the next request' as the registry requires; only the standing recheck route exists.** Affects: All paired users.. Evidence: feature-registry.json:175-198; apps/web/app/api/pair/standing/route.ts. Work needed: Verify with a live test.
- **No Chrome or CLI initiator; Chrome and CLI are n/a in the brief.** Affects: CLI and Chrome users.. Evidence: area brief status. Work needed: None unless product wants it.

**Depends on**

- surface:desktop
- surface:web
- surface:mobile
- surface:vscode
- mode:cloud
- plan:basic
- plan:pro
- plan:max
- plan:team
- plan:enterprise
- api:POST /api/pair/initiate
- api:POST /api/pair/claim
- table:device_registrations
- file:apps/desktop/electron/remote/remoteControlService.ts
- file:apps/web/lib/feature-flags/remote-control-gate.ts
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-sync-and-continuity
- SYS-agents-tools-and-automation

## Unknown

- Contents of the listed test files were not opened, so what they assert is unknown.
- Relay storage and retention of pairing data (services/signaling-server) was not read in depth.
- The key exchange and message encryption between phone and computer were not read.
- How the phone's push notification is delivered (postCodeSessionActivity target path) was not traced.
- Whether an unreachable mobile Settings entry exists beyond the flag-hidden group is unknown.
