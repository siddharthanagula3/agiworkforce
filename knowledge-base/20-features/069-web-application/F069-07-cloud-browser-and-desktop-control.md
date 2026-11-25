---
id: "F069-07"
type: "feature"
title: "Cloud browser and desktop control"
aliases: ["Your computer", "Remote Control (browser side)", "Send a task to Desktop from a browser", "Cloud browser (S69.11)", "Remote desktop-host control (S69.12)", "remote dispatch"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "partial", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.11", "S69.12"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:basic", "plan:pro", "plan:max", "plan:team", "plan:enterprise", "file:apps/web/app/api/pair/claim/route.ts", "file:apps/web/lib/feature-flags/remote-control-gate.ts", "api:POST /api/pair/claim", "api:POST /api/pair/initiate", "api:GET /api/settings/devices", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-07 Cloud browser and desktop control

Two ideas. Cloud browser, where the assistant drives a browser hosted by us, has no code on the web app. Browser control of a paired Desktop host is partly built: the page 'Your computer' (/code/computer) pairs a browser tab with Desktop, sends tasks, cancels, resends and shows status and result text. No screen view or step approval was found.

Area: [69. Web application](README.md). Requirement items: [S69.11](../../10-requirements/capabilities/069-web-application.md#s6911), [S69.12](../../10-requirements/capabilities/069-web-application.md#s6912).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Cloud browser: would let the assistant navigate, click and read pages in a browser we host. Not built. Browser control: a signed-in web tab pairs with the user's own Desktop host through a one-time link and sends it tasks, then follows their status (apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:34-40; apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:225-253).

**Why it exists.** The brief wants a user to work with no local desktop or extension (S69.11) and to steer their own computer from any browser (S69.12) (doc: knowledge-base/data/area-briefs/069-web-application.md). The product guide says execution environments must be told apart: built-in browser, existing browser session, cloud browser, native desktop automation (doc: docs/product/competitive-guidance.md:390).

**Who uses it.** Signed-in web users on a paid plan who also run Desktop (Electron) on a computer linked to the same account [inferred from RemoteComputerPage.tsx:97 and packages/contracts/types/src/billing-catalog.ts:352].

**Problems it solves**

- Start work on your own computer while away from it.
- See whether a sent task was accepted, is running, finished or failed.
- Stop or resend a task that was not confirmed.

**Use cases**

- From a laptop browser, paste a pairing link and ask Desktop to run a task in an allowed folder.
- Cancel a running task from the browser.
- Resend a task Desktop never confirmed.

## 2. User experience

**Where to find it**

- Web: Code rail item 'Your computer' goes to /code/computer; hidden when the page runs inside the Desktop shell (apps/web/features/code/components/CodeRail.tsx:88-93,120-123).
- Web: the link component RemoteComputerLink exists, but no importer was found outside its own index file (apps/web/features/remote-dispatch/index.ts:1).
- Desktop (hosted web app in Electron): Settings, Capabilities, 'Remote Control' section makes the pairing code and a copy-link action; the section renders nothing in a plain browser (apps/web/features/desktop-host/components/RemoteControlSection.tsx:166; apps/web/features/settings/sections/CapabilitiesSection.tsx:215).
- Cloud browser: nowhere on any app.

**Before you start**

- Signed in to the web app.
- A paid plan: basic, pro, max, max_15x, team, team_premium or enterprise (apps/web/lib/feature-flags/remote-control-gate.ts:57-76 with packages/contracts/types/src/billing-catalog.ts:332-340,352).
- Desktop signed in to the same account with Remote Control on and a fresh link copied.
- The screen share switch open and workspace policy allowing it (apps/web/lib/feature-flags/remote-control-gate.ts:29-52).

**Screens and controls**

- Heading 'Your computer' with intro text (RemoteComputerPage.tsx:33-35).
- List 'Computers on your account' with name, online/asleep/offline, and 'update Desktop on it to send tasks' when the computer lacks the remote-control capability (RemoteComputerPage.tsx:36,93-111,329-340).
- Empty state 'No computer with Desktop is linked to this account yet.' with link 'Get Desktop for your computer' (RemoteComputerPage.tsx:37,322-327).
- Input 'Pairing link' and button 'Connect' (RemoteComputerPage.tsx:41-44,406-418).
- After connecting: 'Connected to <name>', button 'Disconnect', task box, 'Send to computer', a microphone button 'Start voice input' (RemoteComputerPage.tsx:343-393).
- Task cards with status, message, result, error, and 'Cancel' / 'Send again' (RemoteComputerPage.tsx:55-56,430-480).

**Journey**

1. On Desktop open Settings, Capabilities, Remote Control and choose the copy-link action for a browser (RemoteComputerPage.tsx:39-40).
2. In the browser open 'Your computer' and paste the link, or open the link itself: the #fragment is read once and removed from the address bar (RemoteComputerPage.tsx:215-222).
3. Press 'Connect'. The page shows 'Connecting to your computer' (RemoteComputerPage.tsx:45).
4. When Desktop is ready the page shows 'Connected to <name>'.
5. Type a task, press 'Send to computer'. A card appears as Queued and updates as Desktop reports.
6. Use 'Cancel' on an open task, or 'Send again' if Desktop has not confirmed it.
7. Press 'Disconnect' and confirm; the pairing ends and the link stops working (RemoteComputerPage.tsx:47-50).

**What the person sees and gets**

- Status label per task and result text from Desktop (RemoteComputerPage.tsx:440-448).
- Errors: link invalid, link expired or used, another device already connected, other account, connection ended, device unlinked (remote-dispatch-client.ts:16-26; RemoteComputerPage.tsx:43).
- 'Your computer went offline. This page reconnects when it is back.' (RemoteComputerPage.tsx:46).

**Settings**

- Desktop Remote Control section; plan; screen share kill switch (packages/contracts/types/src/feature-registry.json:187); workspace policy 'remote_control'.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Browser pairing page, claim call, signed task envelope, send/cancel/resend, receipt retry up to 3 attempts, status display (RemoteComputerPage.tsx:118-300; remote-dispatch-client.ts:108-255).
- Server claim endpoint checks CSRF, session, rate limit and the standing refusal, then asks the relay to claim for this account and records an audit event (apps/web/app/api/pair/claim/route.ts:46-80,93-190).
- Route /code/computer exists (apps/web/app/code/computer/page.tsx:1-12).

**Incomplete**

- Screen view and step approval from the browser: not found in RemoteComputerPage.tsx; only prompt, status and result text exist. S69.12 asks for 'approve steps, see its screen'.
- The browser page lists only Electron desktop devices (RemoteComputerPage.tsx:97).
- RemoteComputerLink component has no importer outside its index (search of apps/web).

**Present but disconnected or switched off**

- Pairing is refused while the screen share switch is closed (apps/web/lib/feature-flags/remote-control-gate.ts:29-52).
- Claim returns 503 'Pairing is not configured' when the relay address or internal secret env vars are missing (apps/web/app/api/pair/claim/route.ts:70-80).

**Not available**

- Cloud browser on the web app: search of apps/web app, lib and features found only connector-directory labels such as a browserbase badge (apps/web/lib/connectors/directory/badge.ts:96,128), not a feature.
- Mobile, CLI, VS Code, Chrome extension: not part of this feature (brief marks n/a).

## 4. Required behaviour

**Established requirements**

- The assistant can drive a cloud browser for a web user without a local desktop or extension. (source: S69.11 (brief); status web missing)
- From a normal browser tab a user can control a paired desktop host: send work, approve steps, see its screen. (source: S69.12 (brief); status web missing)
- Remote Control is governed by the screen share switch and a paid plan; a pairing must not outlive a reason that would have refused it. (source: apps/web/lib/feature-flags/remote-control-gate.ts:29-33)
- Execution environments (built-in browser, existing session, cloud browser, desktop automation) are distinguished. (source: doc: docs/product/competitive-guidance.md:390)
- Surface matrix lists Remote control as experimental and present on web (via the Desktop settings section), desktop, mobile and VS Code; absent on CLI and Chrome. (source: doc: docs/product/surface-feature-matrix.md:107,562-570)

**Acceptance criteria**

1. A paid user pastes a valid link on /code/computer and sees 'Connected to <name>'.
2. A task sent from the browser appears on Desktop and its status changes appear on the card.
3. Cancel on an open task reaches Desktop; failure shows the cancel error.
4. A used or expired link shows the 'expired or already used' message.
5. A free-plan account or a closed screen share switch is refused with a readable message.
6. No cloud browser control appears anywhere on web until built.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief status 'missing' for S69.12 is out of date, because the browser page exists; 'partial' fits better because screen view and approval are absent.
- [inferred] Cloud browser would run on our servers or a vendor, so it would need an explicit execution boundary and plan gate; none exist.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add step approval and a screen preview to the browser page, or change the brief text to the narrower task-dispatch promise.
- [proposed] Decide whether cloud browser is in scope; if so write a spec under docs/specs first.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | RemoteComputerPage / RemoteComputerScreen | `apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx` | Browser page 'Your computer': connect, send, cancel, resend, list computers |
| screen | Route /code/computer | `apps/web/app/code/computer/page.tsx` | Mounts the screen, noindex metadata |
| component | RemoteComputerLink | `apps/web/features/remote-dispatch/components/RemoteComputerLink.tsx` | Link 'Your computer', hidden in desktop shell; no importer found |
| component | CodeRail item computer | `apps/web/features/code/components/CodeRail.tsx` | Rail entry to the page, hidden when the desktop host exists |
| service | connectRemoteDispatch | `apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts` | Claim, signaling socket, signed task envelopes, receipts, retry |
| service | dispatch envelope | `apps/web/features/remote-dispatch/lib/dispatch-envelope.ts` | Session key, sign and open control envelopes |
| service | browser pairing link parser | `apps/web/features/remote-dispatch/lib/browser-pairing.ts` | REMOTE_COMPUTER_PATH and link read/build |
| component | RemoteControlSection | `apps/web/features/desktop-host/components/RemoteControlSection.tsx` | Desktop-only settings section: code, QR, copy link, stop |
| screen | CapabilitiesSection | `apps/web/features/settings/sections/CapabilitiesSection.tsx` | Hosts Remote Control section |
| endpoint | POST /api/pair/claim | `apps/web/app/api/pair/claim/route.ts` | Claims the pairing for the signed-in account via relay |
| endpoint | POST /api/pair/initiate | `apps/web/app/api/pair/initiate/route.ts` | Desktop side creates the pairing; same standing refusal |
| endpoint | pair standing route | `apps/web/app/api/pair/standing` | Standing recheck of a live pairing (folder exists; file not opened) |
| service | remote-control-gate | `apps/web/lib/feature-flags/remote-control-gate.ts` | Switch, plan and policy refusal |
| config | screen_share kill switch | `packages/contracts/types/src/feature-registry.json` | Governs remote control |
| config | remote_control plan tiers | `packages/contracts/types/src/billing-catalog.ts` | Paid tiers allowed |
| endpoint | GET /api/settings/devices | `apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx` | Lists linked computers (client call at line 144) |
| service | signaling-server (relay) | `services/signaling-server` | Relay for pairing and signals (folder exists; not read) |
| test | remote dispatch client test | `apps/web/features/remote-dispatch/lib/remote-dispatch-client.test.ts` | Unit test file |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Desktop creates a pairing and shows a code and secret; user copies a link containing both in the URL fragment. | device and our servers | apps/web/features/desktop-host/components/RemoteControlSection.tsx; apps/web/app/api/pair/initiate/route.ts:66; browser-pairing.ts:27-29 |
| Browser reads the fragment and removes it from the address bar. | device | RemoteComputerPage.tsx:215-222 |
| Browser posts the code to /api/pair/claim with CSRF; the server checks session, rate limit, plan, policy, switch, then calls the relay with an internal secret. | our servers | apps/web/app/api/pair/claim/route.ts:46-130 |
| Server returns a token and websocket address; the browser opens the signaling socket. | outside service | claim/route.ts:166-190; remote-dispatch-client.ts:179-188 (relay code is in services/signaling-server; where it is hosted is not established) |
| Browser signs the task with a key derived from the code, salt and secret and sends it as a control signal; Desktop answers with a receipt and status updates. | device | remote-dispatch-client.ts:190-194,225-234; dispatch-envelope.ts |
| Desktop runs the task on the computer, with the folders and apps allowed there. | device | RemoteComputerPage.tsx:34-35 (page text); execution code in apps/desktop not read |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pairing code and secret | Desktop memory and link fragment; browser memory only | No; relay holds the pairing while live | One use; Disconnect ends it (RemoteComputerPage.tsx:47-50) |
| Task prompts, status, results | React state in the page | Not stored by the web app; relay carries signals | Lost on reload; page says last status is not live after reconnect (RemoteComputerPage.tsx:61-62) |
| Audit event remote_pairing_claimed | Workspace audit log (claim/route.ts:170-182) | Server | Retention not established |

**Models and providers.** The web side never calls a model. Which model runs the task is decided by Desktop; not established from web code. No provider folder is involved on the web side.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; the relay refuses a pairing made for another account (claim/route.ts:30-39,148-152). |
| Permissions | Workspace policy 'remote_control' and the standing refusal (remote-control-gate.ts:100-110). |
| Subscription | Paid plans only: basic, pro, max, max_15x, team, team_premium, enterprise (billing-catalog.ts:332-340,352). Free refused with plan_upgrade_required (remote-control-gate.ts:68-77). |
| Limits and metering | Rate-limit bucket 'device-link' on claim (claim/route.ts:63). No usage metering found. |
| Feature flags | screen_share kill switch; rollout ring 'remote_control' (feature-registry.json:187-189); env names SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Local mode on web is not defined for this feature. Pairing needs our server and relay, so it does not work offline. The task itself runs on Desktop; whether Desktop uses a local model for it is not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading computers | Spinner, then list or empty state | RemoteComputerPage.tsx:319-327 |
| Invalid link | Shows the link-invalid message | RemoteComputerPage.tsx:43,224-229 |
| Link used/expired, other device present, other account | Specific messages | remote-dispatch-client.ts:16-21 |
| Computer goes offline | Shows away notice; page waits | RemoteComputerPage.tsx:46,187-189 |
| Connection closed or device unlinked | Returns to idle with message; open tasks say last status only | remote-dispatch-client.ts:164-173; RemoteComputerPage.tsx:61-62 |
| No receipt for a task | Retries up to 3 times at 8 seconds, then marks unconfirmed with 'Send again' | remote-dispatch-client.ts:27-30,207-223 |
| Cancel/resend failed | Error line | RemoteComputerPage.tsx:58-60 |
| Desktop shell | Rail item hidden; Remote Control section shown instead | CodeRail.tsx:120-123; RemoteControlSection.tsx:166 |
| Reload | Connection and task list are lost (React state only) | RemoteComputerPage.tsx:120-127 [inferred] |
| Accessibility | Labelled inputs, role=status and role=alert used | RemoteComputerPage.tsx:353,403,421,462 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/remote-dispatch/lib/remote-dispatch-client.test.ts`: Remote dispatch client (name only; file not opened)
- `apps/web/features/remote-dispatch/components/__tests__/RemoteComputerPage.test.tsx`: The page (name only)
- `apps/web/app/api/pair/__tests__/remote-control-switch.test.ts`: Pairing refused while the switch is closed (name only)
- `apps/web/app/api/pair/__tests__/standing-recheck-policy.test.ts`: Standing recheck policy (name only)
- `apps/web/features/desktop-host/__tests__/RemoteControlSection.test.tsx`: Desktop settings section (name only)
- `apps/web/app/privacy/__tests__/remote-control-pairing-claims.test.ts`: Privacy claims about pairing (name only)

**Test scenarios**

- **Happy path**
  1. Sign in on a paid plan on web and Desktop.
  2. Copy the browser link in Desktop.
  3. Open /code/computer, paste, Connect.
  4. Send 'list the files in the allowed folder'.
  - Expected: Connected banner, task card moves from Queued to a final status with result text.
- **Free plan**
  1. Sign in with a free account.
  2. Try to claim a pairing.
  - Expected: 403 plan_upgrade_required with an upgrade message.
- **Switch closed**
  1. Close the screen share switch.
  2. Claim a pairing.
  - Expected: Refusal message naming Remote Control.
- **Reuse link**
  1. Connect once and Disconnect.
  2. Paste the same link.
  - Expected: 'expired or already used' message.
- **Computer sleeps**
  1. Connect.
  2. Put Desktop to sleep.
  - Expected: Away notice; reconnect when it wakes.

**Where to look when it fails**

- Server log 'Pairing is unconfigured', 'Signaling server unreachable while claiming a pairing', 'Signaling server refused the pairing claim' (claim/route.ts).
- Audit event remote_pairing_claimed (success or claim_rejected).
- Browser error messages in remote-dispatch-client.ts:16-30.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **No cloud browser feature.** Affects: Web users; S69.11. Evidence: No code found in apps/web; brief says missing. Work needed: Decide scope, write spec, build a hosted browser with an execution boundary and plan gate.
- **Browser cannot show the computer's screen or approve steps.** Affects: Web users; S69.12. Evidence: RemoteComputerPage.tsx has prompt, status, result only. Work needed: Add screen stream and approval controls, or narrow the requirement.
- **Brief says web missing and the matrix lists web via the Desktop settings section; both differ from the code, which has a task-dispatch page.** Affects: Anyone planning from the docs. Evidence: brief S69.12; docs/product/surface-feature-matrix.md:562-565. Work needed: Update the brief and matrix to say partial.
- **Link component has no importer; entry is only the Code rail.** Affects: Web users outside Code. Evidence: search for RemoteComputerLink. Work needed: Mount it or delete it.

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:basic
- plan:pro
- plan:max
- plan:team
- plan:enterprise
- file:apps/web/app/api/pair/claim/route.ts
- file:apps/web/lib/feature-flags/remote-control-gate.ts
- api:POST /api/pair/claim
- api:POST /api/pair/initiate
- api:GET /api/settings/devices
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-authentication-and-identity

## Unknown

- Whether Desktop shows step approval to a browser peer: desktop code not read.
- Where the relay is hosted and how it is deployed.
- Whether any app screen other than the Code rail links to /code/computer.
- Contents of the listed test files were not opened.
- What decides which model the desktop uses for a dispatched task.
- Retention period of the audit events.
