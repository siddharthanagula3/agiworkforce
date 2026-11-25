---
id: "F102-10"
type: "feature"
title: "Mobile app and phone-to-desktop relay"
aliases: ["Mobile app", "AGI Mobile", "Expo React Native app", "camera screen", "voice input / dictation", "Remote control (phone to desktop)", "Companion", "Remote relay", "signaling server", "pairing", "Native audio/camera modules (S102.25)", "Remote-device relay (S102.26)"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.24", "S102.25", "S102.26"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-sync-and-continuity", "SYS-voice-and-media", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-api-and-contracts", "surface:mobile", "surface:desktop", "surface:web", "mode:cloud", "api:POST /api/pair/claim", "api:POST /api/pair/initiate", "file:services/signaling-server/src/index.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-10 Mobile app and phone-to-desktop relay

The phone app is an Expo React Native app with native camera and on-device speech recognition. A phone can pair with a desktop by scanning a code and then control it through a relay (the signaling server). In the current build the phone-side Remote screens are switched off by a feature flag.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.24](../../10-requirements/capabilities/102-runtime-inventory.md#s10224), [S102.25](../../10-requirements/capabilities/102-runtime-inventory.md#s10225), [S102.26](../../10-requirements/capabilities/102-runtime-inventory.md#s10226).

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

**What it does.** The mobile app (apps/mobile) runs on React Native with native modules (apps/mobile/package.json:87-141). It captures photos with the camera and speech with the phone's recognizer. A separate pairing flow joins a phone (controller) to a desktop (host) through a relay service that mints short-lived credentials (apps/web/app/api/pair/claim/route.ts; services/signaling-server/src/index.ts:703-940).

**Why it exists.** Phone users need to photograph and dictate. Remote control lets a phone send work to the desktop; Remote Control is a Claude feature the product benchmarks against (doc: docs/product/requirements.md:189-192).

**Who uses it.** Phone users; paid-plan users who pair a desktop.

**Problems it solves**

- Take a picture and ask about it.
- Speak instead of typing, with speech recognised on the phone.
- Reach a desktop agent from a phone without a shared network.

**Use cases**

- Open the camera, take a photo and tap 'Send to AI'.
- Hold the voice button and dictate a message.
- Pair the phone to the desktop by scanning a QR code (planned; hidden today).

## 2. User experience

**Where to find it**

- Mobile camera screen: route apps/mobile/app/(app)/camera.tsx.
- Mobile voice: chat composer button 'Start voice mode' (ChatInput.tsx:2293); dictation uses the same composer.
- Mobile Remote control: Settings > 'Remote control' (remote-control.tsx:181), and the companion screens under apps/mobile/app/(app)/companion. Currently shows an unavailable notice for 'Remote' because FEATURES.companion is false (apps/mobile/lib/v1FeatureFlags.ts:16; remote-control.tsx:131).
- Desktop: the pairing code and QR are shown by the hosted web app (apps/web/features/desktop-host/lib/remote-pairing.ts) in the Electron window.
- Web, CLI, Chrome: not part of this feature. VS Code has its own remote-control service (not read).

**Before you start**

- Camera: operating-system camera permission and the capability 'canUseCamera' (camera.tsx:37-38).
- Voice: microphone permission and speech recognition permission; on-device recognition must be available.
- Remote control: signed-in account, a paid plan, the Remote Control switch open, workspace policy allowing it, and the relay configured on the server (remote-control-gate.ts; pair/claim/route.ts:69-80). Mobile flag FEATURES.companion true (currently false).

**Screens and controls**

- Camera: buttons labelled 'Take photo', 'Send to AI', 'Allow camera access', 'Open device settings', 'Switch to front camera' / 'Switch to rear camera', 'Turn flash on' / 'Turn flash off', 'Turn torch on' / 'Turn torch off'; text field 'Image prompt' (camera.tsx:217-377).
- Remote control settings: 'Connection' group, device row, rows 'Pair a computer' or 'Open Remote', 'Reconnect', 'Disconnect'; follow-up choice 'Queue' or 'Steer'; status words 'Connected', 'Connecting…', 'Reconnecting…', 'Session expired', 'Connection error', 'Not connected' (remote-control.tsx:36-38, 91-108, 181-250).
- Disconnect asks: 'Disconnect from <name>?' with 'This ends the pairing. To connect again, scan a new QR code on the computer.' (remote-control.tsx:166-173).

**Journey**

1. Camera: 1. Open the camera screen. 2. Allow camera access if asked. 3. Choose front or rear camera and flash or torch. 4. Tap 'Take photo' (takePictureAsync, camera.tsx:73). 5. Add an optional 'Image prompt'. 6. Tap 'Send to AI'.
2. Voice: 1. Tap the voice entry. 2. The recognizer starts with the active speech language (voice.ts:16-26). 3. Partial text shows while speaking. 4. Stop, or the 60 second limit ends it (voiceInput.ts:MAX_LISTEN_MS).
3. Pairing: 1. On the desktop, the web app calls POST /api/pair/initiate and shows a QR code and code (remote-pairing.ts:24-55). 2. The phone scans it; payloads start with 'agiw3:' (manualPairing.ts:20-29). 3. The phone calls POST /api/pair/claim (manualPairing.ts:165). 4. The web server asks the relay to claim the pairing as the same account (claim/route.ts:97-123). 5. The phone gets a pair token and a secure WebSocket URL and connects. 6. The desktop host connects to the same relay (remoteControlService.ts:191-194).

**What the person sees and gets**

- Camera: preview, captured image with prompt box, errors for denied permission.
- Voice: partial and final transcript; errors with codes mic-permission-denied, on-device-recognition-unavailable, aborted, recognition-error, max-duration-reached, voice-input-disabled (voiceInput.ts:10-17).
- Pairing errors: 'pairing_not_found' (404), 'pairing_role_in_use' (409), 'pairing_belongs_to_another_account' (403), 'Pairing is not configured' (503), 'Signaling server unavailable' (503) (claim/route.ts:79, 122, 129-142). Old QR: PAIRING_UPDATE_REQUIRED_MESSAGE (manualPairing.ts:31-32).

**Settings**

- Settings > Remote control (follow-up behaviour Queue or Steer).
- Speech language setting (speechSettings.ts).
- Server configuration names: SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET (values never recorded); relay WS_PING_INTERVAL_MS (connection-manager.ts:12-15).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Camera screen with preview, front/rear switch, flash and torch, photo capture, and permission prompts (camera.tsx:36-377).
- Voice capture through expo-speech-recognition with requiresOnDeviceRecognition set to true, 60 second cap and typed errors (voiceInput.ts:2-17, 60-66, 438, 493).
- Pairing: /api/pair/initiate and /api/pair/claim on the web server with CSRF, rate limit 'device-link', standing refusal check, audit event 'remote_pairing_claimed' (claim/route.ts:48-160).
- Relay: pairing create, lookup, claim, delete and device revoke endpoints; WebSocket server; per-connection record with ping counter; devices go stale after 60 seconds and sockets close after 5 minutes idle (index.ts:490, 703-968; connection-manager.ts:20-60; constants.ts:61, 97-99).
- Desktop host: Electron main process hosts the remote control service (apps/desktop/electron/remote/remoteControlService.ts).

**Incomplete**

- Relay and pairing are plan-gated to paid plans and need a server configured with the relay URL and secret; otherwise pairing returns 503 (billing-catalog.ts:352; claim/route.ts:69-80).

**Present but disconnected or switched off**

- Mobile Remote control: FEATURES.companion is false, so Settings > Remote control and every companion screen render the 'Remote' unavailable notice and the dispatch listeners return early (apps/mobile/lib/v1FeatureFlags.ts:16; remote-control.tsx:131; companion/index.tsx:108-183; app/_layout.tsx:812). The product matrix still lists Remote control as Present on mobile (doc: docs/product/surface-feature-matrix.md:107), because it measures code presence.
- FEATURES.dispatch is also false (v1FeatureFlags.ts:12).

**Not available**

- Web, CLI and Chrome have no phone-to-desktop controller.
- Computer-to-computer pairing is cut (doc: docs/decisions/wire-or-cut.md:163-168).

## 4. Required behaviour

**Established requirements**

- The mobile app runs as an Expo React Native app with native modules. Platform status: done. (source: S102.24 (brief item))
- Native audio and camera modules capture media on the device. Platform status: done. (source: S102.25 (brief item))
- A relay connects a controller device (mobile) to a remote host (desktop) through a signaling service. Platform status: done. (source: S102.26 (brief item))
- The web server claims the pairing and needs SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET; without them it refuses. (source: S102.26 Should line; verified at apps/web/app/api/pair/claim/route.ts:69-80 (HTTP 503 'Pairing is not configured'))
- A paired phone is not remembered and nothing is sent until a control verifies under the scanned secret. (source: doc: docs/decisions/wire-or-cut.md:748)
- The relay cannot tell accounts apart; the web server states the account and the relay refuses a mismatch. (source: apps/web/app/api/pair/claim/route.ts:35-45 (code comment); signaling index.ts:845-852)

**Acceptance criteria**

1. Camera: with permission denied, 'Allow camera access' and 'Open device settings' appear; with permission granted a photo can be taken and sent.
2. Camera: the flip button switches the facing label between 'Switch to front camera' and 'Switch to rear camera'; the torch control shows only on the rear camera.
3. Voice: dictation inserts partial and final text; recognition is on the device (requiresOnDeviceRecognition true); a session longer than 60 seconds stops.
4. Pairing: claiming with a wrong or expired code returns 404; a second phone returns 409; a different account returns 403.
5. Pairing with the relay variables unset returns 503 and logs 'Pairing is unconfigured...'.
6. A free-plan account is refused pairing with code 'plan_upgrade_required' (403).
7. With FEATURES.companion false, Settings > Remote control shows the unavailable notice and no pairing starts.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A relay outage must not leave the phone in a stuck 'Connecting' state; reconnect and 'Session expired' states exist [inferred from remote-control.tsx:91-108].
- Voice dictation in Local Mode should still work offline because recognition is on the device [inferred from requiresOnDeviceRecognition].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether the mobile v1 build ships Remote control; if not, hide it in docs and the matrix, if yes flip the flag and test.
- [proposed] Add a test that the relay refuses a claim from another account (a signaling test exists for tokens; confirm).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Mobile root layout | `apps/mobile/app/_layout.tsx` | App root (Expo Router), deep links and link handling. |
| config | Mobile package | `apps/mobile/package.json` | Expo, expo-camera (96), expo-audio (91), expo-speech-recognition (121), llama.rn, executorch. |
| screen | Camera screen | `apps/mobile/app/(app)/camera.tsx` | CameraView preview, capture, flash, torch, send (7, 36-377). |
| service | Voice recording wrapper | `apps/mobile/src/features/voice/services/voice.ts` | startRecording with the active speech language (16-26). |
| service | Voice capture session | `apps/mobile/src/features/voice/services/voiceInput.ts` | expo-speech-recognition session, on-device flag, 60 s cap, error codes. |
| service | Manual pairing client | `apps/mobile/services/manualPairing.ts` | Parses 'agiw3:' payloads, posts to /api/pair/claim (165). |
| screen | Remote control settings | `apps/mobile/app/(app)/settings/remote-control.tsx` | Pair, reconnect, disconnect, status; gated by FEATURES.companion (131). |
| config | v1 feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | companion false (16), dispatch false (12). |
| store | connectionStore (mobile) | `apps/mobile/stores/connectionStore.ts` | Connection status shown on the settings screen [inferred from import in remote-control.tsx]. |
| endpoint | POST /api/pair/claim | `apps/web/app/api/pair/claim/route.ts` | Phone claim; checks CSRF, rate limit, standing policy, relay config; calls the relay (1-160). |
| endpoint | POST /api/pair/initiate | `apps/web/app/api/pair/initiate/route.ts` | Desktop creates a pairing session through the relay (47-143). |
| endpoint | /api/pair/standing | `apps/web/app/api/pair/standing/route.ts` | Recheck of a live pairing against plan and policy (described in remote-control-gate.ts). |
| service | Remote control gate | `apps/web/lib/feature-flags/remote-control-gate.ts` | Workspace policy, plan (paid tiers) and switch checks (37-125). |
| service | Relay HTTP and WebSocket server | `services/signaling-server/src/index.ts` | POST /pairings (703), GET (775), POST claim (820), DELETE (940), device revoke (968), WebSocketServer (490). |
| service | ConnectionManager | `services/signaling-server/src/connection-manager.ts` | Per-socket record with unansweredPings, idle cleanup, device freshness (20-60, 100-142). |
| service | Desktop host service | `apps/desktop/electron/remote/remoteControlService.ts` | Electron host that connects to the relay (191-194). |
| service | Desktop pairing client | `apps/web/features/desktop-host/lib/remote-pairing.ts` | beginRemotePairing calls /api/pair/initiate and starts the host (24-55). |
| test | Mobile pairing tests | `apps/mobile/__tests__` | manual-pairing, manual-pairing-connect, pair-deep-link, pairing-payload-contract, QrScannerPairing, CompanionPairing*. |
| test | Relay tests | `services/signaling-server/__tests__` | connection-manager, connection-liveness, device-revocation, pair-token, pairing-code-contract, expired-pairings, standing. |
| test | Camera tests | `apps/mobile/__tests__/CameraTorchAndFacing.test.tsx` | Torch and facing controls [inferred from name]; also CameraDeepLinkTarget.test.tsx. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Photo is captured by the native camera module and kept on the phone as a file. | device | apps/mobile/app/(app)/camera.tsx:73 |
| Speech is recognised by the phone's recogniser with on-device recognition required, so audio is not sent to a server for transcription. | device | apps/mobile/src/features/voice/services/voiceInput.ts:438, 493 |
| The desktop (hosted web app) asks the web server to create a pairing; the web server asks the relay. | our servers | apps/web/features/desktop-host/lib/remote-pairing.ts:24-55; services/signaling-server/src/index.ts:703 |
| The phone sends the scanned code to the web server with its session; the web server checks CSRF, rate limit and policy, then calls the relay with a secret and the account id. | our servers | apps/web/app/api/pair/claim/route.ts:48-123 |
| The relay checks the pairing belongs to that account, issues a pair token and a WebSocket URL. | our servers | services/signaling-server/src/index.ts:820-870 |
| Phone and desktop connect to the relay over secure WebSocket; the relay pings every 25 seconds and drops a socket after 2 missed pongs or 5 minutes idle. | our servers | services/signaling-server/src/constants.ts:61, 97-99; connection-manager.ts:20-60 |
| The desktop host runs the requested work on the desktop. | device | apps/desktop/electron/remote/remoteControlService.ts [inferred; not read in detail] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Captured photo | Phone cache then the chat attachment | Sent to the model only when sent in a chat | Unknown |
| Voice transcript | Composer text on the phone | Only when the message is sent | Per chat rules |
| Pairing session and credentials | Relay's store (table name not opened); phone and desktop keep the pair token in memory or secure storage [unknown] | Between relay, web server and the two devices | Short-lived: pairings expire (expired-pairings.ts); audit events recorded as 'remote_pairing_claimed' |
| Workspace audit event | Server audit log via recordWorkspaceAuditEvent | Server only | Per audit retention rules (unknown) |

**Models and providers.** The relay uses no model. Dictation uses the phone's recogniser, not a provider. Which model the desktop uses for work received from the phone: unknown (see F102-08, desktop answers in the cloud).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Camera and voice: no account found as a requirement for capturing. Remote control: signed-in account (getUserScopedDb, claim/route.ts:50-60). |
| Permissions | OS camera and microphone permissions; speech recognition permission; capability checks 'canUseCamera' (camera.tsx:37). Relay uses an internal bearer secret only the web server holds (claim/route.ts:69-71, 103). |
| Subscription | Remote control is limited to paid tiers (billing-catalog.ts:332-352, PAID_TIERS) and refused with 'plan_upgrade_required' (remote-control-gate.ts:62-75). The settings screen shows 'Remote Control comes with paid plans.' or "Remote Control isn't included in your plan." (remote-control.tsx:29-31). |
| Limits and metering | Pairing rate limit 'device-link' per user (claim/route.ts:~64); relay limiters for create, lookup, claim, delete and revoke; per-IP connection cap MAX_CONNECTIONS_PER_IP (connection-manager.ts:6). Values not recorded here. |
| Feature flags | Mobile FEATURES.companion (false) and FEATURES.dispatch (false); server screen share capability switch governs Remote Control (remote-control-gate.ts:37-45). |
| Model compatibility | Not applicable to the relay. Camera images need a vision-capable model route [inferred; camera.tsx imports the model store]. |
| Provider restrictions | Relay URLs must be secure (isSecureRelayUrl, claim/route.ts:26-35; insecure only in development). |
| Local mode | Camera and dictation work on-device. Remote control is a Cloud-account feature: it needs sign-in, a plan and our relay, so it is not available in Local Mode [inferred from the gate order]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Camera permission not granted | Shows 'Allow camera access' and 'Open device settings'. | camera.tsx:214-225 |
| Camera blocked by capability | CapabilityUnavailable is shown. | camera.tsx:37-38, 25 |
| Voice permission denied or recogniser unavailable | Typed errors mic-permission-denied and on-device-recognition-unavailable. | voiceInput.ts:10-17 |
| Voice runs too long | Stops at 60 seconds (max-duration-reached). | voiceInput.ts:60-66 |
| Relay not configured | HTTP 503 'Pairing is not configured' and an error log. | claim/route.ts:69-80 |
| Relay unreachable or slow | 10 second timeout then 503 'Signaling server unavailable'. | claim/route.ts:~22, 120-123 |
| Pairing used, wrong account, expired | 409, 403 (with audit failure event) and 404. | claim/route.ts:129-143 |
| Old QR from an older desktop | Update message shown. | manualPairing.ts:31-32 |
| Device revoked | Relay closes the socket with code 1008 'device_revoked'. | connection-manager.ts:48-49 |
| Mobile feature off | 'Remote' unavailable notice. | remote-control.tsx:131 |
| Offline / reconnect | Status 'Reconnecting…' and a 'Reconnect' row when disconnected and paired. | remote-control.tsx:91-108, 242 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/manual-pairing.test.ts`: Manual pairing payload handling [inferred from name].
- `apps/mobile/__tests__/pairing-payload-contract.test.ts`: Pairing payload contract [inferred from name].
- `apps/mobile/__tests__/QrScannerPairing.test.tsx`: QR scanner pairing [inferred from name].
- `apps/mobile/__tests__/CompanionPairingRequirements.test.tsx`: Pairing requirements [inferred from name].
- `apps/mobile/__tests__/CameraTorchAndFacing.test.tsx`: Camera torch and facing controls [inferred from name].
- `apps/mobile/__tests__/ChatInputDictation.test.tsx`: Dictation in the composer [inferred from name].
- `apps/mobile/__tests__/PermissionsSpeechAndFaceId.test.tsx`: Speech permission [inferred from name].
- `apps/web/app/api/pair/claim/__tests__`: Claim route [inferred from folder name].
- `apps/web/app/api/pair/__tests__/remote-control-switch.test.ts`: Remote Control switch [inferred from name].
- `services/signaling-server/__tests__/connection-manager.test.ts`: Connection manager [inferred from name].
- `services/signaling-server/__tests__/device-revocation.test.ts`: Revocation [inferred from name].
- `apps/desktop/electron/__tests__/remoteControlService.test.ts`: Desktop host service [inferred from name].

**Test scenarios**

- **Camera capture**
  1. Open the camera screen on a device.
  2. Deny permission, then allow it.
  3. Take a photo, type a prompt, tap 'Send to AI'.
  - Expected: Denied state shows the two buttons; after allow the photo is sent into the chat.
- **Dictation on device**
  1. Turn on airplane mode.
  2. Use dictation in a chat.
  - Expected: Text is recognised without a network.
- **Pair with a paid account**
  1. With the mobile flag on, sign in on both devices with a paid account.
  2. Show the QR on the desktop, scan it on the phone.
  - Expected: Status reaches 'Connected'; audit event 'remote_pairing_claimed' is written.
- **Free account**
  1. Repeat with a free account.
  - Expected: 403 'plan_upgrade_required'; the screen says Remote Control is not in the plan.
- **Relay not configured**
  1. Start the web server without the relay variables and call POST /api/pair/claim.
  - Expected: 503 'Pairing is not configured' and an error log.
- **Feature off**
  1. Open Settings > Remote control in the current mobile build.
  - Expected: The 'Remote' unavailable notice.

**Where to look when it fails**

- Server log 'Pairing is unconfigured: SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET are both required'.
- Server logs 'Signaling server unreachable while claiming a pairing' and 'Signaling server refused the pairing claim'.
- Relay logs 'Pairing claim refused', metrics 'pairing_account_mismatch' (index.ts:846-851).
- Workspace audit events remote_pairing_claimed (success and failure).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief marks the relay and mobile control as done, but the mobile Remote screens are off in the current build.** Affects: Mobile users; any claim that the phone can control a desktop.. Evidence: apps/mobile/lib/v1FeatureFlags.ts:16; remote-control.tsx:131.. Work needed: Either enable and verify, or record it as hidden in v1 in the brief and matrix.
- **Relay and server need production configuration; absence only shows as a 503 at claim time.** Affects: All pairing.. Evidence: claim/route.ts:69-80.. Work needed: Add a readiness check or deploy-time check that both values exist [proposed].
- **Whether the phone-to-desktop session content is end-to-end protected beyond the pair token was not established.** Affects: Privacy claims.. Evidence: Only a decision row (wire-or-cut.md:748) and relay code at index.ts were seen.. Work needed: Read the host and controller crypto in packages/utils/remote-control.
- **Subscription rules are per surface in code (paid tiers), not read from one shared place on the phone; the phone has its own flag.** Affects: One-subscription-system requirement.. Evidence: remote-control.tsx:156-157 uses canUseBillingPlanCapability; flag false.. Work needed: Confirm the shared capability table is the only source (billing-catalog.ts:352).

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-sync-and-continuity
- SYS-voice-and-media
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-api-and-contracts
- surface:mobile
- surface:desktop
- surface:web
- mode:cloud
- api:POST /api/pair/claim
- api:POST /api/pair/initiate
- file:services/signaling-server/src/index.ts

## Unknown

- Name of the relay's database table for pairings.
- Whether the session between phone and desktop is end-to-end protected.
- Which model the desktop uses for phone-sent work.
- Retention of captured photos.
- What the VS Code remote-control service does (not read).
- Whether and when the mobile companion flag will be switched on.
