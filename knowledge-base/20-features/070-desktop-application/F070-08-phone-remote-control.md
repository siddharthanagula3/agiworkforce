---
id: "F070-08"
type: "feature"
title: "Phone remote control"
aliases: ["Remote Control", "Remote-host service", "Pair a phone", "Code remote control", "host.remote", "S70.22"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.22"]
depends_on: ["surface:desktop", "surface:mobile", "mode:cloud", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-authentication-and-identity", "api:POST /api/pair/initiate", "file:packages/platform/utils/src/remoteControl/remoteControlHost.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-08 Phone remote control

AGI Desktop can host Code sessions that a paired phone watches and steers. The user starts pairing in Settings, scans a code with the mobile app, and allows the phone in a native dialog on the computer. The phone can read sessions, send turns, interrupt and answer approvals, within approved folders. Paid plans only.

Area: [70. Desktop application](README.md). Requirement items: [S70.22](../../10-requirements/capabilities/070-desktop-application.md#s7022).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Relays coding sessions on the computer to a paired phone over an encrypted relay so the phone can read output and diffs, start or interrupt turns and answer the agent's questions and approval requests.

**Why it exists.** Long coding runs continue while the person is away; the phone lets them unblock the agent without returning to the desk.

**Who uses it.** Paid-plan developers using AGI Desktop Code sessions and the AGI mobile app.

**Problems it solves**

- An agent waiting for approval while the user is away
- Following a long run from the couch
- Starting a new session from the phone

**Use cases**

- Pair the phone, then approve a file edit from the phone
- Read a diff on the phone
- Send the next instruction to a running session
- Stop Remote Control from the computer

## 2. User experience

**Where to find it**

- surface:desktop: Settings > Capabilities > 'Remote Control' (apps/web/features/desktop-host/components/RemoteControlSection.tsx:37, mounted at apps/web/features/settings/sections/CapabilitiesSection.tsx:215).
- Pairing window with the QR code and buttons 'Refresh code' and copy (apps/desktop/electron/remote/pairingWindow.ts:21).
- 'Remote control' row under Settings > General > 'Running on this Mac' with Stop (BackgroundActivitySection.tsx:27).
- surface:mobile: the companion screen apps/mobile/app/(app)/companion/index.tsx is named by doc: docs/product/surface-feature-matrix.md (Remote control); its UI labels were not read.

**Before you start**

- Signed in on the desktop app.
- A paid plan: the server refuses pairing on a plan outside the paid set (apps/web/lib/feature-flags/remote-control-gate.ts:57-75; packages/contracts/types/src/billing-catalog.ts:332-352).
- At least one folder approved for the agent (remoteControlService.ts:73-80).
- Permission 'host.remote', described as 'Remote Control from a paired phone' (dispatcher.ts:1109; LocalAccessSection.tsx:83).

**Screens and controls**

- 'Pair a phone' (or 'Starting…') (RemoteControlSection.tsx:293).
- QR image with 'Enlarge pairing QR code' and 'Refresh pairing code' icon buttons, a 'Pairing code' chip, and 'Copy link for a browser' (RemoteControlSection.tsx:200-245).
- Status text: 'Connected to <phone> · N sessions open on the phone', 'Connection lost. Reconnecting so your phone can pick up where it left off.' (RemoteControlSection.tsx:49).
- 'Disconnect phone', 'Stop Remote Control' or 'Cancel pairing', with a confirm that says the phone can no longer follow or steer sessions (RemoteControlSection.tsx:55, :300-320).
- Native dialog 'Allow this phone?' with 'Cancel' and 'Allow this phone' (remoteControlService.ts:196-215).
- For risky approvals, a native dialog on the computer naming the phone (remoteControlService.ts:116-190).
- Free plan: 'Remote Control comes with paid plans.' with an Upgrade link (RemoteControlSection.tsx:50).

**Journey**

1. 1. Open Settings > Capabilities > Remote Control and press 'Pair a phone'.
2. 2. The page asks the server for a one-time code (POST /api/pair/initiate) and gives it to the desktop shell (remote-pairing.ts:28-47).
3. 3. A pairing window shows the QR code and code.
4. 4. On the phone open the mobile app's Code screen, choose Add device and scan.
5. 5. The computer shows 'Allow this phone?' with the code. Allow only if it is your phone.
6. 6. Status becomes connected; the phone lists sessions in approved folders.
7. 7. The phone reads, sends turns, interrupts and answers approvals; some approvals open a native dialog on the computer first.
8. 8. Stop with 'Disconnect phone'.

**What the person sees and gets**

- Connected state with the phone's name and number of open sessions.
- Messages to the phone for held approvals: 'This needs to be allowed at your computer. A dialog is open there now.', 'Nobody answered at your computer within two minutes...' (remoteControlService.ts:92-103).
- Errors in red, for example 'The relay connection failed.' (remoteControlHost.ts:600).

**Settings**

- Remote Control on/off by pairing or stopping.
- 'Menu bar' and 'Keep computer awake' are separate; a connected phone always holds the computer awake (workKeeper.ts:28).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Pairing: server creates a code and relay session; desktop host registers, shows QR, and waits (remoteControlHost.ts:640-668; initiate/route.ts:47-140).
- The user at the computer must allow the phone, unless the same phone identity and secret was already allowed in this session (remoteControlHost.ts:505-520). The allowed phone is remembered for this session only.
- Messages must be signed with the scanned secret; nothing is sent to a phone before a signed control verifies (remoteControlHost.ts:416-424; doc: docs/decisions/wire-or-cut.md:748).
- Sessions are listed and steered only for folders where the agent is allowed (remoteControlService.ts:73-80, :222-262).
- Credential files are never diffed for the phone (remoteControlService.ts:249).
- Approvals that main reserves need an allow at the computer, with a 120 s limit; a locked screen refuses (remoteControlService.ts:85, :132-137).
- Dropped relay: status 'reconnecting' with backoff, then back to 'waiting' (remoteControlHost.ts:602-632).
- Stop returns state to 'idle' and clears keys (remoteControlHost.ts:692-716).
- Relay revoke or expiry ends the pairing with a message (remoteControlHost.ts:588-598).
- Plan, workspace policy and kill switch checked on pairing (remote-control-gate.ts:97-123).

**Incomplete**

- The brief says the phone can ask to refresh pairing; the refresh request code originates on the computer's pairing window (remoteControlService.ts:289-300). A phone-initiated refresh was not found.

**Present but disconnected or switched off**

- Hidden in mobile v1 per owner decision recorded outside this repository's docs; not verified in code here.

**Not available**

- surface:web (the section renders only inside the desktop shell: RemoteControlSection.tsx useDesktopHost), surface:cli and surface:chrome: absent per doc: docs/product/surface-feature-matrix.md:562-570.
- surface:vscode has its own host (apps/extension-vscode/src/features/remote-control); not covered here.

## 4. Required behaviour

**Established requirements**

- The desktop app can act as a host that another device (phone) pairs with and drives remotely. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.22)
- The phone is asked again before it connects; if the computer is locked, remote control refuses; if the service stops, state shows stopped, not connected; a dropped connection is shown and the phone can ask to refresh pairing. (source: task brief for F070-08)
- Remote Control comes with paid plans only. (source: docs/product/definition.md:303)
- Authenticate device pairing, expose device-online state, expire grants, and distinguish local execution from cloud continuation. (source: docs/product/competitive-guidance.md:439)

**Acceptance criteria**

1. On a Free account, 'Pair a phone' is replaced by the paid-plan message and the server refuses with plan_upgrade_required.
2. Scanning the code makes 'Allow this phone?' appear on the computer; Cancel ends the session.
3. A phone allowed once can reconnect in the same session without a second question.
4. With the screen locked, an approval that needs the computer is refused with 'its screen is locked'.
5. Disconnect phone returns the section to 'Pair a phone' and the phone loses access.
6. Removing a folder makes its sessions vanish from the phone.
7. When the relay drops, 'Connection lost. Reconnecting...' shows and the state recovers when the relay returns.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'The phone is asked again' means the person at the computer is asked to allow it, because the dialog is on the computer (remoteControlService.ts:196).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Refuse starting or resuming any phone command while the screen is locked, not only reserved approvals.
- [proposed] Add a phone-initiated refresh request if the product still wants it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | remoteControlService | `apps/desktop/electron/remote/remoteControlService.ts` | Wires the host to sessions, approvals, folder checks, phone confirm dialog and state. |
| service | createRemoteControlHost | `packages/platform/utils/src/remoteControl/remoteControlHost.ts` | Pairing, relay client, phone trust, heartbeat, reconnect, stop. |
| service | codeRemoteController | `packages/platform/utils/src/remoteControl/codeRemoteController.ts` | Handles the phone's code.* controls. |
| component | pairingWindow | `apps/desktop/electron/remote/pairingWindow.ts` | Native window with the QR code, copy and refresh. |
| component | RemoteControlSection | `apps/web/features/desktop-host/components/RemoteControlSection.tsx` | Settings section and states. |
| service | remote-pairing | `apps/web/features/desktop-host/lib/remote-pairing.ts` | Asks the server for a pairing and starts the host; refresh. |
| hook | useRemotePairingRefresh | `apps/web/features/desktop-host/hooks/use-remote-pairing-refresh.ts` | Handles the 'remote-control-refresh-requested' event. |
| endpoint | POST /api/pair/initiate | `apps/web/app/api/pair/initiate/route.ts` | Creates the pairing at the signaling server after CSRF, rate limit and standing checks. |
| endpoint | /api/pair/claim and /api/pair/standing | `apps/web/app/api/pair/claim/route.ts` | Claim and live recheck of a pairing; standing route at apps/web/app/api/pair/standing/route.ts. |
| service | remote-control-gate | `apps/web/lib/feature-flags/remote-control-gate.ts` | Workspace policy, plan and switch refusal. |
| config | BILLING_PLAN_CAPABILITY_TIERS.remote_control | `packages/contracts/types/src/billing-catalog.ts` | Names the paid tiers allowed. |
| config | RemoteControlState contract | `packages/contracts/local-runtime/src/remote-control.ts` | Status values idle, waiting, connected, reconnecting, error. |
| command | remote_control_state / remote_control_start / remote_control_stop | `apps/desktop/electron/runtime/dispatcher.ts` | Runtime commands (line 2657-2662); host.remote capability at line 1109. |
| integration | signaling server | `services/signaling-server` | Relay between desktop and phone (directory listed; contents not read). |
| service | workKeeper | `apps/desktop/electron/workKeeper.ts` | Keeps the computer awake while a phone is connected. |
| service | backgroundActivity | `apps/desktop/electron/runtime/backgroundActivity.ts` | Lists and stops Remote Control from the background list. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page requests a pairing; the server checks CSRF, rate limit 'device-link', workspace policy, plan and kill switch. | our servers | apps/web/app/api/pair/initiate/route.ts:47-68 |
| Server asks the signaling service to create a pairing and returns code, relay address and desktop token. | our servers | initiate/route.ts:69-140 |
| Desktop host opens a WebSocket to the relay (address must pass the allowlist) and shows the QR code. | device and our servers | remoteControlService.ts:227; remoteControlHost.ts:640-690 |
| Phone connects; the computer asks the user to allow it; controls are verified with the scanned secret. | device | remoteControlHost.ts:470-530 |
| Phone commands run against local sessions through the AGI CLI; session events are relayed back. | device | remoteControlService.ts:222-262, :461 |
| The relay carries messages between the two devices. | our servers | remoteControlHost.ts:39 heartbeat 25 s |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pairing code, secret and keys | Memory in the desktop host; cleared on stop | Code and token exist at the relay; storage there unknown | Cleared by stop() (remoteControlHost.ts:692-716) |
| Allowed phone name and identity | Memory for this session only | No | Forgotten on stop; not persisted |
| Session output, diffs and approvals | Local AGI CLI session store on the device | Sent to the phone through the relay while paired | Per CLI retention; unknown |
| Device registry and heartbeat | Server tables not named in files read | Yes | unknown |

**Models and providers.** The relay is model neutral. The coding agent in the session uses whatever model the session selected; Remote Control itself calls no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required to create a pairing (initiate/route.ts:51-61). |
| Permissions | Capability 'host.remote' on the computer; per-folder agent permission for sessions the phone may reach (remoteControlService.ts:73-80); a native allow for each new phone. |
| Subscription | Paid plans only: basic, pro, max, max_15x, team, team_premium and enterprise are allowed; Free is refused with 403 plan_upgrade_required (billing-catalog.ts:332-352; remote-control-gate.ts:57-75). If the plan cannot be read, pairing is refused with 503. |
| Limits and metering | Rate limit key 'device-link' (initiate/route.ts:63). Approval wait 120 s. No usage metering found. |
| Feature flags | Governed by the screen-share kill switch (remote-control-gate.ts:19-32) and workspace feature gate 'remote_control' (remote-control-gate.ts:104-111). |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code |
| Local mode | Remote Control is a device feature that sends session data off the device to a paired phone through the managed relay, so it needs the cloud account; it does not require a local or own-key model. Free plan is refused. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Idle | 'Pair a phone' button | RemoteControlSection.tsx:293 |
| Loading | Spinner 'Loading Remote Control' | RemoteControlSection.tsx:152 |
| Waiting | QR and code; 'Cancel pairing' | RemoteControlSection.tsx:158-250 |
| Phone left | Back to waiting; allowed phone can reconnect without a second question | remoteControlHost.ts:574-581, :505 |
| Relay drop | 'reconnecting' with exponential backoff; if never registered, ends with 'Pair again' | remoteControlHost.ts:602-632 |
| Locked screen | Approvals needing the computer are refused | remoteControlService.ts:132-137 |
| No window to ask in | Refused: no window could be opened there to ask | remoteControlService.ts:144-150 |
| Timeout | Nobody answered within two minutes; the agent keeps waiting | remoteControlService.ts:85, :95-97 |
| Revoked | 'Remote Control was turned off for this computer in your account settings.' | remoteControlHost.ts:588-592 |
| Old phone build | 'The phone runs an older AGI Mobile build. Update the app, then pair again.' | remoteControlHost.ts:400-405 |
| Sleep | Computer is kept awake while connected | workKeeper.ts:28 |
| App quit | Quit guard lists Remote Control before quitting | quitGuard.ts:20-40 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/remoteControlService.test.ts`: Folder gating, locked screen, 120 s expiry, held approvals, pairing refresh
- `apps/desktop/electron/__tests__/remoteControlHost.test.ts`: Pairing, confirmation, signed controls, reconnect, stop, relay allowlist
- `apps/desktop/electron/__tests__/pairingWindow.test.ts`: Pairing window
- `apps/desktop/electron/__tests__/codeRemoteController.test.ts`: Phone control handling
- `apps/desktop/electron/__tests__/remoteDispatchEnvelope.test.ts`: Signed dispatch envelope
- `apps/web/features/desktop-host/__tests__/RemoteControlSection.test.tsx`: Section states
- `apps/web/features/desktop-host/__tests__/RemotePairingRefresh.test.tsx`: Refresh handling
- `apps/web/app/api/pair/__tests__/remote-control-switch.test.ts`: Kill switch on pairing
- `apps/web/app/api/pair/__tests__/standing-recheck-policy.test.ts`: Live recheck policy

**Test scenarios**

- **Pair and allow**
  1. Sign in on a paid plan
  2. Press Pair a phone
  3. Scan with mobile
  4. Allow this phone
  - Expected: Status shows Connected to <phone>
- **Free plan**
  1. Sign in on Free
  2. Open Remote Control
  - Expected: Paid plans message and Upgrade link; no Pair button
- **Locked approval**
  1. Connect
  2. Lock the screen
  3. Answer a reserved approval from the phone
  - Expected: Phone gets 'its screen is locked' refusal
- **Stop**
  1. Connect
  2. Press Disconnect phone and confirm
  - Expected: State idle; phone loses access; background list no longer shows it
- **Relay outage**
  1. Connect
  2. Block the relay
  - Expected: 'Connection lost. Reconnecting...' then recovery
- **Folder removed**
  1. Connect
  2. Remove the folder in Local access
  - Expected: Its sessions disappear for the phone

**Where to look when it fails**

- Console '[remote-control]' warnings (remoteControlService.ts)
- RemoteControlRefused and RemoteCommandRefused messages
- Telemetry domain list has no remote domain; desktop-telemetry.ndjson
- Server log 'Pairing is unconfigured' (initiate/route.ts:72)

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **Brief says a phone can ask to refresh pairing; only a computer-side refresh was found** Affects: surface:desktop, surface:mobile. Evidence: remoteControlService.ts:289-300; use-remote-pairing-refresh.ts:20. Work needed: Confirm the mobile behaviour or add a phone request
- **Lock check covers only approvals that need confirming at the computer** Affects: surface:desktop. Evidence: remoteControlService.ts:132. Work needed: Decide whether other phone commands should also refuse when locked
- **Phone-side behaviour and labels were not read** Affects: surface:mobile. Evidence: apps/mobile/app/(app)/companion/index.tsx named only in docs/product/surface-feature-matrix.md. Work needed: Document mobile separately

**Depends on**

- surface:desktop
- surface:mobile
- mode:cloud
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-authentication-and-identity
- api:POST /api/pair/initiate
- file:packages/platform/utils/src/remoteControl/remoteControlHost.ts

## Unknown

- Mobile screen labels and behaviour
- Server tables for pairings and device registry: none named in files read
- Relay retention of pairing data (services/signaling-server not read)
- Backoff constants for reconnect
- Whether Remote Control is shown in mobile v1
