---
id: "F059-09"
type: "feature"
title: "Approve from another device or from a notification"
aliases: ["Approval from another device (S59.26)", "Approval via notification (S59.27)", "Needs you filter", "Allow once notification", "Review notification", "Waiting for your approval"]
area: "59 Approvals and human-in-the-loop UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S59.26", "S59.27"]
depends_on: ["F059-08", "F059-07", "SYS-sync-and-continuity", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "table:cloud_agent_approval_checkpoints", "api:GET /api/mobile/agent-status", "store:cloud task store"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F059-09 Approve from another device or from a notification

An approval raised on one signed-in device can be answered on another through the Tasks page, a chat, Mobile Tasks, or VS Code cloud tasks, and the first device follows the result. VS Code offers Allow once, Deny and Open chat from a notification. Desktop banners and a Mobile notification also exist.

Area: [59. Approvals and human-in-the-loop UI](README.md). Requirement items: [S59.26](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5926), [S59.27](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5927).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows pending Cloud approvals on any signed-in device, accepts the first answer, refuses later ones, and lets the first device pick up the result. Raises notifications so a person can answer without opening the app.

**Why it exists.** Agents often pause while the person is away from the device that started the run. Answering from a phone or an editor notification keeps work moving.

**Who uses it.** People who start Cloud runs or local coding sessions and then move between devices.

**Problems it solves**

- Run waits because the person is away from the original device.
- Two devices answering one approval.
- Missing a pause because no alert was shown.

**Use cases**

- Start a Cloud task on Web, answer its approval on Mobile Tasks.
- VS Code window is in the background; press Allow once on the notification.
- Open Tasks, filter 'Needs you', approve all pending calls of one run.
- Desktop banner offers Approve for a low-risk reversible command.

## 2. User experience

**Where to find it**

- Web: Tasks page (page title 'Work history', /tasks), filter 'Needs you', card 'Waiting for your approval' with Approve and Deny, 'Open chat' button (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:72,891; apps/web/app/tasks/page.tsx:16).
- Desktop: the same Tasks page in the hosted app (apps/desktop/src/features/tasks/DesktopTasks.tsx:13) plus tray list 'Waiting for Approval' and a dock badge (apps/desktop/electron/tray.ts:144; main.ts:1744).
- Mobile: Tasks screen run detail 'Waiting for your approval' with Approve and Deny (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:417-440); notification 'N agent action(s) waiting on you' with a Review button (apps/mobile/services/backgroundFetch.ts:100-110; apps/mobile/services/notificationCategories.ts:12).
- CLI: 'agi code approvals', 'agi code approve <handle>', 'agi code reject <handle>' for cloud Code sessions (apps/cli/src/lib.rs:3119); the TUI closes its own prompt when the phone answered (tui_app.rs:8368).
- VS Code: notification buttons 'Allow once', 'Deny', 'Open chat' (apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:23,31); Cloud Tasks commands 'Code: Approve Cloud Task' and 'Code: Reject Cloud Task' (apps/extension-vscode/package.json:552).
- Chrome: no other-device approval surface found.

**Before you start**

- Same account signed in on both devices.
- Run must still be pending (inside its window, F059-08).
- Notifications allowed on the device. VS Code banner shows only when the editor window is not focused (sessionActivityAlert.ts:31).

**Screens and controls**

- Tasks filter chips (active, 'Needs you', all, archived) (TasksPage.tsx:42,72).
- Approve and Deny apply one decision to every pending call of the run because the server rejects a partial answer (TasksPage.tsx:470-480; route test TasksPage.approvals.test.tsx:65).
- VS Code modal 'Approve and continue' and an input box for a rejection reason (cloudRunApproval.ts:41,94).
- Desktop banner Approve and Deny only for low or medium risk, reversible, fully shown requests (apps/desktop/electron/agentNotifications.ts:179-197,356).

**Journey**

1. 1. Device A raises an approval.
2. 2. Device B (or a notification) shows it.
3. 3. The person presses Approve or Deny (VS Code: Allow once or Deny).
4. 4. The server claims the checkpoint for the first answer.
5. 5. Device A notices (Web chat polls every 5 seconds) and shows the run continuing.
6. 6. A second answer on any device is refused with 'Another device already answered this approval.'

**What the person sees and gets**

- VS Code toast 'approved, the task continues.' or 'rejected, the task will not run it.' (cloudRunApproval.ts:155-160).
- Error toast 'your decision could not be sent, another device already answered this one' (cloudRunApproval.ts:30-33).
- Mobile message 'Another device already answered this one' (apps/mobile/src/features/tasks/service.ts:23).

**Settings**

- Mobile: notification settings route; the Tasks screen shows 'Approval alerts are off. Paused tasks wait silently while the app is closed.' when off (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:73).
- Desktop notification preferences by kind and per-kind mute (apps/desktop/electron/agentNotifications.ts:29-40).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server allows one active checkpoint per run (apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:41-43) and answers a second claim with 409 (cloud-agent-run-service.ts:1957).
- Web chat follows a waiting run: polls the run every 5 seconds with back-off to 60 seconds and, when another device answered, folds the result into the same message (apps/web/lib/hooks/useChatStream.ts:1437,1456,1538).
- Tasks page on Web and Desktop lists pending approvals and sends one decision per call (TasksPage.tsx:470).
- Mobile Tasks sends approve or reject for the run (apps/mobile/src/features/tasks/store.ts:311; service.ts:64) and re-reads the list on an approval notification (apps/mobile/src/features/tasks/useApprovalSignal.ts:14).
- Mobile background fetch calls /api/mobile/agent-status and raises a local notification with a Review button that opens the app (apps/web/app/api/mobile/agent-status/route.ts:15-66; backgroundFetch.ts:95-110).
- VS Code cloud tasks approve and reject (cloudRunApproval.ts:14-35,106).
- VS Code notification Allow once or Deny sends respondToApproval; a question shows Open chat only (sessionActivityAlert.ts:31-50; sidebarProvider.ts:172-178; chatEditorPanel.ts:202).
- Desktop (Electron) banner with Approve and Deny for local developer sessions; tray and badge show pending count (agentNotifications.ts:179-198,351-370; tray.ts:144; main.ts:1744).
- CLI cloud Code sessions: list, approve, reject (apps/cli/src/cloud/code_sessions.rs:118-150; lib.rs:3119); route lists and decides (apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:57-120).

**Incomplete**

- Chrome: no tasks approval and no remote-answer follow found; the brief marks it unverified (apps/extension/src/features/side-panel/tasksSheet.ts has no approval code).
- Mobile chat follows a remote answer: not established.
- Mobile notification only opens the app (Review); it cannot answer (notificationCategories.ts:12).
- Web follow is polling, not push; only for the active conversation (useChatStream.ts:1556-1560).
- Mobile Tasks sheet has no guidance field (F059-07).

**Present but disconnected or switched off**

- CLI Remote Control phone answers exist (tui_app.rs:8368; apps/mobile/src/features/companion/remote-code/service.ts:83) but whether Remote Control is visible to users in the current release: unknown.

**Not available**

- Notification actions on Web, Chrome and CLI (none found).
- Brief says notification is VS Code only: Desktop Electron also offers Approve and Deny, so the brief understates Desktop (agentNotifications.ts:356).
- Cloud Code approvals in the CLI take no note and expire as 409, not 410.

## 4. Required behaviour

**Established requirements**

- An approval raised on one device can be answered from another signed-in device, and the first device sees the result. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S59.26)
- When an approval is needed the user is notified and can approve or deny from the notification. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S59.27)
- Remote projection of approvals is projection only; the host remains authority. (source: doc: docs/product/experience-contract.md (Remote Projection row))
- Start a task, close its tab and observe the same durable task from a fresh browser; approval is bound to the exact pending action. (source: doc: docs/product/experience-contract.md workflow W16)

**Acceptance criteria**

1. Raise an approval on Web, approve it on Mobile Tasks; the Web chat shows the run continuing within about 10 seconds.
2. A second approve on a different device shows the already-answered message and does not run twice.
3. VS Code unfocused: banner offers Allow once, Deny, Open chat; a question offers Open chat only.
4. Press Allow once on the banner: the local tool runs and the card shows Allowed.
5. Desktop banner offers no Approve for a high-risk or irreversible request.
6. Mobile notification Review opens the app at the run.
7. Chrome behaviour is recorded as unverified until tested.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Every app that can show a pending approval should also follow a remote answer.
- [inferred] Notification actions should never allow a high-risk call, as the Desktop rule does.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add push to the Web follower instead of polling.
- [proposed] Offer Approve and Deny actions in the Mobile notification for low-risk reversible calls, using the Desktop rule.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | TasksPage | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Shared Tasks UI for Web and Desktop with filters and approval card |
| screen | web tasks route | `apps/web/app/tasks/page.tsx` | Web mount of the Tasks page |
| screen | DesktopTasks | `apps/desktop/src/features/tasks/DesktopTasks.tsx` | Tauri mount of the Tasks page (internal build) |
| service | managed cloud agent runs client | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | resumeRun, maps 409 and 410 to typed errors |
| hook | remote approval follower | `apps/web/lib/hooks/useChatStream.ts` | Polls waiting runs and folds in an answer given elsewhere |
| service | pending approval projection | `apps/web/lib/services/cloud-agent-run-service.ts` | Lists pending approvals inside the 24 hour window; one-answer claim |
| table | cloud_agent_approval_checkpoints | `apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql` | One active checkpoint per run |
| endpoint | GET /api/mobile/agent-status | `apps/web/app/api/mobile/agent-status/route.ts` | Pending approvals and running count for the phone |
| screen | CloudTasksScreen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | Mobile Tasks list and approval alert banner |
| store | cloud task store | `apps/mobile/src/features/tasks/store.ts` | resolveApproval |
| component | CloudRunDetailSheet | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Approve and Deny buttons on the phone |
| job | mobile background fetch | `apps/mobile/services/backgroundFetch.ts` | Polls agent-status and raises the approval notification |
| config | notification category | `apps/mobile/services/notificationCategories.ts` | Defines the Review button |
| hook | useCloudRunApprovalSignal | `apps/mobile/src/features/tasks/useApprovalSignal.ts` | Reloads Tasks on approval notifications |
| service | cloudRunApproval | `apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts` | VS Code approve and reject for Cloud runs |
| service | sessionActivityAlert | `apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts` | VS Code notification with Allow once, Deny, Open chat |
| service | sidebarProvider | `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts` | Wires notification respond to the state manager |
| service | agentNotifications | `apps/desktop/electron/agentNotifications.ts` | Desktop banners with Approve and Deny, withdrawn when answered elsewhere |
| component | tray approvals | `apps/desktop/electron/tray.ts` | 'Waiting for Approval' list |
| command | agi code approvals/approve/reject | `apps/cli/src/lib.rs` | CLI answers cloud Code approvals |
| service | cloud code sessions client | `apps/cli/src/cloud/code_sessions.rs` | HTTP calls for list and decide |
| endpoint | /api/code/sessions/{sessionId}/agent/approvals | `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts` | GET list and POST decide for cloud Code approvals |
| service | CLI remote host | `apps/cli/src/tui/remote_host.rs` | Sends approval requests to a paired phone and reports answers |
| service | companion remote code | `apps/mobile/src/features/companion/remote-code/service.ts` | Phone answers a CLI session approval |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Device A pauses on an approval; the server stores the checkpoint and marks the run awaiting_input. | our servers | cloud-agent-run-service.ts:1500 |
| Device B reads the run list or agent-status and shows the pending approval. | device and our servers | agent-status/route.ts:15-66; TasksPage.tsx:891 |
| Person answers on device B; the server claims the checkpoint for the first answer. | our servers | cloud-agent-run-service.ts:1930-1992 |
| Device A polls the run, sees it left the waiting state, and follows the journal. | device and our servers | useChatStream.ts:1538-1600 |
| VS Code or Desktop local sessions: the banner calls the local runtime, which answers the waiting tool on the same machine. | device | sidebarProvider.ts:172-178; agentNotifications.ts:300-330 region |
| Mobile: a background task fetches pending approvals and schedules a local notification. | device and our servers | backgroundFetch.ts:85-125 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pending approval list (run id, tool name, count, model, time) | Read from table cloud_agent_approval_checkpoints on request | Pulled on demand by each device | Only rows younger than 24 hours are returned (agent-status/route.ts:66) |
| Last notification key | Mobile process memory (lastApprovalNotificationKey) | No | Lost when the app process ends |
| Notification banners | Operating system | Not by the app; OS may mirror banners (agentNotifications.ts comment) | Withdrawn when answered elsewhere (agentNotifications.ts:~395) |

**Models and providers.** The answering device does not choose a model; the run resumes with the model resolved on the server. The agent-status route returns the run's model name for display only (agent-status/route.ts:35-40).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Same signed-in account on every device; list and decide are user scoped (agent-status/route.ts:44-62). |
| Permissions | Only the owner of the run can decide (cloud-agent-run-service.ts:1930-1940). Desktop banner Approve is withheld where the page or phone rules require the full dialog (agentNotifications.ts:300-325 region). |
| Subscription | The decide call passes the same managed gates as a normal resume, so a depleted plan can block the answer (approve/route.ts:167-195). Cloud Code decide also checks managed compute access (approvals/route.ts:100-110). |
| Limits and metering | Mobile list limited to 50 pending items (agent-status/route.ts:15). Cloud Code decide is rate limited per user (approvals/route.ts:70). |
| Feature flags | Cloud Code decide needs e2b provisioning ready (approvals/route.ts:75). Mobile notification obeys the 'agent_approval_needed' preference (backgroundFetch.ts:95). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | VS Code and Desktop banners and the CLI prompt work for local sessions without an account. Cross-device answers for Cloud runs need an account. Mobile Local mode: no approval notification path was found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Answered on another device first | 409 and 'Another device already answered this approval.'; Web chat folds in the result | TasksPage.tsx:177; useChatStream.ts:1456 |
| Expired before answer | 410 and 'This approval expired and the task can no longer continue from it.' | TasksPage.tsx:180 |
| Window focused (VS Code) | No banner | sessionActivityAlert.ts:31 |
| Question instead of yes or no | VS Code banner offers Open chat only | sessionActivityAlert.ts:36-40 |
| Platform has no banner actions (Desktop) | Click opens the session | agentNotifications.ts:371-378 |
| Poll error | Web back-off; stops on 401, 403, 404 | useChatStream.ts:1439,1570-1583 |
| Notifications off (Mobile) | Banner 'Approval alerts are off...' on Tasks | CloudTasksScreen.tsx:73 |
| Send fails (VS Code) | Error toast with Retry unless 409 or 410 | cloudRunApproval.ts:60-65,170-180 |
| Chrome remote answer | not handled in the code that was read | tasksSheet.ts, side_panel.ts searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/hooks/useChatStream.approval.test.tsx`: Follows a run another device answered, also after reload (lines 519,586)
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.approvals.test.tsx`: One decision per call, race with another device (line 117)
- `apps/extension-vscode/src/__tests__/sessionActivityAlert.test.ts`: Allow once and Deny, question shows Open chat, silent when focused
- `apps/extension-vscode/src/__tests__/cloudTasks.test.ts`: Approve and reject once per pending call, none when no approval
- `apps/desktop/electron/__tests__/agentNotifications.test.ts`: Approve and Deny routing and the rules that withhold Approve
- `apps/web/lib/services/cloud-agent-run-service.test.ts`: Pending approval summary for other surfaces (line 427)
- `apps/mobile/__tests__/cloud-tool-approval-expired.test.ts`: Mobile approval liveness and rehydrate

**Test scenarios**

- **Answer on phone**
  1. Start a Cloud run needing approval on Web.
  2. Open Mobile Tasks, open the run, press Approve.
  - Expected: Run continues; Web shows it continue within seconds.
- **Double answer**
  1. Open the run on two devices.
  2. Approve on both quickly.
  - Expected: One succeeds; the other shows the already-answered message.
- **VS Code banner**
  1. Start a local VS Code turn needing approval.
  2. Focus another app.
  3. Press Allow once on the toast.
  - Expected: Turn continues; card shows Allowed once.
- **VS Code question**
  1. Trigger an agent question while unfocused.
  - Expected: Toast has only Open chat.
- **Desktop high risk**
  1. Trigger a high-risk command approval while the app is in the background.
  - Expected: Banner has no Approve button.
- **Chrome other device**
  1. Raise an approval in Chrome, answer on Web.
  - Expected: Record what Chrome shows; behaviour is unknown.

**Where to look when it fails**

- Messages: 'This approval is already being resumed.' (409), 'Pending approval not found.' (404).
- Mobile logs from backgroundFetch; table cloud_agent_approval_checkpoints state values.
- VS Code: error toast 'your decision could not be sent' with the reason.
- Web: warn log 'Could not check a waiting run for a remote answer' (useChatStream.ts:1577).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md)
- Desktop: [70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md)
- Mobile: [70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md)
- CLI: [70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md)
- VS Code: [70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md)

## 10. Gaps and dependencies

- **Chrome cannot answer or follow an approval from another device** Affects: Chrome users. Evidence: tasksSheet.ts has no approval code; brief marks unverified. Work needed: Verify, then add a pending-approval list or follower
- **Mobile notification cannot approve or deny** Affects: Mobile. Evidence: notificationCategories.ts:12 only 'Review'. Work needed: Add safe actions or document as by design
- **Brief says notification is VS Code only; Desktop banner exists** Affects: Brief accuracy. Evidence: agentNotifications.ts:356. Work needed: Update the brief
- **Web follows by polling only for the active conversation** Affects: Web and Desktop. Evidence: useChatStream.ts:1556-1560. Work needed: Push or broader follow
- **Mobile chat remote-answer follow not established** Affects: Mobile. Evidence: no follower found in chatExecutionStore.ts. Work needed: Verify and add if missing
- **CLI cloud Code approvals have no note and use a different expiry** Affects: CLI users. Evidence: code_sessions.rs:118-150; approvals/route.ts:42. Work needed: Align with the Cloud approve contract
- Not built on: Chrome (from the capability ledger).

**Depends on**

- F059-08
- F059-07
- SYS-sync-and-continuity
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- table:cloud_agent_approval_checkpoints
- api:GET /api/mobile/agent-status
- store:cloud task store

## Unknown

- Whether Chrome can answer or follow an approval from another device.
- Whether Mobile chat follows a remote answer.
- Whether Remote Control (phone answers a CLI session) is visible in the current release.
- Whether Web has push notifications for approvals.
- Notification behaviour for Cloud approvals on Desktop (the banner found is for local developer sessions).
