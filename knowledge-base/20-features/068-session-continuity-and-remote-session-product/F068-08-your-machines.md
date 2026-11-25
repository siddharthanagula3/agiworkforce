---
id: "F068-08"
type: "feature"
title: "Your machines"
aliases: ["Your machines", "Your computers", "Linked devices", "Computers on your account", "Account computers", "Remote computer page", "Your computer (/code/computer)", "agi devices", "S68.19", "S68.20", "S68.21", "S68.25"]
area: "68 Session continuity and remote-session product"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "missing", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S68.19", "S68.20", "S68.21", "S68.25"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "api:GET /api/settings/devices", "api:POST /api/devices/heartbeat", "api:DELETE /api/settings/devices/{deviceId}", "table:device_registrations", "table:desktop_devices", "table:mobile_devices", "table:device_refresh_tokens", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "SYS-api-and-contracts", "F068-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-08 Your machines

Shows the person which of their computers (Desktop app, command line, VS Code) are signed in to the account, with name, platform, online/asleep/offline status and what each reports it can do. Web and phone render cards; the command line prints a list. Offline explanations exist only in a few places. The phone card is switched off in v1.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.19](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6819), [S68.20](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6820), [S68.21](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6821), [S68.25](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6825).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reads the account's device registry from one web route and presents it per app: web settings 'Linked devices', web page 'Your computer' (computers that can take tasks), phone 'Your computers' card, and the command line 'agi devices'. Each row shows name, kind, platform, presence and the capabilities the device reported at its last heartbeat. [apps/web/app/api/settings/devices/route.ts:66-117; apps/web/features/settings/components/LinkedDevicesPanel.tsx:49-118; apps/mobile/src/features/companion/components/AccountComputersCard.tsx:20-57; apps/cli/src/cloud/devices.rs:50-103]

**Why it exists.** The person must know which machines can run sessions before sending work, and why one cannot be used (S68.19-S68.21, S68.25). (doc: area brief 068)

**Who uses it.** Any signed-in person with more than one machine; support and testers checking device state. [inferred]

**Problems it solves**

- Not knowing if the desktop is on before sending a task.
- Not knowing what a machine can host (browser, computer use, local models, local tools, remote control).
- Old or lost devices still holding a sign-in (Unlink).

**Use cases**

- Open Settings, Account, 'Linked devices' to see every app signed in and unlink one.
- Open /code/computer to see which Desktop computers take tasks, and which need an update.
- On the phone, tap an online computer to pair, or the connected computer to start a session.
- Run 'agi devices --json' in a script to read device presence.

## 2. User experience

**Where to find it**

- Web: Settings, Account section, panel 'Linked devices' [apps/web/features/settings/sections/AccountSection.tsx:45,629; LinkedDevicesPanel.tsx:374]. Page 'Your computer', section 'Computers on your account' at /code/computer [apps/web/app/code/computer/page.tsx; RemoteComputerPage.tsx:33-37]. Desktop app: the same hosted web pages inside the Electron window (doc: AGENTS.md section 5, 'The public Desktop shows the hosted web app') [inferred for these screens].
- Phone: card 'Your computers' on the Remote screen [AccountComputersCard.tsx:165]; the screen is hidden in v1 [apps/mobile/lib/v1FeatureFlags.ts:12,16; apps/mobile/app/(app)/companion/index.tsx:183]. The card also needs the cloud waitlist unlock (cloudUnlocked) [AccountComputersCard.tsx:152].
- Command line: 'agi devices [--json]' [apps/cli/src/lib.rs:1098-1104,7765]. VS Code: no machine list (brief: missing; not searched in code).

**Before you start**

- Signed in to the account on the viewing app.
- A computer app signed in and sending heartbeats to be listed with presence and capabilities [apps/web/app/api/devices/heartbeat/route.ts:21-81].
- Phone: Cloud unlocked through the waitlist store [AccountComputersCard.tsx:92,152].

**Screens and controls**

- Web 'Linked devices': one row per device with name, system line ('Desktop app · version · macOS ...'), state line ('Online · Signed in · Last seen ...'), capability line ('Can use Browser, Computer use, ...' or 'No local capabilities'); buttons 'Rename' and 'Unlink'; collapsed group 'Signed out (n)' [LinkedDevicesPanel.tsx:76-118,242-450].
- Web 'Your computer': list 'name · online/asleep/offline' with ' · update Desktop on it to send tasks' for a computer that does not accept tasks [RemoteComputerPage.tsx:38,64-68,329-340].
- Phone 'Your computers': rows with name, 'Desktop app · platform · arch', capability line ('Remote control · Browser · Computer use · Local models · Local MCP' or 'Remote control off') and badge 'Online', 'Asleep', 'Offline' or 'Connected'; refresh button 'Refresh your computers' [AccountComputersCard.tsx:20-57,162-276].
- Command line: lines '<name> <kind>, <platform arch>, <state>; can host a, b' [apps/cli/src/cloud/devices.rs:81-118].

**Journey**

1. 1. Person opens the list on their app.
2. 2. The app fetches the account's devices (GET /api/settings/devices).
3. 3. Rows are shown with presence and capabilities; phone shows a spinner first, then rows, an empty text or a failure text.
4. 4. Person may refresh, rename or unlink (web), pair or start (phone), or read the line (command line).

**What the person sees and gets**

- Empty web list: 'No app is linked to this account.' [LinkedDevicesPanel.tsx:424].
- Empty phone list: 'No computer is signed in to this account yet. Install AGI Desktop on a computer and sign in there.' [AccountComputersCard.tsx:192-195].
- Empty command line: 'No devices are registered to your account yet. Each AGI app you sign in to appears here.' [devices.rs:81-86].
- Load failure: web 'Unable to load linked devices.' with 'Try again'; phone 'Your computers could not be loaded.' or 'Could not refresh. This is the list from your last successful load.' [LinkedDevicesPanel.tsx:156-160; AccountComputersCard.tsx:178-203].
- Offline explanation: web page 'Your computer went offline. This page reconnects when it is back.' (only after a connection was made) [RemoteComputerPage.tsx:46]; phone session screen 'Remote access stops while the computer is asleep, offline, or has AGI Desktop closed...' [apps/mobile/app/(app)/companion/code/[threadId].tsx:19-20]. The cards themselves show only the word Offline.

**Settings**

- Web: rename a device (name 1-120 characters) [apps/web/app/api/settings/devices/[deviceId]/route.ts:306-330].
- Web: 'Unlink' confirmation text explains credentials are revoked [LinkedDevicesPanel.tsx:330-340].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/settings/devices returns up to 200 devices with presence computed from last seen time and capabilities from the registry row [apps/web/app/api/settings/devices/route.ts:16,66-117,189-240; packages/contracts/cloud-contracts/src/device-registry.ts:198-211].
- Presence windows: desktop online within 2x45 s + 30 s of last heartbeat; others 2x5 min + 60 s; asleep up to 30 days; else offline [device-registry.ts:8-23].
- Desktop reports capabilities browser, computerUse, localMcp and remoteControl; localModels is fixed false [apps/desktop/electron/runtime/dispatcher.ts:2286-2301].
- Command line reports remote_control while its host runs and lists devices with 'can host ...' [apps/cli/src/device_registry.rs:168,203; apps/cli/src/cloud/devices.rs:50-103].
- Web settings panel with rename, unlink, signed-out group, retry [LinkedDevicesPanel.tsx].
- Web 'Your computer' lists only Desktop (Electron) computers and flags those that do not accept tasks [RemoteComputerPage.tsx:93-111].
- Phone card lists desktop, command line and VS Code devices only [apps/mobile/src/features/device-registry/computers.ts:5,26-55].

**Incomplete**

- Offline explanation is not on the cards: web settings and command line show only a state word [LinkedDevicesPanel.tsx:49-53; devices.rs:64-73].
- Legacy device rows (desktop_devices, mobile_devices, sign-in grants) carry no capabilities; the web shows no capability line and the command line prints 'does not report what it can host' [route.ts:200-233; devices.rs:95].
- Web 'Your computer' shows 'No computer with Desktop is linked' also when the list fetch fails [RemoteComputerPage.tsx:142-155].

**Present but disconnected or switched off**

- Phone 'Your computers' card is unreachable in v1 because the Remote screen is flagged off [apps/mobile/lib/v1FeatureFlags.ts:12,16; companion/index.tsx:183].

**Not available**

- VS Code: no machine list (brief; no code searched to the contrary).
- A 'code sessions' item in the advertised capability list: the registry has five capabilities only (browser, computerUse, localModels, localMcp, remoteControl) [apps/cli/src/cloud/devices.rs:7-18]; 'code-sessions' is advertised only in the pairing metadata [packages/platform/utils/src/remoteControl/remoteControlHost.ts:681].
- Chrome extension: not applicable.

## 4. Required behaviour

**Established requirements**

- The user sees which of their machines are available to run sessions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S68.19)
- Each remote machine appears as a card with name, platform and status. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S68.20)
- Each machine advertises what it can host (local models, browser, MCP, computer use, code sessions). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S68.21)
- When the machine is offline, the client says so and explains what that means. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S68.25)
- Owned device listing and revocation use the current session scope; browser pairing pages never claim the browser completed a pairing. (source: doc: docs/product/experience-contract.md:798 (row W25))
- Remote is Cloud only on the phone; in Local it is not shown. (source: doc: docs/decisions/2026-11-13-founder-decisions.md:96-99)

**Acceptance criteria**

1. A computer signed in on the account appears with its name, platform and a status within one heartbeat.
2. A computer that stopped heartbeating shows 'Offline' after the presence window; one quit Desktop reads online for at most about two minutes.
3. The capability line lists exactly the capabilities the device reported.
4. An offline computer is not offered as a pairing or start target on the phone (row inert).
5. The list survives a failed refresh: old rows stay with a message.
6. Unlinking a device removes the row only on success.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Capability 'localModels' for Desktop should reflect real local inference when it exists, since local inference on desktop is a product requirement; the code reports false [inferred from dispatcher.ts:2298].
- Offline help should appear wherever the word Offline appears [inferred from S68.25].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add one shared sentence for each presence state and show it under the card on web, phone and command line.
- [proposed] Add 'code sessions' as a reported capability in the registry contract.
- [proposed] Show a distinct error state on /code/computer instead of the empty-list message.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/settings/devices | `apps/web/app/api/settings/devices/route.ts` | Lists registry rows, sign-in grants and legacy rows with presence and capabilities. |
| endpoint | DELETE/PATCH/POST /api/settings/devices/[deviceId] | `apps/web/app/api/settings/devices/[deviceId]/route.ts` | Unlink, rename, and 'stop-remote-work' for one device. |
| endpoint | POST /api/devices/heartbeat | `apps/web/app/api/devices/heartbeat/route.ts` | Devices report presence and capabilities; remote_enabled can only be turned off by this path (line 21,43). |
| schema | device-registry contract | `packages/contracts/cloud-contracts/src/device-registry.ts` | Presence windows, heartbeat intervals, surfaces list, capability shape. |
| table | device_registrations | `apps/web/app/api/settings/devices/route.ts` | Main registry table read by REGISTRY query (lines 66-85); also desktop_devices, mobile_devices and device_refresh_tokens. |
| component | LinkedDevicesPanel | `apps/web/features/settings/components/LinkedDevicesPanel.tsx` | Web cards: name, system, state, capabilities, rename, unlink. |
| screen | AccountSection | `apps/web/features/settings/sections/AccountSection.tsx` | Mounts LinkedDevicesPanel (line 629). |
| screen | RemoteComputerPage | `apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx` | Web 'Your computer' list and task sending; AWAY message. |
| screen | /code/computer route | `apps/web/app/code/computer/page.tsx` | Route entry for RemoteComputerScreen. |
| service | describeDeviceForRegistry (Desktop) | `apps/desktop/electron/runtime/dispatcher.ts` | Builds the capability report sent with the heartbeat (2286-2301). |
| service | CLI device registry | `apps/cli/src/device_registry.rs` | Heartbeat with capabilities; remote_control flag set by Remote Control (168,203). |
| service | CLI devices list | `apps/cli/src/cloud/devices.rs` | Fetches and prints the list; hosts() builds the 'can host' text. |
| command | agi devices | `apps/cli/src/lib.rs` | Command definition (1098-1104) and handler (3452-3464). |
| service | listAccountComputers | `apps/mobile/src/features/device-registry/computers.ts` | Phone fetch and filter to desktop, cli, vscode rows. |
| component | AccountComputersCard | `apps/mobile/src/features/companion/components/AccountComputersCard.tsx` | Phone 'Your computers' card with presence badges and actions. |
| screen | Code session screen offline view | `apps/mobile/app/(app)/companion/code/[threadId].tsx` | Offline and unpaired explanation (19-22). |
| service | device revocation propagation | `apps/web/lib/device-steps/device-registry.ts` | Stops remote work and tells the relay when a device is unlinked (198-234). |
| test | LinkedDevicesPanel tests | `apps/web/features/settings/components/__tests__/LinkedDevicesPanel.test.tsx` | Panel behaviours. |
| test | AccountComputersCard tests | `apps/mobile/__tests__/AccountComputersCard.test.tsx` | Phone card behaviours. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Each computer app sends a periodic heartbeat with its name, platform and capabilities (Desktop every 45 s, others every 5 minutes). | device and our servers | packages/contracts/cloud-contracts/src/device-registry.ts:5-17; apps/web/app/api/devices/heartbeat/route.ts:21-81 |
| The server stores the row and sets remote_enabled (it can only fall back to off through heartbeat). | our servers | apps/web/app/api/devices/heartbeat/route.ts:21-43 |
| A viewing app asks for the list; the server runs three queries, computes presence from last seen time and returns up to 200 devices. | our servers | apps/web/app/api/settings/devices/route.ts:189-240 |
| The app renders cards; the phone keeps only desktop, command line and VS Code rows; web 'Your computer' keeps only Electron Desktop rows. | device | apps/mobile/src/features/device-registry/computers.ts:26-55; RemoteComputerPage.tsx:93-111 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Device registry rows: name, surface, OS, version, capability booleans, remote_enabled, last_seen_at | table:device_registrations (with table:desktop_devices, table:mobile_devices, table:device_refresh_tokens read alongside) | Yes, server is the single copy; apps read it. | Row deleted on Unlink [apps/web/app/api/settings/devices/[deviceId]/route.ts:116-135]; retention otherwise unknown. |
| Phone's loaded list | In memory in the card (useState) | No | Dropped when the account changes [AccountComputersCard.tsx:125-132]. |

**Models and providers.** None. No model or provider takes part in listing machines. The 'localModels' flag is a reported fact, not a route.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required for every app; route resolves the session principal [apps/web/app/api/settings/devices/route.ts:193]. Command line uses its signed-in account and Managed mode [apps/cli/src/lib.rs:3452-3456]. |
| Permissions | Only the account's own devices are listed (query by user id, route.ts:83). Rename and unlink need CSRF and rate limit 'settings-session-revoke' [devices/[deviceId]/route.ts:60-66]. |
| Subscription | Listing: none found in the code. The remote-control capability flag in a row only means the device runs Remote Control; using it needs a paid plan (F068-09). |
| Limits and metering | Up to 200 devices; list rate limit 'settings-sessions-list' [route.ts:16,190]. |
| Feature flags | Phone card hidden by FEATURES.companion and the cloud waitlist unlock [AccountComputersCard.tsx:152; v1FeatureFlags.ts:16]. |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code. |
| Local mode | Needs an account, so it is not available in Local mode on the phone (doc: docs/decisions/2026-11-13-founder-decisions.md:96-99); the command line needs Managed mode [apps/cli/src/cloud/client.rs:368-372]. [inferred for web: needs sign-in] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web: two skeleton rows; phone: spinner; web 'Your computer': spinner. | LinkedDevicesPanel.tsx:385-393; AccountComputersCard.tsx:184; RemoteComputerPage.tsx:319-320 |
| Empty | Plain sentence per app (see feedback). | LinkedDevicesPanel.tsx:424; AccountComputersCard.tsx:192 |
| Load error | Web shows message and Try again; phone shows message, keeps old list if any; web 'Your computer' shows the empty text (error not distinguished). | LinkedDevicesPanel.tsx:395-420; AccountComputersCard.tsx:178-203; RemoteComputerPage.tsx:149-151 |
| Offline row | Phone row is inert (no pairing or start); web shows the word only. | AccountComputersCard.tsx:229-235; LinkedDevicesPanel.tsx:49-53 |
| Asleep | Labelled 'Sleeping' on web, 'Asleep' on phone and command line (different words for one state). | LinkedDevicesPanel.tsx:51; AccountComputersCard.tsx:22; devices.rs:67 |
| Two computers with the same name | Phone marks neither as connected and explains why. | AccountComputersCard.tsx:140-145,204-224 |
| Account change | Phone drops the old list and ignores a late response. | AccountComputersCard.tsx:109-132 |
| Computer does not accept tasks | Web 'Your computer' appends 'update Desktop on it to send tasks'. | RemoteComputerPage.tsx:38,107,335 |
| Accessibility | Phone rows have labels '<name>, <status>' and hints; web buttons have aria-labels. | AccountComputersCard.tsx:236-252; LinkedDevicesPanel.tsx:322-326 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/components/__tests__/LinkedDevicesPanel.test.tsx`: Lists linked device and credential state; folds signed-out group; empty text; unlink with CSRF drops row only on success; retry on load failure; capability line; rename (it() titles).
- `apps/mobile/__tests__/AccountComputersCard.test.tsx`: Pair by scanning; offline rows inert; start on connected computer; same-name rows; failed refresh keeps list; account change drops list.
- `apps/web/app/api/settings/devices/__tests__/route.test.ts`: Device list route (contents not read).
- `apps/web/app/api/settings/devices/__tests__/device-registry.schema.test.ts`: Registry schema (contents not read).
- `apps/web/features/remote-dispatch/components/__tests__/RemoteComputerPage.test.tsx`: Web computer page (contents not read).
- `apps/web/lib/device-steps/__tests__/device-registry.test.ts`: Revocation propagation and stale revoke (contents not read).
- `apps/cli/src/device_registry.rs`: Inline test: heartbeat serializes in the registry contract shape. devices.rs has no inline test.

**Test scenarios**

- **Presence flip**
  1. Sign Desktop in and wait for one heartbeat.
  2. Quit Desktop.
  3. Reload web 'Linked devices' after 3 minutes.
  - Expected: Row moves from Online to Sleeping or Offline according to the window.
- **Capabilities shown**
  1. Run Desktop with computer use enabled.
  2. Open Linked devices.
  - Expected: Capability line includes Computer use; Local models absent.
- **Command line list**
  1. Run 'agi devices' and 'agi devices --json'.
  - Expected: Same devices as the web; text includes state and 'can host'.
- **Fetch failure**
  1. Block /api/settings/devices.
  2. Open /code/computer.
  - Expected: Observe whether an error or the 'No computer' text appears (code shows the empty text).
- **Phone offline row**
  1. In a test build with companion on, open 'Your computers' with an offline computer.
  - Expected: Row shows Offline and does nothing when tapped.

**Where to look when it fails**

- Server logs 'Linked device unlinked' (devices/[deviceId]/route.ts:158-168).
- Heartbeat route errors and device_registrations.last_seen_at values.
- CLI: 'agi devices' error text from CloudError.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md)
- Desktop: [70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md)
- Mobile: [70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md)
- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **Offline is a word, not an explanation, on web settings, web list and the command line.** Affects: Web, Desktop (hosted web) and command line users. Evidence: LinkedDevicesPanel.tsx:49-53; devices.rs:64-73; explanation exists only at RemoteComputerPage.tsx:46 and apps/mobile/app/(app)/companion/code/[threadId].tsx:19-20. Work needed: Add the explanation next to the status on every list.
- **Desktop always reports localModels false.** Affects: All clients reading capabilities. Evidence: apps/desktop/electron/runtime/dispatcher.ts:2298. Work needed: Report real local inference availability once Desktop hosts it (unknown today).
- **Registry has no 'code sessions' capability; S68.21 asks for it.** Affects: All clients. Evidence: apps/cli/src/cloud/devices.rs:7-18; packages/contracts/cloud-contracts/src/device-registry.ts. Work needed: Extend the capability contract and each heartbeat.
- **Brief says command line 19, 20 and 25 are missing, but 'agi devices' lists name, platform, state and hosts; the offline explanation is missing.** Affects: Command line users, brief accuracy. Evidence: apps/cli/src/lib.rs:1098-1104,3452-3464. Work needed: Update the brief; add the explanation.
- **Different words for the same state (Sleeping, Asleep).** Affects: Consistency. Evidence: LinkedDevicesPanel.tsx:51; AccountComputersCard.tsx:22. Work needed: One shared label table.
- **/code/computer hides a fetch failure behind the empty message.** Affects: Web users. Evidence: RemoteComputerPage.tsx:149-151. Work needed: Add an error state.
- **Phone card unreachable in v1.** Affects: Mobile users. Evidence: apps/mobile/lib/v1FeatureFlags.ts:12,16. Work needed: Flag decision after live check.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- api:GET /api/settings/devices
- api:POST /api/devices/heartbeat
- api:DELETE /api/settings/devices/{deviceId}
- table:device_registrations
- table:desktop_devices
- table:mobile_devices
- table:device_refresh_tokens
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- SYS-api-and-contracts
- F068-09

## Unknown

- Whether VS Code has any machine list (brief says missing; not searched in code).
- Whether the Desktop app shows these screens exactly like web (assumed from the hosted-web rule in AGENTS.md section 5).
- Data retention of device rows after unlink beyond the delete shown.
- Whether Local-mode Desktop users appear in the list (heartbeat needs sign-in; not traced).
- Whether the Chrome extension registers as a device row (DEVICE_SURFACES includes chrome; not traced).
