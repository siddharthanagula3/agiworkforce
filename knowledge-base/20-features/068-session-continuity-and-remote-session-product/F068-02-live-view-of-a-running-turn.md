---
id: "F068-02"
type: "feature"
title: "Live view of a running turn"
aliases: ["Live view of a running turn", "Same tool activity", "Resume after reconnect", "thread/reconnect (local kind)", "Read-only attachment (not built)"]
area: "68 Session continuity and remote-session product"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S68.09", "S68.10", "S68.26"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:desktop", "mode:cloud", "mode:local", "SYS-sync-and-continuity", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "table:cloud_code_agent_steps", "table:cloud_code_agent_turns", "F068-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-02 Live view of a running turn

A running cloud Code turn is shown on web and phone by reading the session every 4 seconds while the turn runs. Local sessions have real reconnect: after a drop, VS Code, desktop and the terminal remote host get the partial reply and pending approvals back. Read-only attach is declined by decision.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.09](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6809), [S68.10](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6810), [S68.26](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6826).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows what a running coding turn is doing (tool steps, commands, final message) on a second client, and lets a client that lost its connection return to the same state.

**Why it exists.** A person starts a long task, closes the laptop or locks the phone, and wants to see progress and pick up where they left off.

**Who uses it.** Developers running long cloud or local coding turns, and testers of reconnect behaviour.

**Problems it solves**

- Long turns are not lost when a tab closes or a phone sleeps.
- A second client can see tool activity without owning the turn.
- A client opened mid-turn can still answer pending approvals (local kind).

**Use cases**

- Start a cloud task on web, watch it on the phone.
- Lock the phone during a turn, unlock, see new steps.
- Reload VS Code during a local turn and get the partial reply back.
- Run agi code show to see what each turn did.

## 2. User experience

**Where to find it**

- Web: the Code page transcript for an open session (apps/web/features/code/CloudCodePage.tsx:700-757).
- Phone: the AGI Code session screen; a 'Working' indicator and stop control show while a turn runs (packages/contracts/types/src/cloud-code.ts:241-253; apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:527-532).
- CLI: agi code show <id> for a snapshot (apps/cli/src/lib.rs:3146); after agi code start the terminal waits for the turn (lib.rs:3365-3386).
- VS Code: the Sessions quick pick (a snapshot) and the cloud tasks tree (refresh every 15 seconds) (apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:272-290; cloudTasksTree.ts:10).
- Desktop and VS Code local turns: the chat panel shows the live reply and reattaches after reload (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3085-3110).

**Before you start**

- A session that is running a turn.
- Cloud kind: cloud switch on and plan entitled (see F068-01).
- Phone to desktop Remote Control: hidden in the first release (apps/mobile/lib/v1FeatureFlags.ts:16).

**Screens and controls**

- Phone 'Stop the task' and 'Stopping the task' labels (packages/contracts/types/src/cloud-code.ts:244-245).
- Phone offline screen with Reconnect button and 'Reconnecting to <computer>…' text (apps/mobile/app/(app)/companion/code/[threadId].tsx:19-44,59-62).
- Web pairing note: 'It reconnects on its own while Remote Control is on' (apps/web/features/desktop-host/components/RemoteControlSection.tsx:43-44).

**Journey**

1. 1. A turn starts on one client.
2. 2. A second client opens the session.
3. 3. The second client reads the session now and again every 4 seconds while the latest turn has no stop reason.
4. 4. New tool steps appear as the server stores them.
5. 5. When the turn ends polling stops; on foreground return the phone reads once more.

**What the person sees and gets**

- Steps appear with their label and an error mark (packages/contracts/types/src/cloud-code.ts:257-264).
- Phone: 'Reconnecting to <computer>…' while connecting, reconnecting or stale; '<computer> is offline' with an explanation when not (apps/mobile/app/(app)/companion/code/[threadId].tsx:33-61).
- VS Code local: notice 'Some live output was missed, so this answer was reloaded from the local runtime.' (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5278-5290).

**Settings**

- Transcript Normal or Verbose on web (apps/web/features/code/components/CodeSessionMenu.tsx:100-120).
- None found for the poll interval; it is a constant.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The cloud turn writes one step row per finished tool call, so a poll sees progress (apps/web/lib/services/cloud-code-agent-service.ts:757-780).
- Web polls every 4 seconds while the latest stored turn has no stop reason, and skips a read while the page's own turn is pending (apps/web/features/code/CloudCodePage.tsx:182,699-757).
- Phone polls every 4 seconds when ready, the app is active and a turn or busy session exists; it waits for a slow poll before asking again (apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:35,175-193; test apps/mobile/__tests__/CloudCodeSessionPolling.test.tsx).
- Phone reloads on foreground (useCloudCodeSession.ts:159-163).
- Local kind: thread/reconnect returns the running turn id, partial reply, next delta index, next event sequence, and pending approvals and questions (apps/cli/src/app_server/developer_host.rs:3943-4010).
- VS Code attaches to a running local turn on reload and recovers missed output (ChatStateManager.ts:3085-3110,5255-5290); desktop does the same through toPanelActiveTurn (apps/desktop/electron/runtime/developerSessionService.ts:2600-2640,2667-2676); the terminal remote host also answers reconnect (apps/cli/src/tui/remote_host.rs:448-470).

**Incomplete**

- The cloud view is polling, not streaming; the phone and web show steps only after the server stores them [inferred from the poll design].
- VS Code cloud sheet and agi code show are single reads (cloudCodeSessions.ts:280; apps/cli/src/lib.rs:3146).
- CLI wait for the first cloud turn uses a 330-second request limit while the server turn limit is 800 seconds (apps/cli/src/cloud/code_handoff.rs:14; packages/contracts/types/src/cloud-code.ts:259-266), so a long turn may outlast the CLI wait [inferred].

**Present but disconnected or switched off**

- Phone Remote Control (companion) screens are hidden by FEATURES.companion = false (apps/mobile/lib/v1FeatureFlags.ts:16).

**Not available**

- Read-only attach (S68.10): not built on any app by decision D-2026-09-28-03 (doc: docs/decisions/2026-09-27-founder-decisions.md:166).
- Attaching to a turn running in another process on CLI, VS Code, desktop: not built by decision (doc: docs/decisions/2026-09-27-founder-decisions.md:88).
- Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- Tool activity of a running turn streams to every attached client. (source: brief S68.09)
- After a dropped connection the client reconnects and resumes the same session state. (source: brief S68.26)
- A client may attach read-only (S68.10) - declined, not built. (source: docs/decisions/2026-09-27-founder-decisions.md:166)
- Attaching to a turn run by another process is not built on CLI, VS Code, desktop. (source: docs/decisions/2026-09-27-founder-decisions.md:88)

**Acceptance criteria**

1. While a cloud turn runs, a second client shows new steps within about two poll intervals (8 seconds).
2. Polling stops when the turn has a stop reason, and on the phone when the app is in the background.
3. Returning the phone to the foreground triggers one reload.
4. After reloading VS Code mid local turn, the partial reply and pending approvals reappear.
5. No client offers a read-only attach control.
6. A failed poll does not blank the transcript.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web and phone should show approvals in the same poll so a waiting turn is noticed [inferred from useCloudCodeSession.ts:121-127].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add server push so cloud steps show without a 4-second delay.
- [proposed] Make the CLI wait limit follow the server limit constant.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CloudCodePage polling effect | `apps/web/features/code/CloudCodePage.tsx` | Web 4-second poll of the active turn |
| hook | useCloudCodeSession | `apps/mobile/src/features/cloud-code/useCloudCodeSession.ts` | Phone poll, foreground reload, working state |
| store | cloudCodeRequests | `apps/mobile/src/features/cloud-code/cloudCodeRequests.ts` | Phone pending requests that outlive a screen |
| service | cloud-code-agent-service step recorder | `apps/web/lib/services/cloud-code-agent-service.ts` | Stores a step row per tool end and runs the turn |
| table | cloud_code_agent_steps | `apps/web/lib/services/cloud-code-agent-service.ts` | Per-step rows read by every client |
| table | cloud_code_agent_turns | `apps/web/db/neon/0082_cloud_code_agent_turns.sql` | Turn rows with stop reason and cancel time |
| endpoint | POST /api/code/sessions/[sessionId]/agent | `apps/web/app/api/code/sessions/[sessionId]/agent/route.ts` | Starts a turn and holds the request open (body not opened) |
| endpoint | POST /api/code/sessions/[sessionId]/agent/cancel | `apps/web/app/api/code/sessions/[sessionId]/agent/cancel/route.ts` | Records a stop request |
| config | turn request limit | `packages/contracts/types/src/cloud-code.ts` | CLOUD_CODE_AGENT_TURN_REQUEST_LIMIT_MS = 800000 |
| command | agi code show / start | `apps/cli/src/lib.rs` | CLI snapshot and first-turn wait with Ctrl-C stop |
| service | cloudTasksTree | `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts` | VS Code 15-second refresh of cloud tasks |
| service | thread reconnect (app server) | `apps/cli/src/app_server/developer_host.rs` | Returns active turn snapshot for a local thread |
| service | TuiRemoteHost | `apps/cli/src/tui/remote_host.rs` | Shares the open terminal session to a remote client and answers reconnect |
| service | LocalRuntimeClient.reconnectThread | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | VS Code client call to thread/reconnect |
| service | ChatStateManager attach and recovery | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Attaches to a running local turn and recovers missed output |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Desktop reads active turn from thread/reconnect |
| store | connectionStore | `apps/mobile/stores/connectionStore.ts` | Phone relay connection states stale and reconnecting |
| screen | companion code thread screen | `apps/mobile/app/(app)/companion/code/[threadId].tsx` | Offline and reconnecting views for a computer session |
| config | FEATURES | `apps/mobile/lib/v1FeatureFlags.ts` | companion flag hides Remote Control |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person starts a turn on client A; the server runs the agent in the cloud sandbox and writes steps as tools finish. | our servers | apps/web/lib/services/cloud-code-agent-service.ts:757-780 |
| The sandbox where commands run is an outside service (E2B). | outside service | apps/web/lib/e2b/gate.ts:1-28 |
| Client B reads the session and turns on a timer. | device | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:177-193 |
| Client B rebuilds the transcript and shows steps. | device | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:193-200 |
| Local kind: client calls thread/reconnect on the local app server and gets partial output and pending approvals. | device | apps/cli/src/app_server/developer_host.rs:3943-4010 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Step rows (tool name, arguments, output cut to a maximum, error flag) | table cloud_code_agent_steps | Visible to all clients through the session read | unknown |
| Local partial reply and event sequence | memory of the local app server process | Not synced | Gone when the process ends [inferred] |

**Models and providers.** The turn runs with the model the starting client sent. A viewing client uses no model. Provider route for cloud turns: unknown (resolveHarnessModel at apps/web/lib/services/cloud-code-agent-service.ts:41 not opened).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Same account on both clients for cloud kind (apps/web/app/api/code/sessions/route.ts:40-44). |
| Permissions | Reads are owner scoped by user and organization (apps/web/lib/services/cloud-code-agent-approval-service.ts:85-97 shows the owner filter pattern). |
| Subscription | Same gate as F068-01: plan includes AGI Code and managed compute access passes (apps/web/lib/services/cloud-code-session-open.ts:138-147). Reading an existing session: no separate subscription check found. |
| Limits and metering | The turn is metered when it runs (apps/web/lib/services/cloud-code-agent-service.ts:302-312). Polling is not metered as far as read. Read routes use a read rate limit (apps/web/app/api/code/sessions/route.ts:42). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY, AGI_MANAGED_COMPUTE_PRIVATE_BETA; phone FEATURES.companion for Remote Control. |
| Model compatibility | Not relevant to viewing; the turn's model is chosen by the starter. |
| Provider restrictions | none found in the code for viewing. |
| Local mode | Cloud live view does not apply in Local or own-key mode. The local kind (VS Code, desktop, terminal) works on the device without cloud. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Slow poll | Next poll is scheduled only after the previous one finishes. | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:180-190 |
| App in background | Phone stops polling when appState is not active and reloads on return. | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:102,159-163,175 |
| Screen closed | Timer is cleared and no further request is made. | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:191-193; test apps/mobile/__tests__/CloudCodeSessionPolling.test.tsx |
| Session deleted while watching | Web stops polling and redirects; phone shows missing. | apps/web/features/code/CloudCodePage.tsx:735-747; useCloudCodeSession.ts:136-138 |
| Phone to desktop relay stale | Phone shows Reconnecting, then offline explanation with Reconnect. | apps/mobile/app/(app)/companion/code/[threadId].tsx:19-61 |
| Missed local output | VS Code replaces the stream with the stored partial reply and shows a notice. | apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5255-5290 |
| Account changes during polling | Pending phone requests are retired. | test apps/mobile/__tests__/CloudCodeSessionPolling.test.tsx (title 'retires pending Code requests when the Cloud account changes') |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/CloudCodeSessionPolling.test.tsx`: Slow poll wait, stop on close, pending task after reopen, retire on account change
- `apps/web/features/code/CloudCodePage.test.tsx`: Web Code page (cases about polling not individually opened)
- `apps/cli/tests/developer_session_host.rs`: Developer session host integration (file exists; reconnect cases not opened)
- `apps/desktop/electron/__tests__/developerSessionService.test.ts`: Desktop local session service (reconnect cases not opened)

**Test scenarios**

- **Watch a cloud turn from the phone**
  1. Start a long task on web.
  2. Open the session on the phone.
  3. Wait 10 seconds.
  - Expected: New steps appear; polling ends when the turn stops.
- **Background the phone**
  1. Open a running session on the phone.
  2. Send the app to background for a minute.
  3. Return.
  - Expected: One reload on return; no polling while away.
- **Reload VS Code mid turn**
  1. Start a local turn in VS Code.
  2. Reload the window.
  3. Reopen the chat.
  - Expected: Partial reply and any pending approval reappear.
- **Read-only attach**
  1. Look for a read-only attach control on every app.
  - Expected: None offered.
- **Delete while watching**
  1. Watch a session on web.
  2. Delete it from another client.
  - Expected: Web shows 'not available' and returns to Code home.

**Where to look when it fails**

- Phone 'This session could not be opened' (apps/mobile/src/features/cloud-code/service.ts:11).
- Table cloud_code_agent_turns stop reason and cancel_requested_at (apps/web/db/neon/0319_cloud_code_turn_controls.sql).
- Local app server error 'Remote Control stopped for this session in the terminal.' (apps/cli/src/tui/remote_host.rs:128-131).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md)
- Desktop: [70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md)
- Mobile: [70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md)
- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)
- VS Code: [70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **Cloud view is polling with a 4-second delay, not streaming.** Affects: Web and phone. Evidence: apps/web/features/code/CloudCodePage.tsx:182; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:35. Work needed: Server push if live streaming is required by S68.09.
- **VS Code and CLI show a snapshot of a cloud turn, not a live view, while the brief marks S68.09 done.** Affects: VS Code, CLI. Evidence: apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:280. Work needed: Clarify that the brief item refers to the local remote host, or add refresh.
- **CLI wait limit shorter than server turn limit.** Affects: CLI users with long turns. Evidence: apps/cli/src/cloud/code_handoff.rs:14; packages/contracts/types/src/cloud-code.ts:259-266. Work needed: Use the shared limit constant; [inferred] risk.
- **Phone to desktop reconnect is hidden in v1.** Affects: Phone. Evidence: apps/mobile/lib/v1FeatureFlags.ts:16. Work needed: Owner decision to enable companion.
- **Web S68.26 is not stated in the brief; web reload re-reads the session but no reconnect logic beyond polling was found.** Affects: Web. Evidence: apps/web/features/code/CloudCodePage.tsx:699-757. Work needed: Decide if polling counts as resume.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:desktop
- mode:cloud
- mode:local
- SYS-sync-and-continuity
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- table:cloud_code_agent_steps
- table:cloud_code_agent_turns
- F068-01

## Unknown

- Whether any push channel exists besides polling for cloud sessions.
- How the desktop panel shows reconnect in the UI (service read, panel not opened).
- Retention of step rows.
- Why web has no S68.26 status in the brief.
