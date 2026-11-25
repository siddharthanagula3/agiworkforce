---
id: "F068-07"
type: "feature"
title: "Continue local work from the phone and start a task in an allowed folder"
aliases: ["Continue local work from the phone", "Remote code session", "New session on this computer", "code.session.start", "Start session (phone)", "Companion code sessions", "Remote Control (code sessions)", "S68.14", "S68.24"]
area: "68 Session continuity and remote-session product"
available_on: ["desktop", "mobile", "cli", "vscode"]
implementation: {web: "missing", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S68.14", "S68.24"]
depends_on: ["surface:mobile", "surface:desktop", "surface:cli", "surface:vscode", "surface:web", "mode:cloud", "plan:basic", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:team_premium", "plan:enterprise", "F068-09", "F068-08", "SYS-sync-and-continuity", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "api:POST /api/pair/claim", "api:POST /api/pair/initiate", "file:apps/mobile/lib/v1FeatureFlags.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-07 Continue local work from the phone and start a task in an allowed folder

A paired AGI Mobile phone follows, steers, stops and answers approvals for coding sessions running on the person's own computer, and can ask that computer to start a new session in a folder the computer has approved. The computer decides every time. In the v1 phone build the whole phone side is switched off.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.14](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6814), [S68.24](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6824).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | built (this page lists unfinished parts) | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a phone talk through the relay to a computer that runs AGI Code sessions (the Desktop app, a terminal running the command line, or VS Code). The phone lists the computer's sessions, opens one, sends guidance, interrupts a turn, answers the agent's approval and question prompts, reads diffs, and starts a new session by sending a task text and a folder choice. The computer re-checks that the folder is allowed on every command. [inferred from apps/mobile/src/features/companion/remote-code/service.ts:15-117 and apps/desktop/electron/remote/remoteControlService.ts:219-280]

**Why it exists.** Work that must run on the person's own machine (their files, their tools) should still be reachable when they are away from the desk. The brief states: 'From the phone, the user continues a coding session that runs on their local machine' (S68.14) and 'starts a new session on a remote machine inside a folder that machine allows' (S68.24). (doc: knowledge-base/data/area-briefs/068-session-continuity-and-remote-session-product.md)

**Who uses it.** A person with a paid plan who has AGI Desktop (or the command line, or VS Code) signed in on a computer and AGI Mobile on a phone, on the same account. [inferred from apps/web/lib/feature-flags/remote-control-gate.ts:57-78 and apps/web/app/api/pair/claim/route.ts:55-67]

**Problems it solves**

- A long agent turn on the computer waits for an approval while the person is away; the phone can answer it.
- The person wants to start a task on the computer without walking back to it.
- A phone must never get more reach than the person allowed on the computer: folders and approvals are decided on the computer.

**Use cases**

- Follow a running refactor on the Desktop app from the phone and send one line of guidance.
- Allow or deny an agent's approval request from the phone; a risky one opens a native dialog on the computer first.
- Describe a task in the phone's 'New session on this computer' box, pick an approved folder and start it.
- Press stop on a runaway turn from the phone.

## 2. User experience

**Where to find it**

- Phone (AGI Mobile): 'Remote' screen (Companion), cards 'Your computers' and, once connected, a code sessions card with 'New session on this computer' [apps/mobile/app/(app)/companion/index.tsx:270; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:47]. Also the 'New session' sheet of the Cloud Code screen offers 'the paired computer' [apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx:346-352; doc: docs/decisions/2026-11-13-founder-decisions.md:143-150]. Both are switched off in v1: FEATURES.companion and FEATURES.dispatch are false [apps/mobile/lib/v1FeatureFlags.ts:12,16], the Remote screen then shows 'Remote isn't available in this build' [apps/mobile/app/(app)/companion/index.tsx:183; apps/mobile/src/shared/components/FeatureUnavailable.tsx], and the Cloud Code computer section returns nothing [apps/mobile/src/features/cloud-code/components/CodeDevicesSection.tsx:190].
- Computer: Desktop app Settings, Capabilities, 'Remote Control', button 'Pair a phone' [apps/web/features/desktop-host/components/RemoteControlSection.tsx:293; apps/mobile/src/features/companion/components/DesktopSetupChecklistView.tsx:52]. Command line: 'agi remote-control' or '/remote-control' in the full-screen interface [apps/cli/src/lib.rs:6659; apps/cli/src/claude_parity.rs:299,1844]. VS Code: command 'agi-workforce.remoteControl' [apps/extension-vscode/src/features/remote-control/index.ts:12-18].
- Web: no folder-start screen. The page /code/computer ('Your computer') sends a task to Desktop as a dispatch task, not a code session in a chosen folder [apps/web/app/code/computer/page.tsx; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:53].

**Before you start**

- Signed in to the same account on phone and computer, on a paid plan [apps/web/lib/feature-flags/remote-control-gate.ts:68; packages/contracts/types/src/billing-catalog.ts:332-352].
- Phone is paired and its status is 'connected' (feature F068-09). A request is not sent otherwise [apps/mobile/src/features/companion/remote-code/service.ts:20].
- The computer's app is open (not asleep, not quit) and Remote Control is on. [apps/mobile/app/(app)/companion/code/[threadId].tsx:19-20]
- Desktop: the folder is approved and the agent has the shell-execute grant for it [apps/desktop/electron/runtime/agentAccess.ts:15-26]. VS Code: the folder is an open workspace folder and the workspace is trusted [apps/extension-vscode/src/features/remote-control/remoteControlService.ts:99-105,229-231]. Command line: only the folder where 'agi remote-control' runs [apps/cli/src/remote_control/host.rs:782-786].
- The computer must advertise the capability 'code-session-start' or the phone offers no start box [apps/mobile/src/features/companion/components/DesktopInfoCard.tsx:80; apps/mobile/src/features/companion/components/AccountComputersCard.tsx:106-107].

**Screens and controls**

- Radio list of approved folders with branch name; text box 'Describe a task for AGI Code' (labelled 'Task for a new AGI Code session'); button 'Start session' (shows 'Starting…') [apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:47-117].
- Text 'No approved folder can run a session right now.' when no folder is available [CodeSessionsCard.tsx:50].
- Session view with steer, stop and approval controls [apps/mobile/src/features/companion/components/CodeSessionView.tsx; remote-code/service.ts:42-60,91-117].
- Computer: native dialog 'Allow this phone?' with buttons 'Cancel' and 'Allow this phone' at pairing [apps/desktop/electron/remote/remoteControlService.ts:196-203]; a second native sheet when a phone approval needs the computer's own confirmation [remoteControlService.ts:85,116-190].

**Journey**

1. 1. Pair the phone with the computer (F068-09).
2. 2. Open the Remote screen; the phone asks the computer for its sessions and folders ('code.sessions.list') [apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:171-173].
3. 3. Pick an approved folder, type a task, press 'Start session'. The phone refuses an empty task or one over 8000 characters [apps/mobile/src/features/companion/remote-code/service.ts:62-65; packages/contracts/types/src/remote-code.ts:46].
4. 4. The request travels through the relay to the computer, which checks the folder is still approved, starts a session and a first turn, and answers with the new thread id [packages/platform/utils/src/remoteControl/codeRemoteController.ts:651-696; apps/desktop/electron/remote/remoteControlService.ts:257-262].
5. 5. The phone opens the new session screen. It can steer, interrupt, answer approvals and read diffs [useCodeSessionStart.ts:22-30; CodeSessionsCard.tsx:41-44].
6. 6. An approval that the computer reserves for itself opens a native dialog on the computer and waits two minutes; the phone is told it is waiting [remoteControlService.ts:85,116-190].

**What the person sees and gets**

- Start failure on the phone: 'The session was not started. Check the Desktop connection and try again.' [apps/mobile/src/features/companion/remote-code/useCodeSessionStart.ts:5-6].
- Computer refusals shown on the phone: 'That folder is not approved for AGI Code on this computer.', 'AGI Code could not open this folder on the computer. Check it there.', 'The session could not be started on this computer. Try again, or start it there.', 'Too many sessions were started from the phone just now. Wait a few minutes.' [packages/platform/utils/src/remoteControl/codeRemoteController.ts:48-53].
- Approval held on the computer: 'This needs to be allowed at your computer. A dialog is open there now.' and, if the screen is locked, 'This has to be allowed at your computer, and its screen is locked. Unlock it and answer again.' [remoteControlService.ts:90-103,132-136].
- Offline: '<name> is offline' with 'Remote access stops while the computer is asleep, offline, or has AGI Desktop closed...' and a 'Reconnect' button [apps/mobile/app/(app)/companion/code/[threadId].tsx:19-22,48-57].

**Settings**

- Computer side: the folder grant (shell-execute) per approved folder [agentAccess.ts:15-26]; Remote Control on/off in Capabilities [RemoteControlSection.tsx].
- Phone side: no per-feature setting found for starting sessions. Notifications are a separate feature (F068-10).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop host accepts 'code.session.start' for an approved folder, checks it again on each command, refuses unapproved folders, rate-limits starts to 10 per 10 minutes and 8 running at once [apps/desktop/electron/remote/remoteControlService.ts:73-83,229-263; packages/platform/utils/src/remoteControl/codeRemoteController.ts:44-46,651-696,746-756].
- Desktop advertises 'code-sessions' and 'code-session-start' to the phone at pairing [packages/platform/utils/src/remoteControl/remoteControlHost.ts:681].
- Phone code sends list, attach, detach, steer, interrupt, start, history, approval and question requests with a protocol version and request id; refuses an over-long task or guidance (2000) before sending [apps/mobile/src/features/companion/remote-code/service.ts:15-117; packages/contracts/types/src/remote-code.ts:27-46].
- Phone start UI exists (folder radios, task box, Start button) and is reused in the 'Your computers' sheet and the Cloud Code new-session sheet [CodeSessionsCard.tsx:19-130; AccountComputersCard.tsx:61-88,282-284; NewCloudCodeSessionSheet.tsx:346-352].
- Approval hold dialog on the computer: two-minute limit, refused when the screen is locked or no window can open [remoteControlService.ts:85,116-190].
- Command line (apps/cli) and VS Code also host start requests: command line only for its own folder and only Managed sessions, VS Code for open workspace folders [apps/cli/src/remote_control/host.rs:47,760-815; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:269-273,459-470].

**Incomplete**

- The phone-side start screen has not been verified against a real computer; the brief marks S68.24 'desktop partial' and says Remote Control is hidden in the first mobile release (doc: area brief S68.24 'Unfinished').
- Web has no start-in-folder screen; /code/computer sends dispatch tasks instead [RemoteComputerPage.tsx:53,247-265].
- Cloud-code new-session sheet shows computer folders only when companion is on [useComputerCodeSessions.ts:32,53-54].

**Present but disconnected or switched off**

- The whole phone side: FEATURES.dispatch=false and FEATURES.companion=false [apps/mobile/lib/v1FeatureFlags.ts:12,16]; the connection store refuses to send control messages when either is off [apps/mobile/stores/connectionStore.ts:266-268,1371-1373]; Remote screen, code session screen and computer sessions list are replaced by 'not available' [apps/mobile/app/(app)/companion/index.tsx:183; apps/mobile/app/(app)/companion/code/[threadId].tsx:81].

**Not available**

- Web: no folder-start client (missing).
- Command line and VS Code as senders: no screen that starts a session on another machine (brief: missing). They are hosts only.
- Chrome extension: not applicable.
- Photos or files cannot be added to a computer session from the phone because one relay message is too small (doc: docs/decisions/2026-11-13-founder-decisions.md:186-188).

## 4. Required behaviour

**Established requirements**

- The user can continue, from the phone, a coding session that runs on their local machine. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S68.14)
- From another client the user starts a new session on a remote machine inside a folder that machine allows. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S68.24)
- A phone reaches a folder only while the person at the computer has allowed the agent to run there; nothing a phone sends raises a prompt that grants access. (source: apps/desktop/electron/remote/remoteControlService.ts:64-83)
- A phone's approval that the computer reserves must be confirmed in a native dialog on the computer; with the screen locked or no answer within two minutes it is dropped and the agent keeps waiting. (source: apps/desktop/electron/remote/remoteControlService.ts:85,107-190)
- Remote Control comes with paid plans only. (source: doc: docs/product/definition.md:303; packages/contracts/types/src/billing-catalog.ts:352)
- In Local mode the phone shows only what works with no account; Remote is Cloud only because pairing needs a signed-in account and the relay. (source: doc: docs/decisions/2026-11-13-founder-decisions.md:96-99)
- A session on the computer opens on the phone as a conversation; New session offers the cloud or the paired computer. (source: doc: docs/decisions/2026-11-13-founder-decisions.md:143-150)

**Acceptance criteria**

1. With a paired phone and an approved folder, a 'code.session.start' request creates a session in that folder and the phone receives its thread id.
2. A start request for a folder the computer no longer approves is refused with 'That folder is not approved for AGI Code on this computer.' and no session or turn is created.
3. A task over 8000 characters or empty is refused on the phone and sends nothing.
4. The eleventh start within ten minutes is refused with the 'Too many sessions' text.
5. A phone allow that needs the computer's confirmation opens a native dialog; with the screen locked the phone gets the 'unlock it and answer again' text; unanswered for two minutes the dialog closes and the agent keeps waiting.
6. Withdrawing the folder grant on the computer makes the next phone command for it fail at once.
7. With FEATURES.companion off, the phone never sends a control message and shows the 'not available' screen.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A phone with a plan that lacks Remote Control cannot start sessions because pairing is refused (403 plan_upgrade_required) [apps/web/lib/feature-flags/remote-control-gate.ts:57-78].
- Which model and provider run the started turn is chosen on the computer, not by the phone; the request carries only rootId, text and title [apps/mobile/src/features/companion/remote-code/service.ts:62-72; codeRemoteController.ts:679-688]. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a web client for 'code.session.start' with a folder picker, so web reaches parity with the phone.
- [proposed] Show on the phone which model and provider the started session will use before 'Start session'.
- [proposed] Turn on the phone flags behind a live check once the relay is verified in production.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | remoteControlService (Desktop) | `apps/desktop/electron/remote/remoteControlService.ts` | Builds the host: per-command folder check, session start, approval dialog with two-minute limit, phone confirmation dialog. |
| service | agentAccess | `apps/desktop/electron/runtime/agentAccess.ts` | Maps a folder to the shell-execute grant that lets the agent run there (agentScope, agentAllowedIn). |
| service | remoteControlHost | `packages/platform/utils/src/remoteControl/remoteControlHost.ts` | Shared host state machine: pairing, advertises capabilities 'code-sessions' and 'code-session-start' (line 681), routes phone messages. |
| service | codeRemoteController | `packages/platform/utils/src/remoteControl/codeRemoteController.ts` | Handles code.session.start (651-696), start limits (44-46, 746-756), steer, interrupt, approvals. |
| schema | REMOTE_CODE_LIMITS and request parsers | `packages/contracts/types/src/remote-code.ts` | Wire contract: task length 8000, guidance 2000, request parsing for code.session.start (line 384). |
| service | remote-code service (phone) | `apps/mobile/src/features/companion/remote-code/service.ts` | Builds and sends each request; startCodeSession refuses empty or over-long task. |
| hook | useCodeSessionStart | `apps/mobile/src/features/companion/remote-code/useCodeSessionStart.ts` | Waits for the computer's reply, opens the new session or shows the failure text. |
| store | remote-code store | `apps/mobile/src/features/companion/remote-code/store.ts` | Holds roots, sessions, pending starts and guidance drafts on the phone. |
| component | NewCodeSession / CodeSessionsCard | `apps/mobile/src/features/companion/components/CodeSessionsCard.tsx` | Folder radios, task box and 'Start session' button. |
| component | AccountComputersCard | `apps/mobile/src/features/companion/components/AccountComputersCard.tsx` | Opens the start sheet for the connected computer when it advertises code-session-start. |
| component | NewCloudCodeSessionSheet | `apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx` | Cloud Code new-session sheet with a 'computer' location that reuses useCodeSessionStart. |
| hook | useComputerCodeSessions | `apps/mobile/src/features/cloud-code/components/useComputerCodeSessions.ts` | Lists computer sessions and folders for Cloud Code, only when companion is on. |
| screen | Code session screen | `apps/mobile/app/(app)/companion/code/[threadId].tsx` | Opens a computer session; offline and unpaired explanation with Reconnect or Pair buttons. |
| config | v1 feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | dispatch and companion are false in v1, which hides this feature on the phone. |
| store | connection store | `apps/mobile/stores/connectionStore.ts` | Pairing connection and sendControl, which returns false when flags are off (266-268, 1371). |
| service | CLI remote host | `apps/cli/src/remote_control/host.rs` | Command line host: start_session for its own folder only, Managed sessions only (760-815). |
| service | VS Code remote service | `apps/extension-vscode/src/features/remote-control/remoteControlService.ts` | VS Code host: startSession on open workspace folders (459-470). |
| screen | RemoteComputerPage (web) | `apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx` | Web sends a dispatch task to Desktop; not a folder session. |
| test | remoteControlService tests | `apps/desktop/electron/__tests__/remoteControlService.test.ts` | Folder gating and approval dialog behaviour. |
| test | codeRemoteController tests | `apps/desktop/electron/__tests__/codeRemoteController.test.ts` | Controller behaviour including a start dropped when the phone is forgotten mid-start (1270-1286). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types a task and chooses a folder on the phone; the phone checks length and builds a request with version, request id and time. | device | apps/mobile/src/features/companion/remote-code/service.ts:15-27,62-72 |
| The connection store signs the control message and sends it over the paired relay socket; it refuses when the pair flags are off or the status is not connected. | device | apps/mobile/stores/connectionStore.ts:266-268,1371-1373 |
| The relay forwards the message between the two paired devices and rechecks account, plan and switch while the pairing lives. | our servers | services/signaling-server/src/index.ts:2222-2360; apps/web/lib/feature-flags/remote-control-gate.ts:97-123 |
| The computer's host parses the request, checks rate limits, lists its sessions, and finds the folder; a missing or unavailable folder returns an error to the phone. | device | packages/platform/utils/src/remoteControl/codeRemoteController.ts:651-677,746-756 |
| The Desktop wrapper checks the folder is approved and the shell-execute grant is held, then starts a developer session and a first turn with the task text. | device | apps/desktop/electron/remote/remoteControlService.ts:73-83,257-262; codeRemoteController.ts:679-690 |
| The new session's agent turn runs on the computer; the model call goes to whatever route that session uses. Which route is not decided by the phone. | device and our servers | codeRemoteController.ts:684-688 [inferred]; route unknown |
| The computer replies 'code.session.started' with the thread id; the phone opens the session view. | device | codeRemoteController.ts:654-663,696; apps/mobile/src/features/companion/remote-code/useCodeSessionStart.ts:22-30 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Task text, folder id, thread id, session events and diffs | Session data lives on the computer's session store; the phone keeps a view in its remote-code store. Relay carries messages in transit. Phone store persistence details: unknown. | Streamed over the relay while paired; not a cloud copy found in this code path. | Computer session stays until the person removes it; phone view cleared on disconnect (connectionStore.ts:1339-1368 resets agents and dispatch tasks). Relay retention of message content: not found. |
| Pairing credentials and the persisted computer name | store:connection-store (only desktopName is persisted) [apps/mobile/stores/connectionStore.ts:1450-1458] | No | Cleared on disconnect. |

**Models and providers.** The phone and relay do not call a model. The started turn runs in the computer's own agent session; the model and provider are chosen there. The command line host shares only Managed-mode sessions and refuses Local or own-key folders with a message [apps/cli/src/remote_control/host.rs:47,812].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required. The phone claims a pairing through an account-authenticated web route; the relay itself cannot tell accounts apart [apps/web/app/api/pair/claim/route.ts:37-46,55-61]. |
| Permissions | Per command the Desktop checks the folder is approved and the shell-execute capability is granted for it; a worktree is covered by its source folder [apps/desktop/electron/runtime/agentAccess.ts:15-26; remoteControlService.ts:73-83]. Phone must be confirmed by the person at the computer ('Allow this phone?') [remoteControlService.ts:196-210]. |
| Subscription | Remote Control needs a paid plan: basic, pro, max, max_15x, team, team_premium, enterprise [packages/contracts/types/src/billing-catalog.ts:332-352]. Checked when pairing is created, claimed and again by the relay while the pairing lives [apps/web/lib/feature-flags/remote-control-gate.ts:97-123]. The feature registry also names entitlement 'developer_surfaces' and policy 'remote_control' for this feature [packages/contracts/types/src/feature-registry.json:193-199]; how the two relate: unknown. |
| Limits and metering | 10 phone starts per 10 minutes and 8 phone sessions running at once [codeRemoteController.ts:44-46]. Task up to 8000 characters, guidance 2000 [remote-code.ts:29,46]. Approval hold 120000 ms [remoteControlService.ts:85]. Pairing routes use the 'device-link' rate limit [apps/web/app/api/pair/claim/route.ts:63]. No usage metering of the start found. |
| Feature flags | Phone: FEATURES.companion and FEATURES.dispatch (both false) [apps/mobile/lib/v1FeatureFlags.ts:12,16]. Server: the 'screen_share' kill switch governs Remote Control [apps/web/lib/feature-flags/remote-control-gate.ts:29-52; feature-registry.json:187]; workspace policy 'remote_control'. |
| Model compatibility | Not applicable to the relay. The started session's model is the computer's choice; no model rule found in these files. |
| Provider restrictions | Command line host: only Managed sessions are shared [apps/cli/src/remote_control/host.rs:47]. Others: none found in the code. |
| Local mode | Remote is Cloud only on the phone (doc: docs/decisions/2026-11-13-founder-decisions.md:96-99). The command line refuses to start Remote Control unless its privacy mode is Managed [apps/cli/src/cloud/client.rs:368-372; apps/cli/src/remote_control/mod.rs:1337]. Local inference on the computer is untouched by this feature; a session in Local or own-key mode on the command line cannot be shared. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Phone not connected | Request is not sent; start shows the failure text; session screen shows 'Reconnecting to <name>…' or '<name> is offline' / 'Not paired with a computer'. | apps/mobile/src/features/companion/remote-code/service.ts:20; apps/mobile/app/(app)/companion/code/[threadId].tsx:30-58 |
| No approved folder | Phone says 'No approved folder can run a session right now.'; computer refuses an unapproved folder. | CodeSessionsCard.tsx:50; codeRemoteController.ts:49,673-676 |
| Folder grant withdrawn | Next command throws 'That folder is no longer approved on this computer.' | remoteControlService.ts:73-83 |
| Too many starts or running sessions | Refused with wait or stop text. | codeRemoteController.ts:51-53,746-756 |
| Phone forgotten while a start is in flight | No session or turn is started. | apps/desktop/electron/__tests__/codeRemoteController.test.ts:1270-1286; codeRemoteController.ts:671,683 |
| Approval needs the computer, screen locked | Refused with 'unlock it and answer again'; no dialog left open. | remoteControlService.ts:132-136 |
| Approval dialog unanswered | Closes after 120 s; agent keeps waiting; phone told 'Nobody answered at your computer within two minutes.' | remoteControlService.ts:85,93-94,154-186 |
| Computer asleep or app closed | Offline explanation and Reconnect button on the phone. | apps/mobile/app/(app)/companion/code/[threadId].tsx:19-20,48-57 |
| Plan lacks Remote Control | Phone shows 'not on your plan' screen; server answers 403 plan_upgrade_required. | apps/mobile/app/(app)/companion/index.tsx:99-105,185; remote-control-gate.ts:68-77 |
| Accessibility | Folder rows are radios with labels; task box and button have accessibility labels; error text has role alert; touch targets 44 px. | CodeSessionsCard.tsx:56-125 |
| Retry after a failed start | Not handled in the code as automatic retry; the person presses Start again. Task text kept (field cleared only on success). | useCodeSessionStart.ts:35-40; CodeSessionsCard.tsx:21-24 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/remoteControlService.test.ts`: Lists sessions only for approved folders; reads, steers, interrupts, approves and diffs only in an allowed folder; folder lost the moment the grant is withdrawn; no credential-file diff; approval dialog applied/cancelled/expired after two minutes/refused when locked or no window (it() titles).
- `apps/desktop/electron/__tests__/codeRemoteController.test.ts`: Controller behaviour; one case shows a start dropped when the phone is forgotten during listing (lines 1270-1286). Other cases: not read in full.
- `apps/mobile/src/features/companion/remote-code/__tests__/service.test.ts`: Attach request carries id and version; approval answer for the exact approval; empty guidance refused and nothing sent while disconnected.
- `apps/mobile/__tests__/AccountComputersCard.test.tsx`: Starts a session on the connected computer when it can; no start option without support; two rows with one name not marked connected.
- `packages/contracts/types/src/__tests__/remote-code-boundaries.test.ts`: Request boundaries including a code.session.start with a task over the limit (line 100).
- `apps/cli/src/remote_control/host.rs`: Inline Rust tests include 'a_new_session_that_would_not_be_managed_is_refused_before_any_turn' and managed-only listing.
- `apps/mobile/src/features/companion/remote-code/__tests__/store.test.ts`: Phone store; contents not read.

**Test scenarios**

- **Start in an approved folder**
  1. Pair a phone with Desktop (flags on in a test build).
  2. Approve a folder and grant the agent there.
  3. On the phone choose the folder, type a task, press Start session.
  - Expected: A new session appears on the computer, the phone opens it and shows the first turn.
- **Folder withdrawn**
  1. Pair and list sessions.
  2. On the computer withdraw the folder grant.
  3. Press Start session for that folder.
  - Expected: Refusal text; no session created on the computer.
- **Task length**
  1. Paste 8001 characters in the task box.
  - Expected: Box stops at 8000 or Start stays disabled; nothing is sent.
- **Start limit**
  1. Start 10 sessions in under 10 minutes.
  2. Start an 11th.
  - Expected: 'Too many sessions were started from the phone just now. Wait a few minutes.'
- **Locked screen approval**
  1. Run a turn that needs a reserved approval.
  2. Lock the computer screen.
  3. Allow from the phone.
  - Expected: Phone shows the unlock-and-answer-again text; no dialog stays open.
- **v1 build**
  1. Open the v1 phone build and look for the Remote screen.
  - Expected: 'Remote isn't available in this build'; no relay traffic.

**Where to look when it fails**

- Computer console: '[remote-control] session start failed', '[remote-control] folder unavailable' (codeRemoteController.ts:675,692).
- Desktop warning '[remote-control] an approval allowed at the computer was not sent' (remoteControlService.ts, approximate line 178).
- Relay log 'Pairing standing check failed' and metrics pairing_standing_* (services/signaling-server/src/index.ts:2285-2300).
- Phone error strings from friendlyErrorMessage (connectionStore.ts:1465-1490).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md)
- Mobile: [70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md)
- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)
- VS Code: [70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **Phone side is switched off in v1, so no user can continue or start computer sessions from the phone.** Affects: Mobile users. Evidence: apps/mobile/lib/v1FeatureFlags.ts:12,16; apps/mobile/app/(app)/companion/index.tsx:183. Work needed: Verify live against production relay and Desktop, then turn the flags on (owner decision; brief S68.24 note).
- **Brief says the phone start screen is 'missing' but code has one; its behaviour is unverified.** Affects: Testers, planners. Evidence: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:19-130. Work needed: Correct the brief row; run the start scenario on a device.
- **No web client starts a session in a folder; web sends dispatch tasks only.** Affects: Web users. Evidence: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:53,247. Work needed: Add a folder-start client using code.session.start.
- **No way to see which model or provider a phone-started session will use.** Affects: Mobile users; cost control. Evidence: service.ts:62-72 sends only rootId and text. Work needed: Show the computer's current route before start.
- **Command line host serves only its launch folder and only Managed sessions; others are refused.** Affects: Command line users on Local or own-key. Evidence: apps/cli/src/remote_control/host.rs:47,782-786. Work needed: Decide whether Local and own-key sessions may ever be shared; today consent rules forbid silent routing (AGENTS.md section 6).
- Not built on: Web (from the capability ledger).

**Depends on**

- surface:mobile
- surface:desktop
- surface:cli
- surface:vscode
- surface:web
- mode:cloud
- plan:basic
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- plan:team_premium
- plan:enterprise
- F068-09
- F068-08
- SYS-sync-and-continuity
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- api:POST /api/pair/claim
- api:POST /api/pair/initiate
- file:apps/mobile/lib/v1FeatureFlags.ts

## Unknown

- Whether the phone start screen works end to end against a real computer (no recorded run found).
- How the started session's model and provider are chosen on the computer.
- Whether the phone remote-code store persists to disk (store.ts imports persist; storage key not read).
- How the 'developer_surfaces' entitlement in the feature registry relates to the billing capability 'remote_control'.
- Whether the relay keeps any message content (not found in files read).
- Exact line of the 'approval not sent' warning in remoteControlService.ts (approximate).
