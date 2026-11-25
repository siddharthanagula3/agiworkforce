---
id: "F086-06"
type: "feature"
title: "Linked and remote devices"
aliases: ["Linked devices", "Trusted devices", "Remote paired devices", "Browser pairing", "Remote Control", "Unlink device", "S86.07", "S86.08"]
area: "86 Security and connected-access settings"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S86.07", "S86.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "plan:paid-plans", "file:apps/web/features/settings/components/LinkedDevicesPanel.tsx", "file:apps/web/app/api/settings/devices/route.ts", "file:apps/desktop/electron/browser/bridgeServer.ts", "api:GET /api/settings/devices", "api:DELETE /api/settings/devices/[deviceId]", "api:PATCH /api/settings/devices/[deviceId]", "api:POST /api/settings/devices/[deviceId]", "table:device_registrations", "table:device_refresh_tokens", "table:desktop_devices", "table:mobile_devices", "store:desktop-browser-pairing", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-06 Linked and remote devices

Settings, Account, Linked devices lists the CLI, VS Code, Chrome, desktop and phone linked to the account, renames them and unlinks them, which revokes their credentials. The Desktop app also pairs with the Chrome extension and a phone. The phone's pairing screen is switched off in the current build.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.07](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8607), [S86.08](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8608).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows every app linked to the account with state (Signed in or Signed out), last seen and capabilities; renames or unlinks a device and revokes its credential, sessions and mobile tokens. On Desktop, pairs and unpairs the Chrome extension, and connects or disconnects a phone for Remote Control.

**Why it exists.** A lost or retired device must lose access. The brief requires seeing trusted or linked devices and removing trust, and seeing devices paired for remote use and unpairing them (doc: knowledge-base/data/area-briefs/086-security-and-connected-access-settings.md, S86.07 and S86.08).

**Who uses it.** Account holders who sign in from the CLI, VS Code, Chrome, desktop or phone; Desktop users who drive a browser or phone remotely.

**Problems it solves**

- A lost laptop still holding a credential.
- Not knowing which apps are signed in.
- Leftover pairing of a browser or phone to a desktop.

**Use cases**

- Unlink a retired laptop's CLI.
- Rename 'Mac' to 'Office Mac'.
- Unpair Chrome from the Mac.
- Disconnect a phone from Remote Control.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Account, 'Linked devices' (apps/web/features/settings/components/LinkedDevicesPanel.tsx:365-378, mounted at AccountSection.tsx:529-535).
- Desktop: Settings section 'Chrome' (browser pairing) with 'Unpair' (apps/web/features/desktop-host/components/BrowserPairingSection.tsx:14, 91-109) and section 'Remote Control' (RemoteControlSection.tsx:37).
- Chrome extension: Options, pairing rows with a pair button and an unpair button (extension/src/features/options/desktop-pairing-rows.ts).
- Mobile: Companion screen with a Disconnect alert (apps/mobile/app/(app)/companion/index.tsx:157-167); currently switched off by flags.

**Before you start**

- A signed-in account on the web.
- Desktop pairing: the Desktop app must be running; Chrome extension installed; the code is shown only in a dialog on the Mac (BrowserPairingSection.tsx:32).
- Remote Control with a phone comes with paid plans (RemoteControlSection.tsx:50, 274-276).

**Screens and controls**

- Linked devices: label 'Linked devices', hint 'Unlinking revokes the device's credential. It signs out when it next connects.', rows with surface labels 'Desktop app', 'VS Code extension', 'Chrome extension', 'Mobile app', capabilities 'Can use Browser, Computer use, Local models, Local MCP, Remote Control', buttons 'Rename <device>' and 'Unlink <device>' with dialog 'Unlink <device>?' and 'Unlink device' (LinkedDevicesPanel.tsx:42-60, 323-356, 365-378).
- Group 'Signed out (N)' collapsible list (LinkedDevicesPanel.tsx:442-455).
- Desktop: 'Unpair this browser?' with 'Unpair'; status 'Paired and answering' or 'Paired, not answering right now'; button to register the browser host (BrowserPairingSection.tsx:91-130).
- Remote Control: dialog 'Disconnect <phone>?' with 'Disconnect phone' (RemoteControlSection.tsx:303-305).

**Journey**

1. Open Settings, Account, Linked devices.
2. Read the list; signed-in devices first, signed-out ones under 'Signed out (N)'.
3. Rename with the edit control, or press Unlink and confirm.
4. The server revokes credentials and removes the registration; a notice is sent to the account holder.
5. To pair Chrome: in the extension choose connect to Desktop, type the code shown by Desktop; to remove, press Unpair in either app.

**What the person sees and gets**

- Row details: platform, version, 'Workspace sign-in' or 'Personal sign-in', 'Signed in' or 'Signed out', 'Last seen <date>', 'Linked <date>' (LinkedDevicesPanel.tsx:78-117).
- Empty state 'No app is linked to this account.'; load error with 'Try again' (LinkedDevicesPanel.tsx:389-418).
- Unlink response: message 'Device unlinked', revokedCredentials and remoteControlRevoked (devices/[deviceId]/route.ts, handleUnlink).
- Notice to the holder that a device was disconnected (notifyDeviceDisconnected).

**Settings**

- Device sign-in toggle on Security ('DeviceSignInToggle') (SecuritySection.tsx:283); its behaviour was not opened.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Device list merges three sources: device registrations, device-code sign-ins without registration, and desktop and phone device tables; capped at 200 (apps/web/app/api/settings/devices/route.ts:15, 224-240).
- Each device carries presence and a live-credential flag (devices/route.ts:51-85, 104-110).
- Rename by PATCH with 1 to 120 characters, updating whichever table holds the device (devices/[deviceId]/route.ts, handleRename).
- Unlink by DELETE: revokes refresh credentials, optionally mobile tokens, deletes registration rows, ends the device's identity session, writes audit events and notifies the holder (devices/[deviceId]/route.ts, handleUnlink).
- Desktop browser pairing state, install of the browser host and unpair run in the Electron app (apps/desktop/electron/runtime/dispatcher.ts:3127-3133; browser/bridgeServer.ts:189-205, 1126-1139).
- Chrome extension can unpair and records an unconfirmed unpair when Desktop is unreachable (extension/src/features/native-bridge/pairing.ts:32, 513-521).
- Remote Control section lets Desktop disconnect a phone with a confirm (RemoteControlSection.tsx:303-305).

**Incomplete**

- Server supports 'lost' (marks the credential family compromised), 'logoutAll' and a 'stop-remote-work' POST, but no screen in web, phone or Desktop calls them (grep of apps found only the route and its test).
- Brief marks VS Code and Chrome pairing as done; only the Chrome side was found (desktop-pairing-rows.ts). VS Code pairing was not found (unknown).

**Present but disconnected or switched off**

- Phone Companion (pairing a phone to a computer) is behind flags companion: false and dispatch: false in apps/mobile/lib/v1FeatureFlags.ts:12,16, and its handlers return early when those flags are off (companion/index.tsx:136-172).

**Not available**

- Trusted devices that skip extra checks: none exist; the Security page says no device skips the sign-in checks (SecuritySection.tsx:305).
- CLI has no device unlink command in the code opened; CLI only reads the device list (cli/src/cloud/devices.rs).

## 4. Required behaviour

**Established requirements**

- The user can see the devices trusted on the account (linked, or that skip extra checks) and remove trust. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.07)
- The user can see devices paired for remote use (phone to desktop, browser to desktop) and unpair them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.08)
- Unlinking revokes the device's credential; the device signs out when it next connects. (source: apps/web/features/settings/components/LinkedDevicesPanel.tsx:376-378)
- The server also ends the device's identity session when it has one and revokes mobile tokens. (source: apps/web/app/api/settings/devices/[deviceId]/route.ts (handleUnlink))
- A lost-device option is recorded as a different reason. (source: apps/web/app/api/settings/devices/[deviceId]/route.ts (UnlinkOptionsSchema, source lost_device))
- Remote Control with a phone comes with paid plans. (source: apps/web/features/desktop-host/components/RemoteControlSection.tsx:50)
- Irreversible actions confirm first and name the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. The list shows every app with a live credential or registration, with 'Signed in' or 'Signed out'.
2. Rename to an empty name shows 'Give the device a name.' and does not call the server.
3. Unlink asks for confirmation, then the device disappears from Signed in; the device's next call is refused.
4. After unlink the device's refresh tokens have revoked_at set and its registration row is gone.
5. Unpair in Desktop removes the stored pairing and the browser host and the extension shows not paired.
6. Unpair from Chrome while Desktop is closed shows the 'removed the next time Desktop is open' message.
7. On a phone build with companion and dispatch off, no pairing screen is reachable [inferred from flags].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Unlink needs no step-up, only CSRF and a session (devices/[deviceId]/route.ts, handleUnlink), so a stolen session can unlink devices.
- [inferred] The 200 cap means very old registrations may not be listed (devices/route.ts:15, 240).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Lost device' choice in the unlink dialog since the server supports it.
- [proposed] Add a 'Stop remote work' action to the device row.
- [proposed] Require a re-check for unlinking.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LinkedDevicesPanel | `apps/web/features/settings/components/LinkedDevicesPanel.tsx` | List, rename and unlink UI. |
| screen | AccountSection | `apps/web/features/settings/sections/AccountSection.tsx` | Mounts the panel (line 529). |
| endpoint | GET /api/settings/devices | `apps/web/app/api/settings/devices/route.ts` | Merged list of linked devices. |
| endpoint | DELETE, PATCH and POST /api/settings/devices/[deviceId] | `apps/web/app/api/settings/devices/[deviceId]/route.ts` | Unlink (with lost and logoutAll options), rename, and stop-remote-work. |
| service | propagateDeviceRevocation | `apps/web/lib/device-steps/device-registry.ts` | Signals the device and live sessions to drop remote work. |
| service | revokeDeviceRefreshCredentials | `apps/web/lib/server/refresh-token-family.ts` | Revokes a device's refresh family. |
| service | mobile-intent-tokens | `apps/web/lib/server/mobile-intent-tokens.ts` | Revokes phone intent tokens. |
| service | notifyDeviceDisconnected | `apps/web/lib/services/account-activity-notifications.ts` | Notice to the account holder. |
| table | device_registrations | `apps/web/app/api/settings/devices/route.ts` | Registry of surface, OS, capabilities, credential family. |
| table | desktop_devices and mobile_devices | `apps/web/db/neon/0013_devices.sql` | Older device tables. |
| table | device_refresh_tokens and device_authorization_codes | `apps/web/app/api/settings/devices/route.ts` | Credentials and device-code sign-ins for CLI and VS Code. |
| endpoint | POST /api/devices/heartbeat | `apps/web/app/api/devices/heartbeat/route.ts` | Registers and refreshes devices; carries remote_enabled. |
| component | BrowserPairingSection | `apps/web/features/desktop-host/components/BrowserPairingSection.tsx` | Desktop 'Chrome' pairing UI. |
| component | RemoteControlSection | `apps/web/features/desktop-host/components/RemoteControlSection.tsx` | Desktop phone pairing and disconnect, paid-plan note. |
| service | bridgeServer | `apps/desktop/electron/browser/bridgeServer.ts` | Local pairing bridge: pairingState, removeHostAndPairing. |
| store | pairingStore | `apps/desktop/electron/browser/pairingStore.ts` | Persists the pairing on the Mac (module imported at bridgeServer.ts:55; contents not opened). |
| command | browser_pairing_state, browser_pairing_install_host, browser_pairing_unpair | `apps/desktop/electron/runtime/dispatcher.ts` | Desktop runtime commands (lines 3127-3133). |
| component | Extension pairing rows | `apps/extension/src/features/options/desktop-pairing-rows.ts` | Chrome Options UI to pair and unpair. |
| service | Extension pairing | `apps/extension/src/features/native-bridge/pairing.ts` | beginPairing, submitPairingCode, unpair. |
| screen | Mobile Companion | `apps/mobile/app/(app)/companion/index.tsx` | Phone pairing screen (flagged off). |
| config | v1 feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | companion and dispatch are false. |
| service | CLI devices client | `apps/cli/src/cloud/devices.rs` | Reads the device list. |
| service | Mobile computers list | `apps/mobile/src/features/device-registry/computers.ts` | Reads the device list for desktop, CLI and VS Code computers. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The panel fetches the device list; the server unions three queries for the user and caps at 200. | our servers | devices/route.ts:211-240 |
| Unlink: CSRF and rate limit, validate uuid and options, tell the device and live sessions to drop remote work, then in one transaction revoke refresh credentials and delete registration rows. | our servers | devices/[deviceId]/route.ts, handleUnlink |
| The server ends the device's identity session, writes audit events device_trust_revoked and session_revoked, and notifies the holder. | our servers | devices/[deviceId]/route.ts, handleUnlink (end) |
| The device discovers the revocation the next time it connects and signs out. | device | LinkedDevicesPanel.tsx:376-378 |
| Desktop Chrome pairing: the extension submits a code to a local bridge on the Mac; unpair clears the pairing and uninstalls the native host manifest. | device | bridgeServer.ts:189-205, 1126-1139 |
| Phone pairing for Remote Control uses a code scanned on the phone and a relay service; relay not traced. | outside service | RemoteControlSection.tsx:40-45 (text only); relay unknown |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Device registrations and credential families | tables device_registrations, desktop_devices, mobile_devices, device_refresh_tokens | Server only; clients read via /api/settings/devices | Unlink deletes registrations and revokes tokens. |
| Desktop-Chrome pairing record and native host manifest | On the Mac (pairing store file and browser manifest folders) | No | Removed by unpair (bridgeServer.ts:1126-1139). |
| Audit events device_trust_revoked, device_renamed, session_revoked, refresh_family_compromised | audit store | Server only | Retention unknown. |

**Models and providers.** No AI model or inference provider is involved. Capabilities 'Local models' and 'Local MCP' are only reported labels on a device row; local inference itself is unaffected by unlinking except that remote work is withdrawn.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in web session to list or unlink. Desktop pairing needs the Desktop app running; no account is needed for the local bridge itself [inferred]. |
| Permissions | Account owner only (user-scoped queries). |
| Subscription | Linked devices list: none found in the code. Remote Control with a phone: 'comes with paid plans' (RemoteControlSection.tsx:50, 274-276); the plan tier is read from billingPlanCapabilityWireTiers('remote_control'). |
| Limits and metering | List cap 200 (devices/route.ts:15). Name 1 to 120 characters. Rate limit key settings-session-revoke on unlink, rename and stop. Pairing code TTL (PAIR_REQUEST_TTL_MS) and idle window (CONNECTION_IDLE_MS) exist in bridgeServer.ts; values not read. |
| Feature flags | Mobile flags companion and dispatch are false (v1FeatureFlags.ts:12,16). |
| Model compatibility | Not applicable. |
| Provider restrictions | Chrome pairing binds to the extension origin; only chrome-extension origins and vscode-webview origins are accepted by the local bridge (bridgeServer.ts:245-258). |
| Local mode | Browser pairing and the local bridge run on the Mac without the cloud. The Linked devices list needs the cloud account. Phone Companion is off in this build. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Two grey placeholder rows. | LinkedDevicesPanel.tsx:381-388 |
| Empty | 'No app is linked to this account.' | LinkedDevicesPanel.tsx:411-413 |
| Load error and retry | Alert text and 'Try again'. | LinkedDevicesPanel.tsx:389-409 |
| Rename with no name | 'Give the device a name.' | LinkedDevicesPanel.tsx:199 |
| Unlink failure | 'Unable to unlink this device.' | LinkedDevicesPanel.tsx:181-184 |
| Device not found | 404 'Device not found'. | devices/[deviceId]/route.ts |
| Signaling unreachable | Response reports signalingReachable and liveSessionsDropped as null or false; unlink still completes. | devices/[deviceId]/route.ts, response body |
| Chrome unpair with Desktop closed | Message that the pairing is removed the next time Desktop is open while Chrome runs. | extension/src/features/native-bridge/pairing.ts:32 |
| Bridge not listening | 'The local pairing bridge is not listening, so Chrome cannot reach this app. Quit and reopen Desktop.' | BrowserPairingSection.tsx:24 |
| Host missing | 'The browser host is not registered...' with a register button. | BrowserPairingSection.tsx:22, 110-170 |
| Phone Companion off | Handlers return immediately. | companion/index.tsx:136-172; v1FeatureFlags.ts:12,16 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/devices/__tests__/route.test.ts`: List, unlink and rename routes.
- `apps/web/app/api/settings/devices/__tests__/route.stop-remote-work.test.ts`: Stop remote work action.
- `apps/web/app/api/settings/devices/__tests__/device-registry.schema.test.ts`: Registry schema.
- `apps/web/app/api/devices/heartbeat/route.test.ts`: Device heartbeat.
- `apps/extension/__tests__/pairing.test.ts`: Extension pairing.
- `apps/extension/__tests__/desktop-revocation-handshake.test.ts`: Revocation handshake with Desktop.
- `apps/extension/__tests__/pairing-e2e.test.ts`: Pairing end to end.
- `apps/desktop/electron/__tests__/pairingWindow.test.ts`: Desktop pairing window.
- `apps/mobile/__tests__/CompanionPairingRequirements.test.tsx`: Phone pairing requirements.
- `apps/mobile/__tests__/CompanionPairingRecovery.test.tsx`: Phone pairing recovery.
- `apps/web/app/privacy/__tests__/remote-control-pairing-claims.test.ts`: Privacy claims about pairing.

**Test scenarios**

- **Unlink a CLI**
  1. Sign in the CLI by device code.
  2. Open Linked devices, press Unlink, confirm.
  3. Run a CLI command that needs the cloud.
  - Expected: Device vanishes; the CLI is refused and signs out.
- **Rename**
  1. Press rename, enter 'Office Mac', save.
  - Expected: List shows the new name; audit device_renamed.
- **Signed-out group**
  1. Revoke a device's credential by another path.
  2. Open the list.
  - Expected: Device appears under 'Signed out (N)'.
- **Unpair Chrome**
  1. Pair Chrome with Desktop.
  2. Press Unpair in Desktop and confirm.
  - Expected: State not paired; host manifest removed; extension shows not paired.
- **Phone companion off**
  1. Build the phone app with default flags.
  2. Look for the Companion screen.
  - Expected: Pairing is not usable because companion and dispatch are false.

**Where to look when it fails**

- Log 'Linked device unlinked' with revokedCredentialCount and signalingReachable.
- Audit events device_trust_revoked, refresh_family_compromised (critical), session_revoked, device_renamed.
- Log 'Device identity session could not be revoked'.
- Tables device_refresh_tokens (revoked_at, used_at), device_registrations.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/086-security-and-connected-access-settings.md](../../70-qa/test-plans/web/086-security-and-connected-access-settings.md)
- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)
- Mobile: [70-qa/test-plans/mobile/086-security-and-connected-access-settings.md](../../70-qa/test-plans/mobile/086-security-and-connected-access-settings.md)
- VS Code: [70-qa/test-plans/vscode/086-security-and-connected-access-settings.md](../../70-qa/test-plans/vscode/086-security-and-connected-access-settings.md)
- Chrome: [70-qa/test-plans/chrome/086-security-and-connected-access-settings.md](../../70-qa/test-plans/chrome/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **Lost device, log out everywhere and stop remote work exist on the server but have no button.** Affects: Web, Desktop, Mobile. Evidence: devices/[deviceId]/route.ts; no caller found in apps. Work needed: Add controls or remove unused code paths.
- **Unlink does not need a re-check.** Affects: Web, Desktop. Evidence: devices/[deviceId]/route.ts, handleUnlink (no requireStepUp). Work needed: Decide the rule; add step-up if required.
- **Phone pairing is switched off although the brief says done.** Affects: Mobile. Evidence: v1FeatureFlags.ts:12,16. Work needed: Record the flag state in the brief or enable when ready.
- **VS Code pairing not found in code.** Affects: VS Code. Evidence: Searched extension-vscode/src for unpair; no match. Work needed: Locate or build, then verify.
- **The earlier draft said the list shows the latest 50 registrations; the code caps at 200 across three sources.** Affects: Documentation. Evidence: devices/route.ts:15. Work needed: None; use this page.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- plan:paid-plans
- file:apps/web/features/settings/components/LinkedDevicesPanel.tsx
- file:apps/web/app/api/settings/devices/route.ts
- file:apps/desktop/electron/browser/bridgeServer.ts
- api:GET /api/settings/devices
- api:DELETE /api/settings/devices/[deviceId]
- api:PATCH /api/settings/devices/[deviceId]
- api:POST /api/settings/devices/[deviceId]
- table:device_registrations
- table:device_refresh_tokens
- table:desktop_devices
- table:mobile_devices
- store:desktop-browser-pairing
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries

## Unknown

- Contents of the Desktop pairing store (pairingStore.ts not opened) and its on-disk location.
- Pairing code lifetime values in bridgeServer.ts.
- How VS Code pairs with Desktop, if it does.
- What the DeviceSignInToggle on Security does.
- Which plan tiers contain Remote Control (read at runtime from the billing capability table).
- How the phone relay works and whether the relay is deployed (memory notes say no relay deploy until told; not verifiable from code).
- Whether Desktop Electron shows the Linked devices panel identically.
