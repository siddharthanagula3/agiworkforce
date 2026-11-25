---
id: "F010-10"
type: "feature"
title: "Device permissions and approvals"
aliases: ["Microphone permission explanation", "Computer-control permission", "Folder-access permission", "Tool-action approval", "Remote-device pairing", "Permission required", "S10.34", "S10.36", "S10.37", "S10.38", "S10.40"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S10.34", "S10.36", "S10.37", "S10.38", "S10.40"]
depends_on: ["SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-voice-and-media", "SYS-sync-and-continuity", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:web", "api:POST /api/pair/initiate", "api:POST /api/pair/claim", "store:chrome.storage.local"]
basis: "code inspection"
second_reader: "9 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-10 Device permissions and approvals

Asks before the assistant uses a device capability. Explains microphone use on mobile and Chrome, asks before computer or browser control and before reading or writing a folder, shows each tool call for approval, and pairs a phone by code or QR. Scopes are wider than one call in several apps, and mobile pairing is switched off.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.34](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1034), [S10.36](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1036), [S10.37](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1037), [S10.38](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1038), [S10.40](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1040).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gates device powers behind a question the person can answer, remembers the answer, and lets them revoke it. Also links another device to a desktop.

**Why it exists.** The assistant can click, type, read files and run commands. People must stay in control of what it may touch, and a phone should only join a desktop the person owns.

**Who uses it.** Anyone using voice, computer use, browser control, folder tools, code agents or remote control.

**Problems it solves**

- Unexpected microphone or screen use
- Agent touching folders without consent
- Repeated stacked prompts
- Pairing a stranger's phone

**Use cases**

- First voice dictation on Chrome shows a notice, then the browser asks
- Desktop asks before the assistant controls the mouse and keyboard
- Approve one shell command in the CLI
- Show a pairing QR on desktop to link a phone

## 2. User experience

**Where to find it**

- Desktop (Electron) native dialog titled 'Permission required' (apps/desktop/electron/runtime/permissionManager.ts:365)
- Web and Desktop: 'Attach from a local folder' dialog (apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:25)
- Chrome: options page consent for browser control per site, and side panel microphone notice (apps/extension/src/features/computer-use/browserControlConsent.ts:6, apps/extension/src/features/side-panel/voice.ts:76)
- CLI: approval overlay with keys (apps/cli/src/tui/widgets/approval_overlay.rs:60)
- VS Code: approval prompts keyed by tool (apps/extension-vscode/src/features/permissions/approvalScope.ts:18)
- Pairing: Remote Control section 'Pair a phone' on desktop (apps/web/features/desktop-host/components/RemoteControlSection.tsx:291); VS Code panel with QR (apps/extension-vscode/src/features/remote-control/index.ts:140)

**Before you start**

- Desktop pairing needs a signed-in account on a paid plan, a workspace policy that allows Remote Control, and the server-side screen-share switch open; Free is refused with 403 plan_upgrade_required (apps/web/app/api/pair/initiate/route.ts:55-67, apps/web/lib/feature-flags/remote-control-gate.ts:95-125; the desktop UI says 'Remote Control comes with paid plans.' at apps/web/features/desktop-host/components/RemoteControlSection.tsx:48)
- Mobile pairing screens are behind flags that are currently off (apps/mobile/lib/v1FeatureFlags.ts:12, :16)

**Screens and controls**

- Desktop prompt buttons: 'Deny', 'Allow this session', 'Always allow' (not offered for high-impact permissions), optional 'Never allow' (apps/desktop/electron/runtime/permissionManager.ts:357)
- Chrome microphone notice buttons 'Not now' and 'Continue' (apps/extension/_locales/en/messages.json:836)
- Chrome browser-control headline 'This grants full DevTools-Protocol control' (apps/extension/src/features/computer-use/browserControlConsent.ts:8)
- CLI buttons Yes, No, Allow Session, Always allow, Deny All, Allow All with keys y n s a d t (apps/cli/src/tui/widgets/approval_overlay.rs:104)
- Web and mobile tool card: Allow and Deny; labels also include 'Allow once', 'Allow for this chat', 'Always allow' (packages/contracts/types/src/tool-approval-policy.ts:21)
- Pairing: QR image, code, 'Refresh pairing code', 'Cancel pairing' (apps/web/features/desktop-host/components/RemoteControlSection.tsx:193, :315)

**Journey**

1. Start the action (voice, computer use, folder tool, tool call, remote control)
2. If no stored answer exists, a question appears naming who may do what
3. Choose an answer; it is recorded
4. A repeat request for the same thing joins the open question
5. For pairing: show code or QR on desktop, scan on the phone, then desktop asks to allow the phone itself

**What the person sees and gets**

- Denied commands return 'Permission to <capability> was not granted.' (apps/desktop/electron/runtime/dispatcher.ts:3430)
- Chrome mic blocked text: 'Microphone access is blocked. Allow the microphone for AGI in Chrome site settings, then try again.' (apps/extension/_locales/en/messages.json:825)
- Mobile: 'Microphone access is off. Enable microphone permission in Settings to use voice.' (apps/mobile/src/features/voice/services/voiceFailure.ts:16)
- Pairing errors such as 'Pairing could not start.' (apps/web/features/desktop-host/lib/remote-pairing.ts:5)

**Settings**

- Desktop permissions review lists stored decisions (apps/desktop/electron/runtime/permissionManager.ts:299)
- Chrome site allowlist and browser-control consent removal revokes (apps/extension/src/features/computer-use/browserControlConsent.ts:159)
- Tool approval policy (packages/contracts/types/src/tool-approval-policy.ts:4)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop requestPermission asks once, stores the answer, returns the stored state and joins an open question for the same key (apps/desktop/electron/runtime/permissionManager.ts:318, :334)
- Computer-use commands map to capability computer.use and are gated before running (apps/desktop/electron/runtime/dispatcher.ts:1100, :3418)
- Folder commands are gated per workspace root with a separate agent-first check (apps/desktop/electron/runtime/dispatcher.ts:3447)
- High-impact permissions last only until quit (apps/desktop/electron/runtime/permissionManager.ts:387)
- The capabilities computer.use, host.remote, shell.execute, application.control, browser.cdp and git.destructive are all high-risk, so computer-control prompts never offer 'Always allow' and last only until the app quits (packages/contracts/local-runtime/src/capabilities.ts:67-74)
- Chrome browser control needs both an in-extension record and the browser's site permission, per normalized origin, and refuses the account origins (apps/extension/src/features/computer-use/browserControlConsent.ts:120, :133)
- Chrome microphone notice shows once and stores an acknowledgment (apps/extension/src/features/side-panel/voice.ts:28, :104)
- Mobile checks microphone permission before requesting and reports a refusal with settings guidance (apps/mobile/src/features/voice/services/voiceInput.ts:215, apps/mobile/src/features/voice/services/voiceFailure.ts:16); iOS usage text declared (apps/mobile/app.config.js:171)
- Pairing: desktop requests a code that expires (default 300 seconds), the claim route refuses a different account (apps/web/app/api/pair/initiate/route.ts:20, apps/web/app/api/pair/claim/route.ts:146)
- Pairing is gated by remoteControlStandingRefusal, which runs three checks in order: the workspace feature gate, the plan (403 plan_upgrade_required unless canUseBillingPlanCapability(plan,'remote_control'); the capability maps to PAID_TIERS, so Free is refused), then the screen-share kill switch. The same check runs on initiate and claim, and a plan lookup failure returns 503. Mobile also checks the plan client-side (apps/web/lib/feature-flags/remote-control-gate.ts:62-125, packages/contracts/types/src/billing-catalog.ts:352, apps/web/app/api/pair/initiate/route.ts:66)
- CLI folder trust gate and untrusted shell refusal (apps/cli/src/features/exec/tools/mod.rs:1784, :1809)
- The CLI refuses a shell tool in an untrusted workspace unless the user approves that one command, and no auto-approval mode waives it; workspace-layer 'Allow' policies are downgraded to 'Ask' until the repo is trusted (apps/cli/src/features/exec/tools/mod.rs:1784-1815)
- Approve route accepts approval answers for cloud tool calls (apps/web/app/api/llm/v1/chat/completions/approve/route.ts:706)

**Incomplete**

- A Deny on desktop is stored with duration 'session', so the person is asked again next session; only 'Never allow' (high-impact only) is persistent (apps/desktop/electron/runtime/permissionManager.ts:394, :405)
- Approvals are wider than one call: Allow this session, Always allow, Allow for this chat, Allow All (apps/desktop/electron/runtime/permissionManager.ts:371, apps/cli/src/tui/widgets/approval_overlay.rs:104)
- Desktop and web microphone: audio capture is decided by Chromium handlers, with no explanatory dialog found (apps/desktop/electron/runtime/permissionManager.ts:263, apps/desktop/electron/main.ts:844)
- Mobile pairing copy says 'accounts are not compared' while the claim route does bind the account (apps/mobile/src/features/companion/components/ConnectionStateViews.tsx:122, apps/web/app/api/pair/claim/route.ts:40)

**Present but disconnected or switched off**

- Mobile Remote Control and companion screens render 'FeatureUnavailable' because FEATURES.companion and FEATURES.dispatch are false (apps/mobile/lib/v1FeatureFlags.ts:12, :16, apps/mobile/app/(app)/settings/remote-control.tsx:131)

**Not available**

- Web microphone explanation: not found
- Chrome and CLI pairing: not found
- Computer-control permission on web, mobile, CLI, VS Code: not found

## 4. Required behaviour

**Established requirements**

- Permission asks once, records the answer, does not re-prompt after refusal; a repeat request joins the open question. (source: apps/desktop/electron/runtime/permissionManager.ts:326)
- Each tool approval covers one call. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.38)
- Pairing is bound to the signed-in account and fails clearly on a wrong or expired code. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.40)
- Browser control is granted per site origin and can be revoked. (source: apps/extension/src/features/computer-use/browserControlConsent.ts:159)
- Execution boundaries are explicit; nothing silently crosses Local, own key or Cloud. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. First computer-control request shows one dialog naming the action; a second request while it is open does not add a dialog
2. After Deny the same request in that session returns permission-denied without a new dialog
3. Removing a Chrome site's browser control stops runs on it
4. A folder not yet approved is not read by the assistant
5. Approve on one tool card runs that call only, if the policy is ask every time
6. A wrong or expired pairing code fails with a clear message
7. A phone on another account cannot claim a code
8. Mic refused on mobile shows how to turn it on

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Brief 'covers one call' conflicts with session and always scopes that the same dialogs offer [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show an explanation dialog before the first microphone request on web and desktop
- [proposed] Fix the stale mobile pairing copy
- [proposed] Offer a persistent Deny so a refusal sticks across sessions

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | permissionManager | `apps/desktop/electron/runtime/permissionManager.ts` | Ask-once permission store and dialog |
| service | dispatcher gates | `apps/desktop/electron/runtime/dispatcher.ts` | Maps commands to capabilities, session and folder gates |
| service | systemPermissions | `apps/desktop/electron/runtime/systemPermissions.ts` | Asks the operating system for microphone and screen access |
| config | session permission handlers | `apps/desktop/electron/main.ts` | Chromium permission request and check handlers |
| component | LocalFolderAttachDialog | `apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx` | Choose and approve a local folder |
| component | RemoteControlSection | `apps/web/features/desktop-host/components/RemoteControlSection.tsx` | Pairing code and QR on desktop |
| service | remote-pairing | `apps/web/features/desktop-host/lib/remote-pairing.ts` | Requests a pairing from the server |
| endpoint | POST /api/pair/initiate | `apps/web/app/api/pair/initiate/route.ts` | Creates the code |
| endpoint | POST /api/pair/claim | `apps/web/app/api/pair/claim/route.ts` | Phone claims the code, account checked |
| service | remote-control-gate | `apps/web/lib/feature-flags/remote-control-gate.ts` | Standing refusal check: workspace gate, paid plan, screen-share kill switch |
| service | mobile manualPairing | `apps/mobile/services/manualPairing.ts` | Posts claim from the phone |
| component | ConnectionStateViews | `apps/mobile/src/features/companion/components/ConnectionStateViews.tsx` | Pair with Desktop screens |
| service | VS Code remote control | `apps/extension-vscode/src/features/remote-control/index.ts` | Pairing panel and status bar |
| service | browserControlConsent | `apps/extension/src/features/computer-use/browserControlConsent.ts` | Per-origin consent, grant and revoke |
| service | side-panel voice | `apps/extension/src/features/side-panel/voice.ts` | Microphone notice and error text |
| service | voiceInput | `apps/mobile/src/features/voice/services/voiceInput.ts` | Microphone permission request |
| component | approval_overlay | `apps/cli/src/tui/widgets/approval_overlay.rs` | CLI approval choices |
| service | CLI workspace trust | `apps/cli/src/features/exec/tools/mod.rs` | Trust check and untrusted shell refusal |
| service | approvalScope | `apps/extension-vscode/src/features/permissions/approvalScope.ts` | What a session approval covers |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Shared approve and deny card |
| config | mobile feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | companion and dispatch off |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A command arrives at the desktop runtime and is mapped to a capability | device | apps/desktop/electron/runtime/dispatcher.ts:3418 |
| If the state is 'prompt', a native dialog asks; the answer is recorded; Deny records a session denial | device | apps/desktop/electron/runtime/permissionManager.ts:357, :405 |
| Granted: the command runs; single-use grants are consumed | device | apps/desktop/electron/runtime/dispatcher.ts:3446 |
| Pairing: desktop calls /api/pair/initiate; the server runs the standing check (workspace gate, paid plan, kill switch) and mints a code bound to the account | our servers | apps/web/features/desktop-host/lib/remote-pairing.ts:26, apps/web/app/api/pair/initiate/route.ts:93, apps/web/lib/feature-flags/remote-control-gate.ts:95-125 |
| Phone scans the code and calls /api/pair/claim; the same standing check runs; account mismatch returns 403 | our servers | apps/mobile/services/manualPairing.ts:165, apps/web/app/api/pair/claim/route.ts:146 |
| Desktop asks again to allow the phone itself before it connects | device | apps/desktop/electron/runtime/dispatcher.ts:1112 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Permission decisions (capability, scope, duration) | store:desktop permissions file in app data (apps/desktop/electron/runtime/permissionManager.ts:40, persisted map) | No | Session decisions are not restored; always-grants persist; revoke removes (permissionManager.ts:168) |
| Chrome browser-control consent origins | store:chrome.storage.local key agi_cu_browser_control_consent (apps/extension/src/features/computer-use/browserControlConsent.ts:6) | No | Removed on revoke |
| Chrome microphone notice acknowledgment | store:chrome.storage.local key agi.notice.microphone (apps/extension/src/features/side-panel/voice.ts:28) | No | Not removed by code found |
| Pairing code and tokens | Relay and server, bound to the account (apps/web/app/api/pair/claim/route.ts:36) | Server | Code expires in 300 seconds by default |

**Models and providers.** No model decides these permissions. The approvals gate what a model-driven agent may do on the device. Remote Control reads and steers coding sessions from the phone.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Pairing needs a signed-in account on both devices, and the account must be on a paid plan. Other permissions work without an account for device-local actions [inferred]. |
| Permissions | Per capability and scope on desktop (apps/desktop/electron/runtime/permissionManager.ts:334); per origin on Chrome; per workspace root for folders; per tool identity in VS Code (apps/extension-vscode/src/features/permissions/approvalScope.ts:60). |
| Subscription | Pairing needs a paid plan (every tier in PAID_TIERS), passing the workspace policy gate, and the screen-share switch being open. The same standing check (remoteControlStandingRefusal) runs on initiate and claim; Free is refused with 403 plan_upgrade_required, and a plan lookup failure returns 503 (apps/web/lib/feature-flags/remote-control-gate.ts:62-125, packages/contracts/types/src/billing-catalog.ts:352, apps/web/app/api/pair/initiate/route.ts:66). Mobile also reads a plan check for remote control (apps/mobile/app/(app)/companion/index.tsx:108). |
| Limits and metering | Pairing requests rate limited under 'device-link' (apps/web/app/api/pair/initiate/route.ts:63); code lifetime 30 to 900 seconds, default 300 (route.ts:20, :25). |
| Feature flags | Mobile FEATURES.companion and FEATURES.dispatch. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Desktop and CLI permissions are local and need no subscription. Pairing and Remote Control use the AGI relay, so they are cloud account features and need a paid plan. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Repeat request while asking | Joins the open question | apps/desktop/electron/runtime/permissionManager.ts:341 |
| Dialog closed without a button | Treated as denied for the session | apps/desktop/electron/runtime/permissionManager.ts:394 |
| Chrome microphone blocked | Error text with settings guidance | apps/extension/src/features/side-panel/voice.ts:35 |
| Mobile mic refused | Message to enable permission in Settings | apps/mobile/src/features/voice/services/voiceFailure.ts:16 |
| Pairing code wrong, expired or other account | Claim refused with error such as pairing_belongs_to_another_account | apps/web/app/api/pair/claim/route.ts:146 |
| Pairing on a Free plan | Refused with 403 plan_upgrade_required; desktop UI says 'Remote Control comes with paid plans.' | apps/web/lib/feature-flags/remote-control-gate.ts:62-125, apps/web/features/desktop-host/components/RemoteControlSection.tsx:48 |
| Phone disconnected | Reconnects on its own while Remote Control is on; new pairing needed for another phone | apps/web/features/desktop-host/components/RemoteControlSection.tsx:44 |
| Unattended Chrome run | Always-ask step is refused: 'This run has no way to ask.' | apps/extension/src/features/computer-use/approvalPolicy.ts:488 |
| Accessibility | QR has alt text and an enlarge control; code has an aria label | apps/web/features/desktop-host/components/RemoteControlSection.tsx:193, :231 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/permissionManager.test.ts`: Inferred from name: permission manager
- `apps/web/features/desktop-host/__tests__/LocalFolderAttachDialog.test.tsx`: Inferred from name: folder dialog
- `apps/web/features/desktop-host/__tests__/RemoteControlSection.test.tsx`: Inferred from name: remote control section
- `apps/web/app/api/pair/claim/__tests__/route.test.ts`: Inferred from name: claim route
- `apps/extension/__tests__/computer-use-browser-control-consent.test.ts`: Inferred from name: browser control consent
- `apps/extension-vscode/src/__tests__/approvalScope.test.ts`: Inferred from name: approval scope
- `apps/mobile/__tests__/CompanionPairingRequirements.test.tsx`: Inferred from name: pairing requirements
- `apps/mobile/__tests__/cloud-tool-approval-expired.test.ts`: Inferred from name: expired approvals

**Test scenarios**

- **Ask once**
  1. Run a computer-use command twice quickly on desktop
  - Expected: One dialog; second call waits on it
- **Deny sticks within a session**
  1. Deny the prompt
  2. Repeat the command
  - Expected: permission-denied, no new dialog
- **Revoke Chrome site**
  1. Grant browser control for a site
  2. Remove the site
  - Expected: Runs on that origin are refused
- **Wrong account pairing**
  1. Create a pairing on account A
  2. Claim on account B
  - Expected: 403 pairing_belongs_to_another_account
- **Free plan pairing**
  1. Sign in on a Free plan
  2. Request a pairing code on desktop
  - Expected: 403 plan_upgrade_required
- **Mic refused on mobile**
  1. Deny the mic prompt
  2. Start voice again
  - Expected: Message explains how to enable it

**Where to look when it fails**

- Dialog failure code 'permission-denied' with capability and scope
- Pairing errors in the claim route
- Desktop permissions review (permissionManager.ts:299)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- CLI: [70-qa/test-plans/cli/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/cli/010-modal-and-dialog-inventory.md)
- VS Code: [70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md)
- Chrome: [70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **Approvals offer scopes wider than one call; brief says one call** Affects: Web, desktop, CLI, VS Code. Evidence: apps/cli/src/tui/widgets/approval_overlay.rs:104; packages/contracts/types/src/tool-approval-policy.ts:21. Work needed: Decide the rule; align copy
- **Desktop Deny is session-only** Affects: Desktop. Evidence: apps/desktop/electron/runtime/permissionManager.ts:405. Work needed: Offer a persistent refusal for all capabilities
- **Mobile pairing disabled in v1 and its copy is stale** Affects: Mobile. Evidence: apps/mobile/lib/v1FeatureFlags.ts:16; ConnectionStateViews.tsx:122. Work needed: Fix copy before switching on
- **No microphone explanation on web or desktop** Affects: Web, Electron. Evidence: apps/desktop/electron/runtime/permissionManager.ts:263. Work needed: Add a short notice before the first request
- **Pairing absent on web, CLI and Chrome** Affects: Those apps. Evidence: none found. Work needed: Decide scope

**Depends on**

- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-voice-and-media
- SYS-sync-and-continuity
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:web
- api:POST /api/pair/initiate
- api:POST /api/pair/claim
- store:chrome.storage.local

## Unknown

- What confirmComputerRun asks
- Web voice button explanation: not read
- CLI folder-access dialog (apps/cli/src/tui/tui_app.rs:4865 in the brief) was not verified
- Whether Tauri desktop code ships

## Second reader's check

A second reader checked 11 statements of this page against the code: 9 correct, 2 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 7):** "Subscription: pairing is checked by a standing check on the server. Which plans: unknown." The code shows: The plans are known. remoteControlStandingRefusal runs three checks in order: the workspace feature gate, the plan (403 plan_upgrade_required unless canUseBillingPlanCapability(plan,'remote_control')), then the screen-share kill switch. The capability maps to PAID_TIERS, so Free is refused. The desktop UI says 'Remote Control comes with paid plans.' The same check runs on claim. A plan lookup failure returns 503. (apps/web/lib/feature-flags/remote-control-gate.ts:62-125; packages/contracts/types/src/billing-catalog.ts:352; apps/web/features/desktop-host/components/RemoteControlSection.tsx:48; apps/web/app/api/pair/initiate/route.ts:66). **Corrected:** Pairing needs a paid plan (every tier in PAID_TIERS), passing the workspace policy gate, and the screen-share switch being open. The same standing check runs on initiate and claim. Free is refused with 403 plan_upgrade_required.
- **Partly wrong (section 2):** "Desktop pairing needs the signed-in account and Remote Control switched on (initiate route :66)" The code shows: The route requires a signed-in user, a rate limit, and the standing refusal check (workspace policy, paid plan, kill switch). 'Switched on' is not a user toggle at that line. The page leaves out the paid-plan requirement here and in the Local mode row. (apps/web/app/api/pair/initiate/route.ts:55-67; remote-control-gate.ts:95-125). **Corrected:** Needs a signed-in account on a paid plan, workspace policy allowing it, and the server-side screen-share switch open.

**Facts the page missed**

- Remote Control pairing is gated by a paid plan, a workspace policy gate and a kill switch. Mobile also checks the plan client-side via canUseBillingPlanCapability(tier,'remote_control'). Free users get 403 plan_upgrade_required. The page says the plans are unknown. See apps/web/lib/feature-flags/remote-control-gate.ts:62-125 and packages/contracts/types/src/billing-catalog.ts:352.
- The page leaves out that computer.use, host.remote, shell.execute, application.control, browser.cdp and git.destructive are all high-risk (packages/contracts/local-runtime/src/capabilities.ts:67-74). So computer-control prompts never offer 'Always allow' and last only until the app quits. This resolves the page's own Unknown item about computer.use.
- The CLI refuses a shell tool in an untrusted workspace unless the user approves that one command, and no auto-approval mode waives it. Workspace-layer 'Allow' policies are downgraded to 'Ask' until the repo is trusted (apps/cli/src/features/exec/tools/mod.rs:1784-1815). The page only mentions 'untrusted shell refusal' in passing.
