---
id: "F004-08"
type: "feature"
title: "Devices and remote sessions"
aliases: ["Linked devices", "Devices", "Account computers", "Remote devices (S4.21)", "Remote-session viewer (S4.22)", "Companion", "Remote", "agi devices", "device registry"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S4.21", "S4.22"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "api:GET /api/settings/devices", "api:POST /api/devices/heartbeat", "table:device_registrations", "table:device_refresh_tokens", "SYS-authentication-and-identity", "SYS-sync-and-continuity", "SYS-security-and-privacy", "F004-07"]
basis: "code inspection"
second_reader: "7 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-08 Devices and remote sessions

Lists the apps and computers signed in to the account (desktop, CLI, VS Code, Chrome, mobile) with online state, signed-in state, last seen and capabilities, and lets the person rename or unlink each. A phone viewer for a session running on another device exists but is switched off in the current mobile build.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.21](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s421), [S4.22](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s422).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows every linked device from a server registry, lets the owner rename a device or unlink it (revoking its credentials), and on mobile can follow a coding session on a paired computer. (apps/web/features/settings/components/LinkedDevicesPanel.tsx:100) (apps/mobile/src/features/companion/remote-code/service.ts:33)

**Why it exists.** So the person can see where the account is signed in and cut off a lost or unused device, as the leaders' account pages do. [inferred]

**Who uses it.** Any signed-in person with more than one app installed; security-minded users after losing a device.

**Problems it solves**

- Cannot tell which devices still hold a live sign-in.
- Cannot remove a lost laptop.
- Cannot tell if a computer is online for remote work.

**Use cases**

- Web: open Settings > Account and unlink an old laptop.
- Web: rename 'MacBook' to 'Work laptop'.
- Terminal: agi devices --json to list devices.
- Phone (when enabled): open a coding session running on the desktop and send guidance.

## 2. User experience

**Where to find it**

- Web (and Desktop through the hosted web app): Settings > Account, heading 'Linked devices' (apps/web/features/settings/sections/AccountSection.tsx:629) (apps/web/features/settings/components/LinkedDevicesPanel.tsx:370).
- CLI: agi devices (apps/cli/src/lib.rs:1100).
- Mobile: Devices section on the AGI Code list and the Remote screen under /(app)/companion; both are hidden when FEATURES.companion is false (apps/mobile/src/features/cloud-code/components/CodeDevicesSection.tsx:181) (apps/mobile/lib/v1FeatureFlags.ts:17).
- VS Code and Chrome: not available.

**Before you start**

- Signed-in account.
- For mobile remote viewing: FEATURES.companion and FEATURES.dispatch true, a paired computer, and a plan with remote control (apps/mobile/app/(app)/companion/index.tsx:108).

**Screens and controls**

- Web rows show name, surface and version, platform, then state: Online, Sleeping or Offline, 'Signed in' or 'Signed out', 'Last seen', 'Linked', and a capability line such as 'Can use Browser, Computer use' (apps/web/features/settings/components/LinkedDevicesPanel.tsx:101).
- Buttons 'Rename' (with 'Save' and 'Cancel') and 'Unlink'; signed-out devices are grouped under 'Signed out (N)'.
- Empty text 'No app is linked to this account.'; load error with 'Try again'.
- Mobile rows: device name plus 'Connected', 'Connecting', 'Reconnecting' or 'Not connected'; pill to add a device (apps/mobile/src/features/cloud-code/components/CodeDevicesSection.tsx:22).

**Journey**

1. Open Settings > Account.
2. Read the list under 'Linked devices'.
3. To rename, press Rename, edit, press Save (PATCH).
4. To unlink, press Unlink; a confirmation dialog titled 'Unlink <device>?' explains the device is signed out and its stored credentials are revoked and must be linked again from the device.
5. After confirm the row disappears; an error shows 'Unable to unlink this device.'

**What the person sees and gets**

- Inline alert for load, rename and unlink errors with the server message filtered for users.
- Buttons show 'Saving...' and 'Unlinking...' while working.
- CLI prints a table or JSON (apps/cli/src/cloud/devices.rs:76).

**Settings**

- Remote Control hidden in the mobile v1 build per the flag file (apps/mobile/lib/v1FeatureFlags.ts:17).
- 'Stop remote work' effect appears on unlink (apps/web/app/api/settings/devices/__tests__/route.stop-remote-work.test.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web list from GET /api/settings/devices merging the device registry, desktop and mobile legacy tables and device sign-in grants (apps/web/app/api/settings/devices/route.ts:113).
- Rename (PATCH) and unlink (DELETE) with CSRF, UUID check and credential revocation (apps/web/app/api/settings/devices/[deviceId]/route.ts:60).
- Unlink asks first and names what stops working (apps/web/features/settings/components/LinkedDevicesPanel.tsx:332).
- Heartbeat endpoint registers and refreshes devices (apps/web/app/api/devices/heartbeat/route.ts).
- CLI agi devices lists devices with presence and hosting capabilities, with JSON output (apps/cli/src/lib.rs:3452). The brief says CLI missing; the code has it.

**Incomplete**

- CLI cannot rename or unlink; only list (apps/cli/src/lib.rs:1100).
- Presence for sign-in grants without a registration is null, so such rows show no online state (apps/web/app/api/settings/devices/route.ts:213).

**Present but disconnected or switched off**

- Mobile Devices section returns null when FEATURES.companion is false (apps/mobile/src/features/cloud-code/components/CodeDevicesSection.tsx:181).
- Mobile Remote screens show a FeatureUnavailable view when companion is false (apps/mobile/app/(app)/companion/index.tsx:183) (apps/mobile/app/(app)/companion/code/[threadId].tsx:81).
- The mobile remote viewer (attach, steer, interrupt, history) exists but is not reachable in this build (apps/mobile/src/features/companion/remote-code/service.ts:33).

**Not available**

- Remote-session viewer on web, desktop, CLI, VS Code, Chrome: not present (brief S4.22).
- Device management on VS Code and Chrome: none found.
- Pairing a new device from the web list: not present; the person links from the device itself (apps/web/features/settings/components/LinkedDevicesPanel.tsx:336).

## 4. Required behaviour

**Established requirements**

- A devices destination lists linked devices with status and last activity and lets the owner manage (rename, unlink, pair) them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.21)
- A viewer opens a session on another of the user's devices with live transcript and controls. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.22)
- An action a user cannot undo asks first and names the consequence. (source: (doc: AGENTS.md section 9))
- Remote Control is hidden in mobile v1 and review accounts need password sign-in. (source: (doc: owner memory, owner-product-decisions))

**Acceptance criteria**

1. Each row shows device type, platform, online state, signed in or out and last seen.
2. Unlink shows a dialog naming that the device is signed out, credentials revoked and it must relink; cancel leaves it.
3. After unlink the device no longer appears and its refresh credentials are revoked.
4. Rename rejects an empty name with 'Give the device a name.'
5. A failed load shows 'Unable to load linked devices.' and a retry.
6. Devices of another account never appear.
7. With companion flag off, mobile shows no Devices section.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Only the owner may list or change a device row, since every query filters on user_id (apps/web/app/api/settings/devices/route.ts:74). [inferred]
- Presence windows differ for desktop (apps/../packages/contracts/cloud-contracts/src/device-registry.ts:207). [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add agi devices rename and unlink so CLI matches web.
- [proposed] Give sign-in-only rows a presence once their client heartbeats.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LinkedDevicesPanel | `apps/web/features/settings/components/LinkedDevicesPanel.tsx` | List, rename and unlink UI. |
| screen | AccountSection | `apps/web/features/settings/sections/AccountSection.tsx` | Hosts the panel under Settings > Account. |
| endpoint | GET /api/settings/devices | `apps/web/app/api/settings/devices/route.ts` | Lists devices from registry, legacy tables and sign-in grants. |
| endpoint | PATCH/DELETE /api/settings/devices/[deviceId] | `apps/web/app/api/settings/devices/[deviceId]/route.ts` | Rename and unlink with revocation. |
| endpoint | POST /api/devices/heartbeat | `apps/web/app/api/devices/heartbeat/route.ts` | Upserts device registration and last seen. |
| service | device-registry | `apps/web/lib/device-steps/device-registry.ts` | propagateDeviceRevocation and registry logic. |
| schema | device-registry contract | `packages/contracts/cloud-contracts/src/device-registry.ts` | Presence windows, device types, rename schema. |
| table | device_registrations | `apps/web/db/neon/0207_device_registrations.sql` | Registry of linked devices. |
| table | device_refresh_tokens | `apps/web/app/api/settings/devices/route.ts` | Credential families deciding signed in or out. |
| table | desktop_devices / mobile_devices | `apps/web/app/api/settings/devices/route.ts` | Legacy device tables still listed. |
| command | agi devices | `apps/cli/src/cloud/devices.rs` | CLI list with JSON option. |
| service | device registry (mobile) | `apps/mobile/src/features/device-registry/computers.ts` | Lists account computers; heartbeat sender alongside. |
| component | CodeDevicesSection | `apps/mobile/src/features/cloud-code/components/CodeDevicesSection.tsx` | Mobile Devices rows, hidden behind companion flag. |
| screen | Companion index | `apps/mobile/app/(app)/companion/index.tsx` | Remote screen and pairing. |
| screen | Remote code session | `apps/mobile/app/(app)/companion/code/[threadId].tsx` | Mobile remote session viewer. |
| service | remote-code service | `apps/mobile/src/features/companion/remote-code/service.ts` | Sends attach, detach, steer, interrupt, start, history over the paired control channel. |
| config | FEATURES | `apps/mobile/lib/v1FeatureFlags.ts` | companion and dispatch set false. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Settings panel fetches GET /api/settings/devices. | device and our servers | apps/web/features/settings/components/LinkedDevicesPanel.tsx:150 |
| Server runs registry, legacy and sign-in grant queries for the user and computes presence from last seen. | our servers | apps/web/app/api/settings/devices/route.ts:196 |
| The CLI and the desktop app post heartbeats that upsert the registration (on user_id, surface, install_id) and last seen time; the route needs a user-scoped DB, CSRF and a schema-valid body. Heartbeats from mobile, VS Code and Chrome were not found, so that every client app posts them is unverified. | device and our servers | apps/web/app/api/devices/heartbeat/route.ts:21-60; apps/cli/src/device_registry.rs |
| Unlink first propagates revocation to live sessions and remote work (registered devices only, outside the transaction). Then, in one transaction, it revokes the device's refresh credentials and deletes the device_registrations, mobile_devices and desktop_devices rows. | our servers | apps/web/app/api/settings/devices/[deviceId]/route.ts:77-135 |
| Mobile remote viewing sends control messages through the paired connection store to the computer; the computer hosts the session. | device and our servers | apps/mobile/src/features/companion/remote-code/service.ts:11 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Device registration (surface, name, OS, version, capabilities, last seen, credential family) | table device_registrations | Read from the server by every app | Deleted on unlink (apps/web/app/api/settings/devices/[deviceId]/route.ts:112) |
| Refresh credentials | table device_refresh_tokens | server only | Revoked on unlink; a lost flag marks them compromised (device_lost), and a logoutAll flag revokes all mobile intent tokens [apps/web/app/api/settings/devices/[deviceId]/route.ts:50-54,100-110] |

**Models and providers.** No model or provider takes part in listing, renaming or unlinking. Remote viewing relays a session whose model is chosen on the host computer; not read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; web needs a session principal (apps/web/app/api/settings/devices/route.ts:195). |
| Permissions | Rows are filtered by the user's id; unlink needs CSRF and a rate limit bucket (apps/web/app/api/settings/devices/[deviceId]/route.ts:58). |
| Subscription | Listing and unlinking: none found in the code. On mobile, a client-side plan check on capability remote_control (paid tiers: basic, pro, max, max_15x, team, team_premium, enterprise) hides the Remote screen from non-paid tiers, but only once the tier has loaded, no pairing code is held, and the status is not connected, stale or reconnecting. No server gate was found (apps/mobile/app/(app)/companion/index.tsx:99-107,185) (packages/contracts/types/src/billing-catalog.ts:332-340,352). |
| Limits and metering | The merged list is capped at 200 devices in total, and each source query is also limited to 200 (apps/web/app/api/settings/devices/route.ts:16,85,130,175,234); name length DEVICE_NAME_MAX_LENGTH. No usage metering found. |
| Feature flags | Mobile FEATURES.companion=false and FEATURES.dispatch=false (apps/mobile/lib/v1FeatureFlags.ts:17). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | The list needs our servers and a signed-in account, so it is not available signed out. Local inference does not use it. Whether a Local-only user must sign in to link a device is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Two pulsing placeholder rows. | apps/web/features/settings/components/LinkedDevicesPanel.tsx:381 |
| Load error | Alert text 'Unable to load linked devices.' with 'Try again'. | apps/web/features/settings/components/LinkedDevicesPanel.tsx:156 |
| Empty | 'No app is linked to this account.' | apps/web/features/settings/components/LinkedDevicesPanel.tsx:413 |
| Signed-out devices | Grouped in a collapsed 'Signed out (N)' section. | apps/web/features/settings/components/LinkedDevicesPanel.tsx:432 |
| Rename empty | 'Give the device a name.' | apps/web/features/settings/components/LinkedDevicesPanel.tsx:196 |
| Rename cancel | Escape or Cancel closes the editor. | apps/web/features/settings/components/LinkedDevicesPanel.tsx:276 |
| Unlink failure | Alert 'Unable to unlink this device.' row stays. | apps/web/features/settings/components/LinkedDevicesPanel.tsx:176 |
| Mobile companion off | FeatureUnavailable view named Remote. | apps/mobile/app/(app)/companion/index.tsx:183 |
| Mobile list load failure | Line 'Your computers could not be loaded.' | apps/mobile/src/features/cloud-code/components/CodeDevicesSection.tsx:63 |
| Unlink with lost or logoutAll flag | Unlink takes a lost flag, which records the credentials as compromised (device_lost), and a logoutAll flag, which revokes all mobile intent tokens. | apps/web/app/api/settings/devices/[deviceId]/route.ts:50-54,100-110 |
| Heartbeat after Stop remote work | A heartbeat can never re-enable remote_enabled. After 'Stop remote work' it stays off until the device is paired again. | apps/web/app/api/devices/heartbeat/route.ts:23-42 |
| Mobile Remote with companion on and dispatch off | The Remote screen renders, because the render guard checks only companion; the connect and notification effects also need dispatch, so gating is inconsistent. | apps/mobile/app/(app)/companion/index.tsx:108,118,125,183 |
| Offline / timeout / retry beyond the Try again button | not handled in the code I read. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/components/__tests__/LinkedDevicesPanel.test.tsx`: Panel behaviour (name matches; content not read).
- `apps/web/app/api/settings/devices/__tests__/route.test.ts`: List route.
- `apps/web/app/api/settings/devices/__tests__/route.stop-remote-work.test.ts`: Unlink stopping remote work.
- `apps/web/app/api/settings/devices/__tests__/device-registry.schema.test.ts`: Registry schema.
- `apps/web/app/api/devices/heartbeat/route.test.ts`: Heartbeat route.
- `apps/web/db/neon/device-registrations-migration.test.ts`: Registry migration.
- `apps/mobile/src/features/device-registry/__tests__`: Mobile device registry (files not listed).
- `apps/mobile/src/features/companion/remote-code/__tests__/service.test.ts`: Remote code requests.

**Test scenarios**

- **Unlink asks first**
  1. Open Settings > Account.
  2. Press Unlink on a device.
  3. Cancel.
  - Expected: Dialog names the consequence; device stays.
- **Unlink confirm**
  1. Press Unlink, confirm.
  - Expected: Row removed; the device's next request is signed out.
- **Rename**
  1. Press Rename, type a new name, Save.
  - Expected: Row shows the new name after reload.
- **Failed load**
  1. Make GET /api/settings/devices return 500.
  - Expected: 'Unable to load linked devices.' with Try again.
- **CLI list**
  1. Run agi devices --json.
  - Expected: JSON of devices with presence and capabilities.
- **Mobile flag off**
  1. Open AGI Code on a build with companion false.
  - Expected: No Devices section.

**Where to look when it fails**

- Routes: /api/settings/devices, /api/devices/heartbeat.
- Tables device_registrations, device_refresh_tokens (revoked_at, expires_at), desktop_devices, mobile_devices.
- Client error 'Unable to unlink this device.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **Mobile device list and remote session viewer are off in v1.** Affects: Mobile users. Evidence: apps/mobile/lib/v1FeatureFlags.ts:17. Work needed: Owner decision to enable; then verify pairing.
- **CLI can list but not rename or unlink; brief says missing.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1100. Work needed: Add actions or update the brief.
- **No remote-session viewer on web or desktop.** Affects: Web and desktop users. Evidence: brief S4.22. Work needed: Decide scope.
- **Web Account panel has no way to pair a new device.** Affects: Web users. Evidence: apps/web/features/settings/components/LinkedDevicesPanel.tsx. Work needed: Add a pair action or document linking from the device.
- **VS Code and Chrome are not shown as devices management surfaces though they are device types in the list; heartbeats from them were not found.** Affects: VS Code and Chrome users. Evidence: apps/web/features/settings/components/LinkedDevicesPanel.tsx:46. Work needed: None for listing (they appear in the web list); management stays on web.
- **Mobile Remote screen gating is inconsistent: with companion on and dispatch off the screen renders (render guard checks only companion) while connect and notification effects also need dispatch.** Affects: Mobile users. Evidence: apps/mobile/app/(app)/companion/index.tsx:108,118,125,183. Work needed: Align the render guard with the effects' flag checks.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- api:GET /api/settings/devices
- api:POST /api/devices/heartbeat
- table:device_registrations
- table:device_refresh_tokens
- SYS-authentication-and-identity
- SYS-sync-and-continuity
- SYS-security-and-privacy
- F004-07

## Unknown

- How the presence online window values compare in minutes (constants not read).
- Whether the Tauri desktop shows its own device list.
- What the mobile Remote flow needs on the computer side (host not read).
- Whether Local-only users must sign in to appear in the registry.
- Test contents were not read, only file names.
- Whether the relay for mobile remote control is deployed (owner memory says no Fly deploy until told).

## Second reader's check

A second reader checked 11 statements of this page against the code: 7 correct, 4 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 7):** "Mobile remote control checks plan capability remote_control (paid tiers) before pairing (companion/index.tsx:100; billing-catalog.ts:352)" The code shows: remote_control maps to PAID_TIERS (basic, pro, max, max_15x, team, team_premium, enterprise). planLacksRemoteControl is true only when the tier is known, no pairing code is held, and the status is not connected, stale or reconnecting. The check runs on the client only. No server gate was found. (apps/mobile/app/(app)/companion/index.tsx:99-107,185; packages/contracts/types/src/billing-catalog.ts:332-340,352). **Corrected:** A plan check on the client hides the Remote screen from non-paid tiers, but only once the tier has loaded and only when the session is not already connected or reconnecting. Paid tiers are basic and above.
- **Partly wrong (section 7):** "List capped at 200 rows per query (route.ts:16)" The code shows: MAX_DEVICES=200 is used as limit 200 in three SQL queries, and the merged list is sliced to 200. (apps/web/app/api/settings/devices/route.ts:16,85,130,175,234). **Corrected:** The merged list is capped at 200 devices in total, and each source query is also limited to 200.
- **Partly wrong (section 6):** "Unlink revokes the refresh credential family, deletes registration rows in one transaction and propagates revocation to live sessions ([deviceId]/route.ts:78)" The code shows: propagateDeviceRevocation (live sessions and remote work) runs before and outside db.transaction, and only for registry devices. The transaction then revokes refresh credentials and deletes the device_registrations, mobile_devices and desktop_devices rows. (apps/web/app/api/settings/devices/[deviceId]/route.ts:77-135). **Corrected:** Unlink first propagates revocation to live sessions (registered devices only). Then, in one transaction, it revokes refresh credentials and deletes registration and legacy rows.
- **Partly wrong (section 6):** "Each client app posts heartbeats that upsert the registration and last seen time (heartbeat/route.ts:25)" The code shows: The route needs a user-scoped DB, CSRF and a schema-valid body. It upserts on (user_id, surface, install_id). A repo search found heartbeat callers only in apps/cli/src/device_registry.rs and the desktop bundle. None was found in the mobile source. (apps/web/app/api/devices/heartbeat/route.ts:21-60; apps/cli/src/device_registry.rs). **Corrected:** CLI and desktop post heartbeats. Heartbeats from mobile, VS Code and Chrome were not found, so 'each client app' is unverified.

**Facts the page missed**

- Unlink takes a lost flag, which records the credentials as compromised (device_lost), and a logoutAll flag, which revokes all mobile intent tokens. The page mentions only a lost flag, in one table cell. apps/web/app/api/settings/devices/[deviceId]/route.ts:50-54,100-110
- A heartbeat can never re-enable remote_enabled. After 'Stop remote work' it stays off until the device is paired again. The page does not say this. apps/web/app/api/devices/heartbeat/route.ts:23-42
- Remote screen gating is inconsistent. The mobile Remote screen renders when companion is on and dispatch is off. Only companion is checked at the render guard, but the connect and notification effects also need dispatch. apps/mobile/app/(app)/companion/index.tsx:108,118,125,183
