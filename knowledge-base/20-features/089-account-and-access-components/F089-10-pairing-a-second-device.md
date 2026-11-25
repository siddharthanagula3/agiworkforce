---
id: "F089-10"
type: "feature"
title: "Pairing a second device"
aliases: ["Remote-device pairing service (S89.22)", "Pairing a second device", "Device pairing", "Remote Control pairing", "QR pairing", "Companion pairing", "Phone pairing"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.22"]
depends_on: ["SYS-sync-and-continuity", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-api-and-contracts", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "table:signaling_sessions", "table:device_registrations", "file:services/signaling-server/src/index.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-10 Pairing a second device

Links a phone to a signed-in computer or account with a short code and QR, so the phone can follow and steer coding sessions (Remote Control). The web server checks the account, plan and switches, the relay mints credentials, and the relay refuses a claim from a different account. It needs Cloud and a paid plan; mobile v1 hides it.

Area: [89. Account and access components](README.md). Requirement items: [S89.22](../../10-requirements/capabilities/089-account-and-access-components.md#s8922).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates a pairing session on the relay through POST /api/pair/initiate, lets the phone claim it through POST /api/pair/claim, and keeps the pairing bound to one account (apps/web/app/api/pair/initiate/route.ts:47-175; apps/web/app/api/pair/claim/route.ts:47-173; services/signaling-server/src/pair-token.ts:95-105).

**Why it exists.** The relay has no way to verify a user token, so the web server establishes the account and tells the relay; this stops a scanned QR joining a stranger's desktop (claim/route.ts:37-46).

**Who uses it.** A person with a desktop (Electron desktop shows the hosted web page; CLI; VS Code extension) and a phone. The brief calls it the remote-device pairing service (S89.22).

**Problems it solves**

- Joining another person's desktop with a guessed or shared code: refused with 'pairing_belongs_to_another_account' (claim/route.ts:134-147).
- Pairing when the plan, workspace policy or the switch forbid it: refused before any relay call (initiate/route.ts:66-67).
- Pairing that works without the relay: refused with 503 (initiate/route.ts:69-80).
- Stale pairings piling up: the relay sweeps them (apps/web/lib/services/deletion-manifest.ts:425-435).

**Use cases**

- A developer starts Remote Control on the desktop web app, shows a QR, and approves a phone to read diffs and steer a session.
- The CLI starts a pairing and prints a QR for the phone.
- The VS Code extension asks for a pairing and shows a prompt naming the phone before it can steer sessions (apps/extension-vscode/src/features/remote-control/remoteControlService.ts:87-92).
- A phone enters a typed code on its own and claims it through the gateway.

## 2. User experience

**Where to find it**

- Web (also the Electron desktop window): section headed 'Remote Control' with text 'Pair your phone to follow Code sessions running on this computer: approve steps, read diffs, test results and new files, and steer the next turn.' (apps/web/features/desktop-host/components/RemoteControlSection.tsx:37-39).
- Mobile: Settings screen titled 'Remote control' (apps/mobile/app/(app)/settings/remote-control.tsx:181), but it renders 'FeatureUnavailable' with feature 'Remote' because the companion flag is false (remote-control.tsx:131; apps/mobile/lib/v1FeatureFlags.ts:16).
- CLI: remote control module starts a pairing against /api/pair/initiate and prints a QR (apps/cli/src/remote_control/mod.rs:24,241-280; claude_parity.rs:1834).
- VS Code: remote-control feature service (apps/extension-vscode/src/features/remote-control/remoteControlService.ts).
- Tauri desktop store also calls /api/pair/initiate (apps/desktop/src/stores/connectionStore.ts:692). Chrome extension: no pairing code found.

**Before you start**

- Signed in on the host device (initiate/route.ts:55-61).
- A plan with the 'remote_control' capability; otherwise the web shows 'Remote Control comes with paid plans.' and the API returns 'plan_upgrade_required' (apps/web/lib/feature-flags/remote-control-gate.ts:9-15 of the plan check; RemoteControlSection.tsx:50).
- Workspace policy allows the 'remote_control' feature and the switch is on (remote-control-gate.ts:44-62).
- Server configured with relay address and internal secret (initiate/route.ts:69-80).
- Mobile: the companion feature flag on, which is off in v1 (v1FeatureFlags.ts:16).

**Screens and controls**

- Pair button and Stop control in RemoteControlSection; failure text 'Pairing could not start.' (remote-pairing.ts:5; RemoteControlSection.tsx:47-48).
- Disconnect text: 'Your phone disconnected. It reconnects on its own while Remote Control is on. To pair a different phone, stop Remote Control and pair again.' (RemoteControlSection.tsx:44).
- Phone messages: 'This QR code was made by an older Desktop version. Update AGI Workforce on Desktop, generate a new code, and scan it again.' and 'The 12-character code alone can no longer secure this connection. Scan the QR code in the pairing window on Desktop.' (apps/mobile/services/manualPairing.ts:23-26).

**Journey**

1. 1. Host starts pairing; POST /api/pair/initiate with CSRF, rate limit 'device-link' and the standing check.
2. 2. The server calls the relay's POST /pairings with the internal secret and the account id; relay returns a 12-character code, expiry, URLs and a pair token for the initiator (index.ts:703-760).
3. 3. The host shows a QR. The web server's own response has qrData 'agiw:<code>' (initiate/route.ts:171) but desktop, CLI and web compose an 'agiw3:' payload that adds a pairing secret (apps/web/features/remote-dispatch/lib/browser-pairing.ts:5; apps/cli/src/remote_control/mod.rs; apps/desktop/src/stores/connectionStore.ts).
4. 4. The phone scans or types the code; it posts to /api/pair/claim with its session.
5. 5. The server asks the relay to claim with role 'mobile' and the account id; the relay refuses with 403, 404 or 409 when not allowed (claim/route.ts:125-147).
6. 6. The phone gets a pair token and relay address and connects over a secure WebSocket (connectionStore.ts:1010-1035).
7. 7. VS Code asks the person to confirm the phone before it may steer.

**What the person sees and gets**

- Initiate returns code, expiresAt, expiresIn, qrData, signaling URLs, pairTokens for the initiator (initiate/route.ts:167-174).
- Claim errors: 'pairing_not_found' 404, 'pairing_role_in_use' 409, 'pairing_belongs_to_another_account' 403, 'Signaling server unavailable' 503, 'Failed to claim pairing session' 502 (claim/route.ts:122-152).
- Audit events remote_pairing_initiated and remote_pairing_claimed, with a failure outcome for rejected claims (claim/route.ts:135-170).

**Settings**

- The default pairing lifetime is 300 seconds; a request may ask 30 to 900 (initiate/route.ts:20,25). The relay caps a pairing at seven days (services/signaling-server/src/constants.ts:101).
- Stop Remote Control sets the device's remote_enabled off; the next desktop-initiated pairing sets it on (initiate/route.ts:146-155).
- Mobile follow-up behaviour options such as 'Queue' (remote-control.tsx:36-37).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Initiate: CSRF, sign-in, rate limit, standing check (plan, workspace policy, switch), relay configuration check, schema validation, relay call with a 10 s timeout and redirects refused (initiate/route.ts:47-136).
- Claim: same checks, code normalisation and 12-character validation, relay claim with account id, error mapping (claim/route.ts:47-153).
- Relay: pairing create requires an account; claim compares account id; rotation update requires matching stored userId (services/signaling-server/src/index.ts:703-760,820-850; db.ts:160-186).
- Relay standing recheck endpoint for ongoing pairings (apps/web/app/api/pair/standing/route.ts:37-52).
- Mobile claim goes through the gateway, not directly to the relay (apps/mobile/services/manualPairing.ts:154-170).
- CLI validates the server address and refuses unsafe addresses (apps/cli/src/remote_control/mod.rs:175-215).

**Incomplete**

- The web response still returns the old 'agiw:' qrData while phones require the newer 'agiw3:' payload with a secret; hosts must add the secret themselves. Whether every host does is verified only for web, desktop store and CLI by file search, not by running.

**Present but disconnected or switched off**

- Mobile Remote control screen is switched off in v1: companion flag false (apps/mobile/lib/v1FeatureFlags.ts:16; remote-control.tsx:131).
- The chat 'dispatch' flag is also false (v1FeatureFlags.ts:12).

**Not available**

- Chrome extension: no pairing code found by search.
- Local mode: pairing needs the server and relay.

## 4. Required behaviour

**Established requirements**

- A pairing service links a second device to a signed-in desktop or account with a short code and binds it to the account. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S89.22)
- Initiating needs a signed-in person, a CSRF token, a rate limit and a current remote-control standing check. (source: apps/web/app/api/pair/initiate/route.ts:47-67)
- Missing relay URL or secret returns 503 'Pairing is not configured'. (source: apps/web/app/api/pair/initiate/route.ts:69-80)
- Relay URLs must be secure except localhost in development. (source: apps/web/app/api/pair/initiate/route.ts:30-39,71-73)
- Claim sends the account id and the relay rejects a mismatch. (source: apps/web/app/api/pair/claim/route.ts:112-116; services/signaling-server/src/pair-token.ts:95-105)
- A pairing ends at most seven days after creation; the sweep deletes it about an hour after it expires, so the maximum age is eight days. (source: apps/web/lib/services/deletion-manifest.ts:425-435)
- Bridge pairing codes are 8 characters and relay codes 12 characters. (source: packages/contracts/types/src/pairing.ts:50-60)

**Acceptance criteria**

1. initiate without a CSRF token is refused.
2. initiate on a plan without remote_control returns plan_upgrade_required.
3. initiate with the relay secret unset returns 503 'Pairing is not configured'.
4. claim of a code created for another account returns 403 'pairing_belongs_to_another_account'.
5. claim of an unknown or expired code returns 404 'pairing_not_found'.
6. A second phone claiming the same pairing gets 409 'pairing_role_in_use'.
7. A claim code that is not 12 letters or digits returns 400 'Invalid pairing code'.
8. An unreachable relay returns 503 'Signaling server unavailable' and is logged.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI-style device code in apps/web/lib/server/device-codes.ts (8 characters, form XXXX-XXXX) belongs to device sign-in, not to this pairing [inferred from its alphabet constant and naming]; the first draft's mention of 8 and 12 character codes is about the bridge code and relay code in pairing.ts.
- Remote Control for a workspace member is governed by workspace policy because the standing check asks the 'remote_control' feature [inferred from remote-control-gate.ts:44-50].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Have /api/pair/initiate return the 'agiw3:' payload shape or document that hosts build it, so the response no longer carries a payload phones reject.
- [proposed] Show the plan requirement on the phone screen when the feature is enabled again.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/pair/initiate | `apps/web/app/api/pair/initiate/route.ts` | Creates a relay pairing for the signed-in account |
| endpoint | POST /api/pair/claim | `apps/web/app/api/pair/claim/route.ts` | Claims a pairing for the phone on behalf of the account |
| endpoint | POST /api/pair/standing | `apps/web/app/api/pair/standing/route.ts` | Relay-only standing recheck of live pairings |
| service | remote-control-gate | `apps/web/lib/feature-flags/remote-control-gate.ts` | Policy, plan and switch refusals |
| config | pairing contract | `packages/contracts/types/src/pairing.ts` | Code lengths, alphabets, validators, normalisation |
| service | relay server | `services/signaling-server/src/index.ts` | POST /pairings and POST /pairings/:code/claim handlers |
| service | relay pair token | `services/signaling-server/src/pair-token.ts` | Account binding and token verification |
| service | relay db | `services/signaling-server/src/db.ts` | Session reads and credential rotation tied to the account id |
| job | expired pairings sweep | `services/signaling-server/src/expired-pairings.ts` | Deletes expired pairings after a grace period |
| config | relay constants | `services/signaling-server/src/constants.ts` | Default ttl 300 s, max lifetime 7 days, prune grace 1 hour |
| store | mobile connectionStore | `apps/mobile/stores/connectionStore.ts` | Pairing state, claim, reconnect |
| service | mobile manualPairing | `apps/mobile/services/manualPairing.ts` | Parses agiw and agiw3 payloads; claims through /api/pair/claim |
| screen | mobile remote-control settings | `apps/mobile/app/(app)/settings/remote-control.tsx` | Settings screen, gated by FEATURES.companion |
| config | mobile v1 flags | `apps/mobile/lib/v1FeatureFlags.ts` | companion false |
| component | RemoteControlSection | `apps/web/features/desktop-host/components/RemoteControlSection.tsx` | Web and Electron desktop pairing UI |
| service | remote-pairing | `apps/web/features/desktop-host/lib/remote-pairing.ts` | Calls /api/pair/initiate with initiator desktop |
| service | browser-pairing | `apps/web/features/remote-dispatch/lib/browser-pairing.ts` | Builds the 'agiw3:' payload |
| command | CLI remote_control | `apps/cli/src/remote_control/mod.rs` | Starts pairing, validates server address, relays code sessions |
| service | VS Code remoteControlService | `apps/extension-vscode/src/features/remote-control/remoteControlService.ts` | Pairing and phone confirmation |
| store | desktop connectionStore | `apps/desktop/src/stores/connectionStore.ts` | Tauri desktop pairing call (line 692) |
| table | signaling_sessions | `services/signaling-server/src/db.ts` | Pairing rows with account id and credentials in metadata |
| table | device_registrations | `apps/web/app/api/pair/initiate/route.ts` | remote_enabled flag updated (lines 149-154) |
| test | credential-rotation.test.ts | `services/signaling-server/__tests__/relay/credential-rotation.test.ts` | Account-bound rotation on the relay |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Host app asks the web server to start a pairing. | device and our servers | apps/web/features/desktop-host/lib/remote-pairing.ts:19-27 |
| The web server checks session, CSRF, rate limit, plan, policy and the switch. | our servers | initiate/route.ts:47-67 |
| The web server calls the relay with a shared internal secret to create a pairing with the account id. | our servers | initiate/route.ts:98-117 |
| The relay stores the pairing and issues the initiator's pair token. | our servers | services/signaling-server/src/index.ts:703-760 |
| The host shows the code and QR; the phone scans it. | device | apps/mobile/services/manualPairing.ts:45-80 |
| The phone posts to /api/pair/claim; the web server asks the relay to claim with the account id. | device and our servers | claim/route.ts:101-119 |
| The relay compares accounts, rotates the credential and returns a token; the phone then opens a WebSocket to the relay. | our servers | index.ts:843-930; connectionStore.ts:1033-1037 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pairing session with code, account id, device ids, credential generation | relay table signaling_sessions | Between host, relay and phone over the relay | Expires with its ttl; swept about an hour later; maximum age eight days (deletion-manifest.ts:425-435) |
| remote_enabled flag per device | table device_registrations | No | unknown |
| Pairing secret in the QR | On the phone while paired (rememberedPairing in connectionStore.ts) | No | Forgotten when invalid (connectionStore.ts:981-983) |
| Audit events remote_pairing_initiated and remote_pairing_claimed | workspace audit log | No | unknown |

**Models and providers.** No model or provider takes part in pairing. Afterwards the paired phone steers coding sessions that run on the host with whatever model the host uses; that part is outside this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required on both devices, and both must be the same account (relay compares account ids). |
| Permissions | Workspace policy for the 'remote_control' feature; the device registration must allow remote use [inferred from remote_enabled]. |
| Subscription | Plan capability 'remote_control' (paid plans); an unreadable plan refuses with 'Your plan could not be checked, so Remote Control did not start. Try again.' (remote-control-gate.ts PLAN_UNREADABLE). |
| Limits and metering | Rate limit 'device-link' on initiate and claim; pairing lifetime 30 to 900 seconds; relay per-endpoint limiters (index.ts:703,820). |
| Feature flags | The screen-share capability switch (SCREEN_SHARE_CAPABILITY) can close pairing (remote-control-gate.ts:28-45). Mobile companion flag is false. |
| Model compatibility | Not model specific. |
| Provider restrictions | none found. |
| Local mode | Pairing needs our web server and relay, so it does not work in Local mode. Requiring sign-in and a paid plan here is separate from Local inference, which stays free of any plan [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Relay unreachable | 503 and a log line | initiate/route.ts:118-121; claim/route.ts:120-124 |
| Relay returns bad payload | 502 | initiate/route.ts:131-137 |
| Expired or unknown code | 404 pairing_not_found; CLI treats 'pairing_expired' and 'device_revoked' as ending the pairing | claim/route.ts:128-130; apps/cli/src/remote_control/mod.rs:32 |
| Second phone | 409 pairing_role_in_use; UI says to stop and pair again | claim/route.ts:131-133; RemoteControlSection.tsx:44 |
| Old QR format | Phone shows the update-required message | manualPairing.ts:23 |
| Reconnect | Phone reuses the remembered pairing secret and statuses 'stale' and 'reconnecting' | connectionStore.ts:949-966 |
| Offline | Phone status 'error' or reconnect; details not traced | connectionStore.ts:63-70 |
| Accessibility | not handled in the code that was read; the QR screens were not opened | n/a |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/pair/initiate/__tests__/route.audit.test.ts`: Initiate audit event
- `apps/web/app/api/pair/claim/__tests__/route.test.ts`: Claim route
- `apps/web/app/api/pair/__tests__/remote-control-switch.test.ts`: The capability switch closes pairing
- `apps/web/app/api/pair/__tests__/workspace-client-policy.test.ts`: Workspace policy for pairing
- `apps/web/app/api/pair/__tests__/standing-recheck-policy.test.ts`: Standing recheck
- `services/signaling-server/__tests__/relay/credential-rotation.test.ts`: Account-bound credential rotation
- `services/signaling-server/__tests__/relay/pairing-lifetime-cap.test.ts`: Maximum lifetime
- `services/signaling-server/__tests__/expired-pairings.test.ts`: Expiry sweep
- `services/signaling-server/__tests__/pairing-code-contract.test.ts`: Code format
- `apps/mobile/__tests__/manual-pairing.test.ts`: Phone parsing and claim
- `apps/web/features/desktop-host/__tests__/RemoteControlSection.test.tsx`: Web pairing UI

**Test scenarios**

- **Happy path**
  1. Sign in on web and phone with the same paid account
  2. Start Remote Control and show the QR
  3. Scan with the phone
  - Expected: Phone shows connected; audit shows initiated and claimed. Needs the mobile companion flag on.
- **Other account**
  1. Sign in on the phone with a different account
  2. Claim the code
  - Expected: 403 pairing_belongs_to_another_account
- **Free plan**
  1. Start Remote Control on a free account
  - Expected: plan_upgrade_required and the 'Remote Control comes with paid plans.' text
- **Relay not configured**
  1. Unset relay URL in a test environment
  2. POST /api/pair/initiate
  - Expected: 503 'Pairing is not configured'
- **Expired code**
  1. Wait past the ttl and a sweep
  2. Claim
  - Expected: 404 pairing_not_found

**Where to look when it fails**

- Log lines 'Pairing is unconfigured', 'Signaling server unreachable while creating a pairing', 'Signaling server refused the pairing claim'.
- Audit events remote_pairing_initiated and remote_pairing_claimed.
- Relay metric names for pairing requests (metrics.recordPairingRequest in index.ts:753).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Mobile Remote control is switched off in v1** Affects: Mobile users. Evidence: apps/mobile/lib/v1FeatureFlags.ts:16. Work needed: Enable the flag and verify on a device when the owner decides.
- **Initiate returns the legacy 'agiw:' QR data** Affects: Any host reading qrData directly. Evidence: initiate/route.ts:171; manualPairing.ts:23-26. Work needed: Return or document the secret-bearing payload.
- **No pairing code found in the Chrome extension** Affects: Chrome users. Evidence: Search of apps for pair routes found no Chrome file. Work needed: Confirm Chrome is out of scope.
- **No file records a real end-to-end run** Affects: All. Evidence: Only unit and relay tests found. Work needed: Run the scenarios on real devices.

**Depends on**

- SYS-sync-and-continuity
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-api-and-contracts
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- table:signaling_sessions
- table:device_registrations
- file:services/signaling-server/src/index.ts

## Unknown

- Exact desktop (Tauri) pairing UI labels; only the store call was found.
- Whether the Chrome extension has any pairing.
- Retention of device_registrations rows and audit events.
- Whether the relay URL is the same service the production deployment uses; no deployment state was read.
- Plan names that include remote_control; the capability table was not opened.
