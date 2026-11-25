---
id: "F068-09"
type: "feature"
title: "Pair and revoke a device"
aliases: ["Pair a phone", "Pairing", "Device pairing", "Remote Control pairing", "Pairing revocation", "Disconnect phone", "Stop Remote Control", "Unlink device", "Browser pairing link", "S68.22", "S68.23"]
area: "68 Session continuity and remote-session product"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S68.22", "S68.23"]
depends_on: ["surface:desktop", "surface:mobile", "surface:web", "surface:cli", "surface:vscode", "mode:cloud", "plan:basic", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:team_premium", "plan:enterprise", "api:POST /api/pair/initiate", "api:POST /api/pair/claim", "api:POST /api/pair/standing", "api:DELETE /api/settings/devices/{deviceId}", "api:POST /api/settings/devices/{deviceId}", "table:device_registrations", "table:device_refresh_tokens", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-execution-boundaries", "F068-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-09 Pair and revoke a device

The person pairs a phone (or a signed-in browser) to a computer with a short-lived code or QR, confirms it on the computer, and can end the pairing from either side or unlink the device. The relay rechecks account and plan while a pairing lives. The phone side is off in v1; command line and VS Code can also host a pairing.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.22](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6822), [S68.23](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6823).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Creates a one-time, five-minute pairing on the relay for the computer (initiate), lets a phone or browser of the same account claim it (claim), asks the person at the computer to allow that phone, then keeps a signed channel for session control. Either side ends it; unlinking a device also stops remote work and drops live relay sessions. [apps/web/app/api/pair/initiate/route.ts:20,47-175; apps/web/app/api/pair/claim/route.ts:47-173; packages/platform/utils/src/remoteControl/remoteControlHost.ts:470-530,692-701]

**Why it exists.** A phone must only reach the computers of its own account, only with the person's consent, and must lose access at once when revoked (S68.22, S68.23). (doc: area brief 068)

**Who uses it.** A person with a paid plan who wants phone or browser access to a computer's sessions. [inferred]

**Problems it solves**

- A scanned QR joining a stranger's computer (the claim route checks the account).
- A phone staying connected after a plan downgrade or workspace switch-off (the relay rechecks).
- A lost or sold phone keeping access (Unlink / revoke).

**Use cases**

- Pair a phone to Desktop with a QR code.
- Open a browser link copied on the computer to send tasks from web.
- Disconnect the phone from the computer's Remote Control panel.
- Unlink a lost device from web settings.

## 2. User experience

**Where to find it**

- Computer, Desktop: Settings, Capabilities, 'Remote Control', 'Pair a phone' [apps/web/features/desktop-host/components/RemoteControlSection.tsx:37,293; apps/web/features/settings/sections/CapabilitiesSection.tsx:215]. The section renders only inside the Desktop app and only if the app supports it [RemoteControlSection.tsx:166].
- Command line: 'agi remote-control' (prints a QR) or '/remote-control' [apps/cli/src/lib.rs:6659; apps/cli/src/claude_parity.rs:299,1844]. VS Code: 'agi-workforce.remoteControl' with panel, status bar and a Stop command [apps/extension-vscode/src/features/remote-control/index.ts:12-18,128-233].
- Phone: Remote screen, scan QR or enter the code; hidden in v1 [apps/mobile/app/(app)/companion/index.tsx:147-154,183; apps/mobile/lib/v1FeatureFlags.ts:12,16]. Decision doc: Add device opens the pairing page, not the camera [docs/decisions/2026-11-13-founder-decisions.md:179-184].
- Browser: page /code/computer, field 'Pairing link', button 'Connect' [RemoteComputerPage.tsx:41-44,396-418].
- Revoke: Desktop 'Disconnect phone' / 'Stop Remote Control' / 'Cancel pairing' [RemoteControlSection.tsx:296-316]; phone 'Disconnect from <name>?' alert [companion/index.tsx:156-165]; web 'Linked devices', 'Unlink' [LinkedDevicesPanel.tsx:328-345].

**Before you start**

- Computer app signed in on a paid plan; the screen-share kill switch open [apps/web/lib/feature-flags/remote-control-gate.ts:97-123].
- Relay configured on the server: SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET [apps/web/app/api/pair/claim/route.ts:69-80].
- Phone has camera access only after the pairing page explained pairing (doc: docs/decisions/2026-11-13-founder-decisions.md:179-181).
- A phone holds one pairing at a time (doc: same, line 187-188).

**Screens and controls**

- Desktop panel: QR image, 'Enlarge pairing QR code', 'Refresh pairing code', pairing code text, 'Copy link for a browser', 'Link copied', status 'Connected to <phone>' [RemoteControlSection.tsx:195-290].
- Native dialog 'Allow this phone?' with 'Cancel' / 'Allow this phone' and the pairing code in the detail [apps/desktop/electron/remote/remoteControlService.ts:196-212].
- Disconnect confirm: 'Disconnect <phone>?' with text 'The phone is disconnected from this computer and can no longer follow or steer its sessions. To connect it again, pair it with a new code.' [RemoteControlSection.tsx:52-53,300-306].
- Unlink confirm: 'That device is signed out and its stored credentials are revoked. It has to be linked again from the device itself to regain access.' [LinkedDevicesPanel.tsx:330-337].

**Journey**

1. 1. On the computer press 'Pair a phone'. The page asks POST /api/pair/initiate and starts the host with code, relay address and token [apps/web/features/desktop-host/lib/remote-pairing.ts:28-55].
2. 2. A QR and code show for five minutes (default) [initiate/route.ts:20].
3. 3. Phone scans; it claims the pairing through POST /api/pair/claim and receives a pair token [apps/mobile/services/manualPairing.ts:154-200].
4. 4. The phone joins the relay; the computer asks 'Allow this phone?'. Cancel stops pairing [remoteControlHost.ts:470-520; remoteControlService.ts:196-212].
5. 5. Status becomes connected; sessions flow (F068-07).
6. 6. To end it: Disconnect phone on the computer, Disconnect on the phone, or Unlink in web settings.

**What the person sees and gets**

- Claim errors on the phone: invalid or expired code; 'That pairing code is already connected to a phone.'; 'That pairing code belongs to a different account. Sign in as that account on Desktop.' [apps/mobile/services/manualPairing.ts:175-196].
- Server answers: 503 'Pairing is not configured' when the relay is not set up; 404 pairing_not_found; 409 pairing_role_in_use; 403 pairing_belongs_to_another_account [claim/route.ts:79,129,132,146].
- Plan answer: 403 with code plan_upgrade_required and required plans; 503 'Your plan could not be checked, so Remote Control did not start. Try again.' [remote-control-gate.ts:54-77].
- Desktop panel text for a paid-plan gate: 'Remote Control comes with paid plans.' with an Upgrade link [RemoteControlSection.tsx:50,78-80].
- After revocation the phone says 'Remote Control was turned off for this phone in your account settings. Scan a new QR code to pair again.' or 'This pairing has ended...' [apps/mobile/stores/connectionStore.ts:1479-1484].

**Settings**

- Rename a device name (web) [devices/[deviceId]/route.ts:306-330].
- 'stop-remote-work' action withdraws one device from remote work without unlinking it [devices/[deviceId]/route.ts:233-304]; a desktop starting a new pairing turns remote work back on [apps/web/app/api/pair/initiate/route.ts:146-155]. A web control for this action: unknown (not found in files read).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Initiate: CSRF, user-scoped DB, 'device-link' rate limit, standing check, relay call, audit event 'remote_pairing_initiated' [apps/web/app/api/pair/initiate/route.ts:47-165].
- Claim: same gates, then relay claim with the account id; relay refuses another account with 403; audit events 'remote_pairing_claimed' success and failure [claim/route.ts:47-173; services/signaling-server/src/index.ts:820-850].
- Relay standing recheck: pairing stays only while workspace policy, plan and kill switch allow; unconfigured production relay serves none; held when the answer cannot be read [apps/web/lib/feature-flags/remote-control-gate.ts:82-123; services/signaling-server/src/standing.ts:40-66; apps/web/app/api/pair/standing/route.ts:18-35].
- Revoke: Desktop and phone send 'end_pairing' on disconnect [remoteControlHost.ts:701; apps/mobile/stores/connectionStore.ts:1339-1347; packages/platform/utils/src/signaling.ts:109-110]. Web Unlink revokes refresh credentials, deletes registry rows, tells the relay to close live sockets and delete pairings naming the device, queues a retry when the relay is down [devices/[deviceId]/route.ts:56-231; apps/web/lib/device-steps/device-registry.ts:198-234; services/signaling-server/src/index.ts:968-1011].
- Command line pairs with initiator 'desktop', status line and QR; relay closes with 'device_revoked' end it [apps/cli/src/remote_control/mod.rs:241-281,510-520].
- VS Code: refuses without a trusted workspace, an open folder or a sign-in; asks the same /api/pair/initiate [apps/extension-vscode/src/features/remote-control/remoteControlService.ts:154-175,229-256].
- Browser claim: /code/computer reads the link, claims through /api/pair/claim as the phone role [apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:12,61-70,112; browser-pairing.ts:13-29].

**Incomplete**

- Web and Desktop pairing 'partial': live check after deploy still owed; claim must return 200 not 503 (doc: area brief S68.22 'Unfinished').
- Brief says revoke code is at initiate/route.ts:95; that line is body parsing. Real revoke paths are listed above.

**Present but disconnected or switched off**

- Phone claim and scan screens: FEATURES.companion and FEATURES.dispatch false [apps/mobile/lib/v1FeatureFlags.ts:12,16; companion/index.tsx:108-112,183].

**Not available**

- Command line as a pairing claimant (phone role): not applicable; it only hosts.
- Computer-to-computer pairing: cut by decision (doc: docs/decisions/wire-or-cut.md:168).
- Chrome extension: not applicable.

## 4. Required behaviour

**Established requirements**

- The user pairs a phone or other client with a machine so it can reach that machine's sessions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S68.22)
- The user revokes a pairing from either side and it stops working at once. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S68.23)
- A claim for a pairing that belongs to another account is refused (403) and audited. (source: apps/web/app/api/pair/claim/route.ts:134-146)
- Pairing is refused with 503 'Pairing is not configured' if the relay is not set up. (source: apps/web/app/api/pair/claim/route.ts:69-80)
- The relay checks account and plan again while a pairing lives. (source: apps/web/lib/feature-flags/remote-control-gate.ts:80-96)
- Revoking a pairing keeps its audit trail. (source: packages/contracts/types/src/feature-registry.json:188)
- No path reaches the camera before the pairing page shows what pairing allows; QR stays the default pairing. (source: doc: docs/decisions/2026-11-13-founder-decisions.md:179-181; docs/decisions/2026-09-15-founder-decisions.md:155-159)
- Remote Control comes with paid plans only. (source: doc: docs/product/definition.md:303)

**Acceptance criteria**

1. With the relay unset, claim and initiate answer 503 'Pairing is not configured'.
2. A code claimed by a different account is refused with 403 and an audit event with outcome failure.
3. Claiming a code that already has a phone returns 409; an unknown or expired code returns 404.
4. Disconnecting on the computer or the phone ends the pairing; the old code no longer works.
5. Unlinking a device closes its live relay sockets and deletes pairings that name it.
6. After a plan downgrade the relay ends a live pairing within its recheck interval.
7. A new phone cannot connect unless the person at the computer presses 'Allow this phone'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The claim route maps every relay 403 to 'pairing_belongs_to_another_account' although the relay also returns 403 'device_revoked'; a revoked device would be told the wrong reason [inferred from claim/route.ts:134-146 and services/signaling-server/src/index.ts:877,911].
- Because the relay needs SIGNALING_STANDING_URL in production, a missing value makes it serve no pairing [services/signaling-server/src/standing.ts:40-66].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Return the relay's real reason for 403 so the phone can show 'turned off for this phone'.
- [proposed] Add a 'Stop remote work' control for one device on web settings if none exists.
- [proposed] Record a live production check of pair, claim and revoke.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/pair/initiate | `apps/web/app/api/pair/initiate/route.ts` | Creates a pairing on the relay for the signed-in account; re-enables remote work for a desktop (146-155). |
| endpoint | POST /api/pair/claim | `apps/web/app/api/pair/claim/route.ts` | Claims the phone half of a pairing on the account's behalf; error mapping. |
| endpoint | POST /api/pair/standing | `apps/web/app/api/pair/standing/route.ts` | The relay's recheck of live pairings. |
| service | remote-control-gate | `apps/web/lib/feature-flags/remote-control-gate.ts` | Workspace policy, plan and kill switch for pairing (97-123). |
| service | signaling relay | `services/signaling-server/src/index.ts` | Create, claim, delete pairings; revoke device (968-1011); standing rechecks (2222-2360). |
| service | relay standing config | `services/signaling-server/src/standing.ts` | enforced, unconfigured or disabled modes. |
| service | remoteControlHost | `packages/platform/utils/src/remoteControl/remoteControlHost.ts` | Pairing state machine, phone confirmation, stop with end_pairing (692-701). |
| service | Desktop remoteControlService | `apps/desktop/electron/remote/remoteControlService.ts` | 'Allow this phone?' dialog, start and stop. |
| service | pairing window | `apps/desktop/electron/remote/pairingWindow.ts` | Shows the pairing code window. |
| component | RemoteControlSection | `apps/web/features/desktop-host/components/RemoteControlSection.tsx` | Desktop panel: pair, refresh, copy link, disconnect. |
| service | remote-pairing helper | `apps/web/features/desktop-host/lib/remote-pairing.ts` | Calls initiate then starts the host. |
| service | manualPairing (phone) | `apps/mobile/services/manualPairing.ts` | Claims through /api/pair/claim and maps errors to phone text. |
| store | connection store (phone) | `apps/mobile/stores/connectionStore.ts` | Connect, disconnect with end_pairing, friendly error text. |
| screen | Companion (Remote) screen | `apps/mobile/app/(app)/companion/index.tsx` | Scan, status, disconnect alert; flagged off. |
| endpoint | DELETE/POST /api/settings/devices/[deviceId] | `apps/web/app/api/settings/devices/[deviceId]/route.ts` | Unlink and stop-remote-work. |
| service | device revocation propagation | `apps/web/lib/device-steps/device-registry.ts` | Stops remote work, calls relay revoke, queues retry job 'webhooks.signaling-device-revoke'. |
| service | CLI remote control | `apps/cli/src/remote_control/mod.rs` | Command line pairing host. |
| service | VS Code remote control | `apps/extension-vscode/src/features/remote-control/remoteControlService.ts` | VS Code pairing host. |
| test | relay pairing tests | `services/signaling-server/__tests__/http/pairings.test.ts` | Relay pairing routes. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Pair a phone; the page posts to initiate with CSRF. | device | apps/web/features/desktop-host/lib/remote-pairing.ts:28-55 |
| The server checks sign-in, rate limit, workspace policy, plan and kill switch, then asks the relay to create a pairing with the account id in its metadata. | our servers | apps/web/app/api/pair/initiate/route.ts:47-121 |
| The computer connects to the relay as the 'desktop' role with the pair token; QR text 'agiw:<code>' is shown. | device and our servers | initiate/route.ts:167-174; remoteControlHost.ts:668-690 |
| The phone claims through the web route; the server verifies the account then asks the relay for a phone token; the relay refuses a different account. | our servers | claim/route.ts:99-153; services/signaling-server/src/index.ts:820-850 |
| The relay announces the peer; the computer asks the person to allow it, then derives a signed session key and marks the phone connected. | device | remoteControlHost.ts:470-530; remoteControlService.ts:196-212 |
| While paired the relay rechecks standing on an interval and closes the pairing if the answer is no; if unreadable it holds up to a maximum stale time. | our servers | services/signaling-server/src/index.ts:2222-2360 |
| Revoke: either side sends end_pairing; or Unlink calls the relay revoke route which closes sockets and deletes pairings naming the device. | device and our servers | signaling.ts:109-110; services/signaling-server/src/index.ts:968-1011 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pairing session (code, expiry, account id, role tokens) | Relay store (database access in services/signaling-server/src/db.ts; table name not read) and relay memory | Server side only | Expires (default 300 s, 30-900 s allowed); deleted on end_pairing, device revoke, or expiry cleanup (src/expired-pairings.ts). |
| Audit events remote_pairing_initiated, remote_pairing_claimed, device_trust_revoked | Workspace audit and security audit stores | Server | Retained as audit trail; policy unknown. |
| Device row and refresh credentials | table:device_registrations, table:device_refresh_tokens | Server | Deleted or revoked on unlink. |
| Pairing secret and allowed-phone identity on the computer | Desktop host memory | No | Cleared on stop. |

**Models and providers.** None. Pairing involves no model call or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required on both ends and must be the same account; relay trusts only the web layer's account claim [claim/route.ts:37-46]. |
| Permissions | Person at the computer must press 'Allow this phone' [remoteControlService.ts:196-212]. Relay endpoints for create, claim, delete and revoke accept only the internal secret [services/signaling-server/src/index.ts:821,941,969]. |
| Subscription | Paid plans only: basic, pro, max, max_15x, team, team_premium, enterprise [packages/contracts/types/src/billing-catalog.ts:332-352]; free and local tiers are refused with 403 plan_upgrade_required [remote-control-gate.ts:68-77]. Desktop panel shows the upgrade link [RemoteControlSection.tsx:78-80,267-277]. |
| Limits and metering | 'device-link' rate limit on initiate and claim; code TTL default 300 s, range 30-900 s [initiate/route.ts:20-28,63]; relay rate limiters pairingCreateLimiter, pairingClaimLimiter, pairingDeleteLimiter, deviceRevokeLimiter [services/signaling-server/src/index.ts:703,820,940,968]; a pairing lifetime cap test exists (file name only). No usage metering found. |
| Feature flags | Kill switch 'screen_share' [remote-control-gate.ts:29-52]; workspace policy 'remote_control'; relay env SIGNALING_STANDING_URL, SIGNALING_INTERNAL_SECRET, SIGNALING_STANDING_RECHECK_MS; web env SIGNALING_HTTP_URL, SIGNALING_INTERNAL_SECRET (names only). Phone flags FEATURES.companion and FEATURES.dispatch. |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code. |
| Local mode | Needs an account and the relay, so unavailable in Local mode; on the phone Remote is Cloud only (doc: docs/decisions/2026-11-13-founder-decisions.md:96-99). Command line refuses unless Managed mode [apps/cli/src/cloud/client.rs:368-372; apps/cli/src/remote_control/mod.rs:1337]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Relay not configured | 503 'Pairing is not configured'; error logged naming the two required settings. | claim/route.ts:69-80; initiate/route.ts:69-80 |
| Relay unreachable | 503 'Signaling server unavailable'. | claim/route.ts:120-123 |
| Code unknown or expired | 404 pairing_not_found; phone text 'invalid or expired'. | claim/route.ts:128-130; manualPairing.ts:175 |
| Phone already joined | 409 pairing_role_in_use. | claim/route.ts:131-133; services/signaling-server/src/index.ts:854-871 |
| Wrong account | 403 and failure audit event. | claim/route.ts:134-146 |
| Revoked device claims | Relay returns 403 device_revoked but the claim route reports 'belongs to another account' [inferred]. | services/signaling-server/src/index.ts:877,911; claim/route.ts:134-146 |
| Person cancels 'Allow this phone?' | Pairing stops. | remoteControlHost.ts:508-514 (approximate lines) |
| Code expires unused | Desktop panel offers 'Refresh pairing code'; refresh stops and restarts. | RemoteControlSection.tsx:207-223; remote-pairing.ts:57-60 |
| Phone drops | Computer shows 'Your phone disconnected. It reconnects on its own while Remote Control is on.'; 'Connection lost. Reconnecting...' on relay loss. | RemoteControlSection.tsx:44-45,48 |
| Relay down at unlink | Revoke job queued and retried; response says signalingReachable false. | device-registry.ts:215-233; devices/[deviceId]/route.ts:228 |
| Plan unreadable | 503 with retry text; a live pairing is held, not ended. | remote-control-gate.ts:54-66,80-89 |
| Accessibility | QR has alt text and labelled buttons; status uses aria-live; pairing code has aria-label. | RemoteControlSection.tsx:195-257 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/pair/claim/__tests__`: Claim route tests (folder exists; contents not read).
- `apps/web/app/api/pair/initiate/__tests__/route.audit.test.ts`: Audit event on initiate (by file name).
- `apps/web/app/api/pair/standing/__tests__`: Standing route (contents not read).
- `apps/web/app/api/pair/__tests__/remote-control-switch.test.ts`: Kill switch behaviour (by file name).
- `apps/web/app/api/pair/__tests__/standing-recheck-policy.test.ts`: Recheck policy (by file name).
- `apps/web/app/api/pair/__tests__/workspace-client-policy.test.ts`: Workspace policy (by file name).
- `services/signaling-server/__tests__/http/pairings.test.ts`: Relay pairing routes.
- `services/signaling-server/__tests__/relay/pairing-standing.test.ts`: Relay standing rechecks.
- `services/signaling-server/__tests__/relay/pairing-lifetime-cap.test.ts`: Pairing lifetime cap.
- `apps/mobile/__tests__/manual-pairing.test.ts`: Phone claim and error mapping (by file name).
- `apps/mobile/__tests__/CompanionPairingRecovery.test.tsx`: Phone pairing recovery (by file name).
- `apps/desktop/electron/__tests__/remoteControlHost.test.ts`: Host pairing (by file name).
- `apps/desktop/electron/__tests__/pairingWindow.test.ts`: Pairing window.
- `apps/web/features/desktop-host/__tests__/RemoteControlSection.test.tsx`: Desktop panel.
- `apps/web/app/api/settings/devices/__tests__/route.stop-remote-work.test.ts`: Stop remote work route.
- `apps/extension-vscode/src/__tests__/remoteControlStartCancellation.test.ts`: VS Code start cancellation.
- `apps/cli/src/remote_control/mod.rs`: Inline tests: unsafe relay URLs rejected, registration replacement, cancel during backoff, Local and own-key sessions never pair.

**Test scenarios**

- **Happy pairing**
  1. Desktop on a paid account: Pair a phone.
  2. Scan from a phone of the same account in a test build.
  3. Press Allow this phone.
  - Expected: Computer shows 'Connected to <phone>'; claim answered 200.
- **Relay not configured**
  1. Run web with relay settings unset.
  2. POST /api/pair/claim.
  - Expected: 503 'Pairing is not configured'.
- **Wrong account**
  1. Create a pairing on account A.
  2. Claim the code as account B.
  - Expected: 403 pairing_belongs_to_another_account and a failure audit event.
- **Reuse and expiry**
  1. Claim a code twice.
  2. Claim a code after five minutes.
  - Expected: 409 then 404.
- **Revoke from phone and from web**
  1. Pair.
  2. Disconnect on the phone.
  3. Pair again and press Unlink in web settings.
  - Expected: Each ends relay traffic at once; unlink returns remoteControlRevoked and liveSessionsDropped.
- **Downgrade while paired**
  1. Pair on a paid plan.
  2. Move the account to a free plan.
  - Expected: Relay ends the pairing within its recheck interval.

**Where to look when it fails**

- Web logs: 'Pairing is unconfigured', 'Signaling server unreachable while claiming a pairing', 'Signaling server refused the pairing claim', '[remote-control] plan unreadable; pairing refused'.
- Relay logs: 'Pairing claim refused', 'Device revoked', 'Pairing standing check failed'; metrics pairing_account_mismatch, pairing_standing_*.
- Audit events remote_pairing_initiated, remote_pairing_claimed, device_trust_revoked.
- Queued job kind webhooks.signaling-device-revoke.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md)
- Desktop: [70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md)
- Mobile: [70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md)
- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)
- VS Code: [70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **Live check of pairing after website deploy is owed; claim must return 200 not 503.** Affects: Web, Desktop, Mobile. Evidence: area brief S68.22 Unfinished. Work needed: Run the live check and record it.
- **Phone pairing screens are off in v1.** Affects: Mobile users. Evidence: apps/mobile/lib/v1FeatureFlags.ts:12,16. Work needed: Enable after live validation.
- **Claim route mislabels any relay 403 as another account; device_revoked is lost.** Affects: Phone and browser users with revoked devices. Evidence: claim/route.ts:134-146; services/signaling-server/src/index.ts:877,911. Work needed: Pass the relay's reason through.
- **Brief says command line has no pairing (22, 23 missing) and VS Code was listed done; code shows the command line hosts pairing and ends on device_revoked.** Affects: Brief accuracy. Evidence: apps/cli/src/remote_control/mod.rs:241-281,510-520. Work needed: Correct the brief.
- **No evidence of a web button for 'stop-remote-work' on one device; the route exists.** Affects: Web users. Evidence: devices/[deviceId]/route.ts:233-304 (UI not found). Work needed: Confirm or add control.

**Depends on**

- surface:desktop
- surface:mobile
- surface:web
- surface:cli
- surface:vscode
- mode:cloud
- plan:basic
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- plan:team_premium
- plan:enterprise
- api:POST /api/pair/initiate
- api:POST /api/pair/claim
- api:POST /api/pair/standing
- api:DELETE /api/settings/devices/{deviceId}
- api:POST /api/settings/devices/{deviceId}
- table:device_registrations
- table:device_refresh_tokens
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-execution-boundaries
- F068-08

## Unknown

- Table name and exact schema of the relay's pairing store (db.ts not read).
- Whether a web screen exists for the 'stop-remote-work' action.
- Contents of most pairing tests (opened by file name only).
- How the relay's maximum pairing lifetime is set.
- Whether the Desktop-side pairing UI (Tauri build) matters; public Desktop is Electron.
