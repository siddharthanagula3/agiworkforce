---
id: "F019-07"
type: "feature"
title: "Reconnect, resume and background work"
aliases: ["Reconnecting", "Reconnecting…", "Resume run", "Durable run follow", "Background run", "Detached run", "Re-attach", "In-flight turn recovery", "x_run_detached", "RESUME_CHAT_RUN", "agi background (alias bg)"]
area: "19 Streaming and response-presentation states"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S19.19", "S19.20", "S19.29"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "file:apps/web/lib/hooks/useChatStream.ts", "file:packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts", "table:cloud_agent_runs", "table:cloud_agent_events", "api:GET /api/llm/v1/chat/completions/runs/{runId}", "api:POST /api/llm/v1/chat/completions/runs/{runId}/resume/stream", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-execution-boundaries", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F019-07 Reconnect, resume and background work

When the link drops during a Cloud turn, the app shows 'Reconnecting…' and re-reads the server's saved event journal from the last event it saw. Cloud runs continue on our servers after the window closes, so reopening shows the latest or final state. The CLI runs local background processes.

Area: [19. Streaming and response-presentation states](README.md). Requirement items: [S19.19](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1919), [S19.20](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1920), [S19.29](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1929).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps a turn alive across a dropped connection, a closed window or a restart. For Managed Cloud turns the server writes every event to a journal; the app asks for events after its last sequence number and shows the 'Reconnecting…' label until events flow again (apps/web/lib/hooks/useChatStream.ts:3093-3200; packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:528-582). On the CLI, 'agi background' starts a detached local process that keeps working after the terminal closes (apps/cli/src/background.rs:246-300).

**Why it exists.** Long agent turns outlive a flaky network, a laptop lid or a phone going to the background. Without resume the person would lose the answer or pay for a second run. Brief items S19.19, S19.20, S19.29 require a visible reconnect state, resume rather than restart, and work that continues after the UI closes (doc: knowledge-base/data/area-briefs/019-streaming-and-response-presentation-states.md).

**Who uses it.** Anyone running a long Cloud turn on Web, Desktop, Mobile or the Chrome extension; CLI users who start background runs; VS Code users who reopen a session.

**Problems it solves**

- A dropped connection no longer leaves the answer spinning or lost.
- Closing the window or app does not cancel Cloud work.
- A duplicate paid run is avoided because a recent unanswered question with no run is waited on, not called stopped (apps/mobile/src/features/chat/inFlightTurnRecovery.ts, comment above questionMayStillBeAnswered).
- A run that died on the server is reported as stopped instead of spinning forever (apps/web/lib/hooks/useChatStream.ts:4128-4135).

**Use cases**

- Start a long research turn on the web, lose Wi-Fi, see 'Reconnecting…', and watch it continue when the network returns.
- Close the Desktop window mid-run, reopen later and find the finished answer.
- Start a Cloud turn on the phone, switch apps, return and see the answer that finished meanwhile.
- Run 'agi background start <prompt>' in the terminal, close it, then 'agi background attach <id>' later.

## 2. User experience

**Where to find it**

- Web: the line 'Reconnecting…' with a spinner under the assistant answer (apps/web/features/chat/components/messages/StreamPhaseNotice.tsx; mounted at apps/web/features/chat/components/messages/MessageBubble.tsx:3620).
- Desktop: the public Desktop window loads the hosted web app, so it shows the same Web label (apps/desktop/electron/main.ts:345; doc: AGENTS.md section 5).
- Mobile: the streaming label reads 'Reconnecting…' on the answer bubble (apps/mobile/src/features/chat/components/MessageBubble.tsx:1932-1935).
- Chrome extension: the side panel status 'Reconnecting…' (apps/extension/_locales/en/messages.json key spReconnecting; apps/extension/src/features/side-panel/bubbles.ts:653-656).
- CLI: commands 'agi background start|list|logs|stop|remove|attach' (alias 'bg') and 'agi resume [--cloud]' (apps/cli/src/lib.rs:910-925). No reconnecting label for chat turns was found in the CLI; the only 'reconnecting' text found is for Remote Control (apps/cli/src/tui/tui_app.rs:4776).
- VS Code: the session list opens an earlier session through resume (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1562, 2913). No 'Reconnecting' label was found in the VS Code chat code; the only reconnect strings are Remote Control and MCP servers (apps/extension-vscode/src/features/remote-control/index.ts:48).

**Before you start**

- Signed in and in Managed Cloud mode (mode:cloud) with a turn that has a server run; plain streamed turns recover through the saved turn instead (apps/web/lib/hooks/useChatStream.ts:3795-3800).
- Not a temporary conversation: the cursor replay is skipped for temporary chats (apps/web/lib/hooks/useChatStream.ts:3041-3042).
- CLI: a local install; background runs need no account by themselves, but the model route follows the CLI configuration [inferred].

**Screens and controls**

- Web/Desktop: status line 'Reconnecting…' (role=status) that replaces nothing else; 'Stopping the Cloud task…' uses the same component (apps/web/features/chat/components/messages/StreamPhaseNotice.tsx).
- Mobile: bubble label 'Reconnecting…'; after reopen, a live/ended/unknown run state on the last answer (apps/mobile/src/features/chat/inFlightTurnRecovery.ts:78-86); messages 'Waiting for the answer. It appears here when it is ready.' and 'This turn stopped running on the server and will not finish. Send it again to retry.' (same file, lines 17-20).
- Chrome: the 'Reconnecting…' status and the Stop button.
- CLI: 'agi background' subcommands; states shown are running, finished, failed, stopped, 'ended without a result' (apps/cli/src/background.rs:46-60).

**Journey**

1. 1. The person sends a Cloud turn; the server starts a run and journals every event.
2. 2. The connection drops (network loss, server time budget, app suspended).
3. 3. The app shows 'Reconnecting…' on the answer.
4. 4. The app asks the server for events after the last sequence it saw and appends only what is missing.
5. 5. When the first event or snapshot arrives the label clears and text continues.
6. 6. If the run already finished, the final state is read and shown without replaying what was already on screen.
7. 7. If the run cannot be followed, the turn is marked failed with an error rather than left spinning.
8. 8. After closing and reopening the window or app, the app asks whether a run is still going for the conversation and follows it or loads the finished answer.

**What the person sees and gets**

- 'Reconnecting…' label (Web, Desktop, Mobile, Chrome).
- Web error text 'This turn stopped running on the server and will not finish. Send it again to retry.' for a stalled run (apps/web/lib/hooks/useChatStream.ts:4128-4135).
- Web error 'The answer stream lost events and could not be resumed.' when replay fails (apps/web/lib/hooks/useChatStream.ts:3773-3775).
- Chrome error 'No AGI Cloud activity was received for 90 seconds.' and 'The extension service restarted before the run was saved.' (apps/extension/src/side_panel.ts:6985-6990, 6934).
- CLI: 'Started background run <id>. It keeps going after this terminal closes.' with log, attach and stop hints (apps/cli/src/lib.rs:1723-1727).

**Settings**

- Chrome: 'Account mirroring' (cloud history) setting affects whether chats sync to the account (apps/extension/src/side_panel.ts:595).
- CLI: 'agi background start' accepts --model and --permission-mode (apps/cli/src/lib.rs:1710-1722).
- No user setting for the reconnect poll interval was found; it is a constant (apps/web/lib/hooks/useChatStream.ts:1365).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: durable-run follow with a 2.5 s poll, 'Reconnecting…' phase, cursor replay for plain streams, re-attach when the server detaches a working run (apps/web/lib/hooks/useChatStream.ts:1365, 3041-3200, 3506-3508).
- Web: on page load or conversation switch the app asks whether a turn is still running, re-checks every 5 s and shows an error when the run stalled (apps/web/lib/hooks/useChatStream.ts:4053-4135; apps/web/lib/hooks/inFlightTurnRecovery.ts:10).
- Server: run journal tables and snapshot endpoint with after/limit paging (apps/web/db/neon/0061_cloud_agent_runs.sql; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:35-58).
- Server: turn tail replay endpoint for dropped plain streams (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:30-50).
- Desktop (Electron): shows the hosted web app, so the Web behaviour applies (apps/desktop/electron/main.ts:345) [inferred from doc: AGENTS.md section 5]. The retained Tauri code also follows runs (apps/desktop/src/runtime/CloudRuntime.ts:681-700).
- Mobile: 'Reconnecting…' label, 3 reconnect attempts with 1 s, 2.5 s, 5 s back-off, journal follow on network error or stall, in-flight turn recovery after reopen using a record kept in device storage (apps/mobile/services/streaming.ts:323-325, 1118-1210; apps/mobile/src/features/chat/inFlightTurnRun.ts:3-5; apps/mobile/src/features/chat/inFlightTurnRecovery.ts:165).
- Mobile: a foregrounded app aborts a stalled stream only when no Cloud run is active for that conversation (apps/mobile/stores/chat/chatExecutionStore.ts:1144-1158).
- Chrome: 'Reconnecting…' flag, re-attach through RESUME_CHAT_RUN when the background worker restarts or the panel is reopened (apps/extension/src/side_panel.ts:1690-1715, 6910-7030; apps/extension/src/background.ts:5297).
- CLI: background runs start a detached supervisor process, are listed, logged, stopped, removed and attached (apps/cli/src/background.rs; apps/cli/src/lib.rs:1718-1819); 'agi resume' continues a saved session.
- VS Code: session resume through the runtime (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2913).

**Incomplete**

- Mobile background continuation: the code exists (a Cloud run keeps going on the server and is re-found on reopen) but the brief marks it unverified and no device-run record was found (doc: knowledge-base/data/area-briefs/019-streaming-and-response-presentation-states.md S19.29).
- Brief says 'poll every 2.5 seconds on web'; Mobile, Desktop (Tauri) and Chrome call followRun without a poll interval, so they use the client default of 1 s (packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:153-157; apps/mobile/services/streaming.ts:983; apps/desktop/src/runtime/CloudRuntime.ts:700).
- CLI background runs are local processes: they stop if the machine sleeps or reboots and end as 'ended without a result' (apps/cli/src/background.rs:46-60, 215-244). They are not Cloud runs.

**Present but disconnected or switched off**

- Web cursor replay is switched off for temporary conversations and turn continuations (apps/web/lib/hooks/useChatStream.ts:3041-3042).

**Not available**

- CLI: no 'Reconnecting' state for a chat turn (brief S19.19 missing; none found in apps/cli/src/tui/tui_app.rs besides Remote Control).
- VS Code: no 'Reconnecting' state for a chat turn (brief S19.19 missing); background continuation unverified (brief S19.29).
- Local mode (mode:local): no durable run or journal exists; recovery and reconnect apply to Managed Cloud only (apps/mobile/src/features/chat/inFlightTurnRecovery.ts:turnToAsk returns null when not cloud).

## 4. Required behaviour

**Established requirements**

- On a drop, the answer shows Reconnecting and the app re-follows the run from the last sequence number it saw (poll every 2.5 seconds on web). (source: S19.19 (brief), task text for F019-07)
- Work that was already running is picked up again after reconnect or reopen and shown as resuming rather than restarting. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.20)
- Work keeps running after the UI is closed and its result is there, or resumes, when the user returns. (source: S19.29 (same brief))
- If the run cannot be followed the answer is marked failed rather than left spinning. (source: task text for F019-07 (failure notices))

**Acceptance criteria**

1. Drop the network mid Cloud turn on Web: 'Reconnecting…' appears, then clears on the first new event; no text is duplicated.
2. Reopen a conversation whose run finished while the app was closed: the final answer and its finished state show without re-running.
3. Reopen while the run is still working: the app follows it and shows live progress, not a restart.
4. Kill the run on the server side (stall past the deadline): the app shows the 'stopped running on the server' error, not a spinner.
5. Mobile: put the app in the background during a Cloud turn, return: the answer is complete or follows on.
6. CLI: 'agi background start', close the terminal, 'agi background list' shows the run; 'stop' ends it and the state reads 'stopped'.
7. Chrome: close and reopen the side panel mid-run: the turn re-attaches with 'Reconnecting…' then continues.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A Local turn needs no reconnect state because no remote run exists [inferred].
- Reconnect copy should be the same wording on every app that has the state [inferred from the shared label on Web, Mobile, Chrome].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Reconnecting…' state to the CLI and VS Code chat turns.
- [proposed] Give Mobile, Desktop and Chrome the same 2.5 s poll interval as Web to reduce request load, or record why 1 s is needed.
- [proposed] Record a device test of background continuation on iOS and Android and update the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | useStreamPhaseStore | `apps/web/features/chat/stores/stream-phase-store.ts` | Holds the per-message phase 'reconnecting' or 'stopping' (Web, Desktop). |
| component | StreamPhaseNotice | `apps/web/features/chat/components/messages/StreamPhaseNotice.tsx` | Renders 'Reconnecting…' or 'Stopping the Cloud task…'. |
| hook | useChatStream (replayDurableRun, replayFromCursor, resumeFromCursor) | `apps/web/lib/hooks/useChatStream.ts` | Web follow, replay, detach handling, poll interval 2.5 s, in-flight check on load. |
| service | createManagedCloudAgentRunClient.followRun | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | Shared client that pages the run journal after a sequence, retries transient errors, stops at a terminal state. |
| endpoint | GET /api/llm/v1/chat/completions/runs/{runId} | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | Returns run state and events after a sequence. |
| endpoint | POST /api/llm/v1/chat/completions/runs/{runId}/resume/stream | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts` | Replays the tail of a saved turn after a cursor. |
| endpoint | GET /api/llm/v1/chat/completions/runs?conversationId= | `apps/web/app/api/llm/v1/chat/completions/runs/route.ts` | Lists runs of a conversation; used by the in-flight check. |
| table | cloud_agent_runs, cloud_agent_events | `apps/web/db/neon/0061_cloud_agent_runs.sql` | Durable run and event journal keyed by sequence. |
| service | inFlightTurnRecovery (web) | `apps/web/lib/hooks/inFlightTurnRecovery.ts` | Web liveness verdict: running, stalled, idle; 5 s re-check. |
| config | DURABLE_STREAM_SILENCE_DEADLINE_MS | `apps/web/lib/deadline-policy.ts` | Silence window after which a run counts as stalled. |
| service | streaming.ts (createDurableRunFollower, streamChat) | `apps/mobile/services/streaming.ts` | Mobile reconnect loop, back-off, durable follow. |
| store | chatExecutionStore (markReconnecting, AppState handler) | `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile reconnecting message ids and foreground stall abort. |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Shows 'Reconnecting…'. |
| hook | useInFlightTurnRecovery | `apps/mobile/src/features/chat/inFlightTurnRecovery.ts` | After reopen asks the server whether the turn is running, follows or restores it. |
| store | in-flight turn run record (MMKV key agi-in-flight-turn-runs-v1) | `apps/mobile/src/features/chat/inFlightTurnRun.ts` | Remembers up to 20 sent questions and run ids on the phone. |
| screen | Chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | Mounts the recovery hook and reloads messages when finished. |
| service | CloudRuntime.replayDurableRun | `apps/desktop/src/runtime/CloudRuntime.ts` | Retained Tauri-build follow of a Cloud run. |
| component | side panel resume (resumeManagedCloudRun) | `apps/extension/src/side_panel.ts` | Chrome panel re-attach, 90 s inactivity watchdog, keepalive port. |
| component | reconnecting status bubble | `apps/extension/src/features/side-panel/bubbles.ts` | Draws the Reconnecting or Stopping status. |
| service | handleResumeChatRun / RESUME_CHAT_RUN | `apps/extension/src/background.ts` | Background worker continues the stream for a resumed run. |
| service | managedRunControl | `apps/extension/src/features/cloud-bridge/managedRunControl.ts` | Chrome follow and cancel confirmation of managed runs. |
| service | background runs | `apps/cli/src/background.rs` | CLI detached run records, supervisor, state, stop, logs. |
| command | agi background / agi resume | `apps/cli/src/lib.rs` | CLI command definitions and handlers. |
| component | ChatStateManager.resumeConversation | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | VS Code session resume through the runtime. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sends a Cloud turn; the server starts a run and writes each event to the journal with a sequence number. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:897 (beginCloudAgentRun); apps/web/db/neon/0061_cloud_agent_runs.sql |
| The app streams events and records the highest sequence seen on the message (cloudAgentRun.lastSequence). | device | apps/web/lib/hooks/useChatStream.ts:2405-2411; apps/mobile/stores/chat/chatExecutionStore.ts:3547-3555 |
| Connection drops, or the server sends x_run_detached when its function time budget ends. | device and our servers | apps/web/lib/hooks/useChatStream.ts:3506-3508 |
| App sets the reconnecting phase and calls followRun after the last sequence; it polls every 2.5 s on Web. | device | apps/web/lib/hooks/useChatStream.ts:3093-3125; packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:528-582 |
| Server returns run state plus events after the sequence; the run snapshot route is rate limited under 'agent-run-follow'. | our servers | apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:35-58 |
| First event or snapshot clears the phase; new text is reconciled against text already shown so nothing repeats. | device | apps/web/lib/hooks/useChatStream.ts:3128-3140; packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts reconcileManagedCloudPublicText |
| At a terminal run state the follow ends, tools are finished, the turn is saved and loading stops; on failure the error is surfaced. | device | apps/web/lib/hooks/useChatStream.ts:3200-3225, 3790-3860 |
| After reopen the app lists runs for the conversation, follows a live one or loads the finished answer; a run silent beyond the deadline is called stalled. | device and our servers | apps/web/lib/hooks/useChatStream.ts:4053-4135; apps/mobile/src/features/chat/inFlightTurnRecovery.ts:165-330 |
| CLI: 'agi background start' spawns a detached supervisor that runs 'agi --print' in the same folder and writes run.json and output.log under the config directory. | device | apps/cli/src/background.rs:246-300, 65-75 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run and event journal rows | tables cloud_agent_runs and cloud_agent_events (Neon Postgres) | Read by every app through the runs endpoint | Events deleted with the run (on delete cascade); runs removed when the conversation is deleted; archive endpoint exists (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/archive/route.ts). Retention period: unknown. |
| Last sequence and run id on the message (cloudAgentRun metadata) | message metadata in the app store and saved message row | Saved with the message | Kept with the message; deleted with the conversation [inferred] |
| Mobile in-flight record (conversation id, question id, operation id, run id) | store:mmkv key agi-in-flight-turn-runs-v1 on the phone | No, device only | Max 20 records; removed when the answer is restored or the run ended (apps/mobile/src/features/chat/inFlightTurnRun.ts) |
| CLI background run record and log | files run.json and output.log in the CLI config directory under background/<id> | No | Removed by 'agi background remove'; no automatic deletion found |

**Models and providers.** Reconnect is independent of the model. The run records the provider and model it used (columns provider and model in cloud_agent_runs). The follow client never chooses a model; mobile deliberately cannot override the model on an approval resume (apps/mobile/services/streaming.ts comment in streamCheckpointResume).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud follow needs a signed-in account; the runs endpoints use the user-scoped database and CSRF for state changes (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:41-44, 70-72). A changed account stops the follow on Web and Mobile (apps/web/lib/hooks/useChatStream.ts assertTokenOwner; apps/mobile/services/streaming.ts isCloudAccountEpochCurrent). |
| Permissions | Run rows are isolated per user (row level security enabled, apps/web/db/neon/0061_cloud_agent_runs.sql:61-62). CLI background runs only signal processes they own (apps/cli/src/background.rs:203-214). |
| Subscription | No reconnect-specific entitlement was found in the code. Starting the Cloud turn is governed by the normal chat entitlement and quota checks; following an existing run was not seen to be metered. |
| Limits and metering | Poll 2.5 s on Web (apps/web/lib/hooks/useChatStream.ts:1365); 1 s default elsewhere; up to 5 transient errors retried by followRun; rate limit bucket 'agent-run-follow' on the snapshot route; mobile 3 reconnect attempts; stall deadline = tool-call limit 120 s + 30 s margin (apps/web/lib/deadline-policy.ts:8, 28). The numeric limiter values: unknown. |
| Feature flags | none found in the code for the reconnect label itself. |
| Model compatibility | Not model dependent in the code read. |
| Provider restrictions | Provider-funded Free models use a separate Free chat route on mobile (apps/mobile/services/streaming.ts, streamChat refuses them on the managed route); whether that route is followable after a drop: unknown. |
| Local mode | Local mode has no run journal and no reconnect label. Mobile asks the server about in-flight turns only for Cloud conversations (apps/mobile/src/features/chat/inFlightTurnRecovery.ts, turnToAsk). The CLI background command runs on the device and needs no subscription of its own; the model route it uses follows CLI settings [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading / first event not yet seen | Waiting indicator until first output; Web shows a wait summary with the model name. | apps/web/lib/hooks/useChatStream.ts:2237-2262 |
| Reconnecting | Label shown, cleared on first event or snapshot, and in the stream's finally block. | apps/web/lib/hooks/useChatStream.ts:3129, 3174, 3861 |
| Run already finished | followRun returns at a terminal state with no replay of shown text; text is reconciled. | packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:570-575 |
| Transient server errors | Retries up to 5 times on 408/425/429/500/502/503/504, honouring Retry-After. | packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:157-161, 552-560 |
| Run cannot be followed | Error is thrown; agent activity is marked failed; the turn shows an error. | apps/web/lib/hooks/useChatStream.ts:3790-3860 |
| Stalled run found on reopen | Web sets the error 'This turn stopped running on the server…'; Mobile shows the same message. | apps/web/lib/hooks/useChatStream.ts:4128-4135; apps/mobile/src/features/chat/inFlightTurnRecovery.ts:17-18 |
| Cancel while reconnecting | Stop sends a cancel to the run and shows 'Stopping the Cloud task…' until a terminal state (30 polls of 1 s). | apps/web/features/chat/lib/cancel-cloud-run.ts:4-24 |
| Offline | Mobile re-asks when the phone comes back online; Web retries through the transient-error loop; Chrome watchdog fails the turn after 90 s with no activity. | apps/mobile/src/features/chat/inFlightTurnRecovery.ts (online effect); apps/extension/src/side_panel.ts:6985-6990 |
| Another device answers | Mobile treats a recent unanswered question with no run as 'waiting' for up to 150 s before 'stopped'. | apps/mobile/src/features/chat/inFlightTurnRecovery.ts questionMayStillBeAnswered |
| Account switched | Follow stops and callbacks are dropped. | apps/mobile/services/streaming.ts:1119-1123; apps/web/lib/hooks/useChatStream.ts assertTokenOwner |
| Accessibility | Web label uses role=status with a hidden spinner; other apps: not checked. | apps/web/features/chat/components/messages/StreamPhaseNotice.tsx |
| CLI process lost | A background run whose supervisor never reported after 60 s, or whose process is gone, reads 'ended without a result'. | apps/cli/src/background.rs:7, 215-244 |
| Empty state | none (brief: no empty state). | brief S19.19-S19.20 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/hooks/useChatStream.test.tsx`: Keeps the run handle and replay cursor on the message; replays only missing journal events after an SSE drop; re-attaches after x_run_detached; Stop reaches the server run.
- `apps/web/lib/hooks/inFlightTurnRecovery.test.ts`: Web liveness verdicts and the stall deadline.
- `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.test.ts`: Turn tail replay endpoint.
- `apps/web/app/api/llm/v1/chat/completions/runs/route.test.ts`: Run listing endpoint.
- `packages/contracts/cloud-contracts/src/__tests__/managed-cloud-agent-runs-client.test.ts`: followRun paging, transient retry and abort.
- `apps/mobile/__tests__/InFlightTurnRecovery.test.tsx`: Mobile asks about, follows and reports stopped or waiting turns.
- `apps/mobile/__tests__/streaming-detached-run.test.ts`: Mobile durable follow after a detached run.
- `apps/mobile/__tests__/streaming-detached-resume.test.ts`: Mobile resume of a detached run.
- `apps/mobile/__tests__/InFlightTurnRunRecord.test.ts`: The on-phone in-flight record.
- `apps/extension/__tests__/managed-run-control.test.ts`: Chrome follow and cancel confirmation.
- `apps/desktop/src/runtime/__tests__/CloudRuntime.test.ts`: Retained Tauri runtime follow of a Cloud run.
- `apps/cli/src/background.rs`: In-file Rust tests for supervisor pid, lost runs, stop and failed launch.

**Test scenarios**

- **Web network drop during a Cloud turn**
  1. Start a long Cloud turn on Web.
  2. Switch the browser to offline for 10 s, then online.
  3. Watch the answer.
  - Expected: 'Reconnecting…' appears, clears on the first new event, text continues without duplicates, and the turn ends done.
- **Close and reopen while running**
  1. Start a long agent turn on Web or Desktop.
  2. Close the window after the first steps.
  3. Reopen the conversation after the run should have ended.
  - Expected: The final state and answer are shown; no second run was started.
- **Mobile background**
  1. Start a Cloud turn on the phone.
  2. Send the app to the background for 60 s.
  3. Return.
  - Expected: The answer is complete or live; no 'stopped' message unless the run really stalled past the deadline. Result: not verified in any file read.
- **Stalled run**
  1. Use a run that stops emitting events past the deadline.
  2. Open its conversation.
  - Expected: Error 'This turn stopped running on the server and will not finish. Send it again to retry.'
- **CLI background run**
  1. Run 'agi background start "say hi"'.
  2. Close the terminal, open another, run 'agi background list' then 'logs <id>'.
  3. Run 'agi background stop <id>' on a long one.
  - Expected: List shows running then finished; stop shows state 'stopped'.
- **Chrome panel reopen**
  1. Start a Cloud turn in the side panel.
  2. Close and reopen the panel.
  - Expected: The turn re-attaches with 'Reconnecting…' then continues or shows the final answer.

**Where to look when it fails**

- Web console: '[useChatStream] Could not check a waiting run for a remote answer' (apps/web/lib/hooks/useChatStream.ts:1580).
- Error names ManagedCloudAgentRunHttpError and ManagedCloudAgentRunAbortError (packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts).
- Tables cloud_agent_runs (state, last_event_sequence) and cloud_agent_events (run_id, sequence).
- Chrome error strings from apps/extension/src/side_panel.ts:6934, 6990.
- CLI: output.log and run.json under the config directory 'background' folder; 'agi background logs <id>'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/web/019-streaming-and-response-presentation-states.md)
- Desktop: [70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md)
- Mobile: [70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md)
- CLI: [70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md)
- VS Code: [70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md)
- Chrome: [70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md)

## 10. Gaps and dependencies

- **No Reconnecting state for chat turns in the CLI and VS Code.** Affects: CLI and VS Code users. Evidence: Brief S19.19 (missing); no matching string found in apps/cli/src/tui/tui_app.rs or apps/extension-vscode/src besides Remote Control and MCP.. Work needed: Add a reconnect phase to each turn renderer, driven by the same run-follow client.
- **Mobile background continuation has no recorded device verification.** Affects: Mobile users. Evidence: Brief S19.29 (unverified); code exists in apps/mobile/src/features/chat/inFlightTurnRecovery.ts. Work needed: Run on iOS and Android devices with a long Cloud turn and record the result.
- **VS Code background continuation unverified.** Affects: VS Code users. Evidence: Brief S19.29. Work needed: Establish whether the session host keeps running after the window closes and test it.
- **Poll interval differs: 2.5 s on Web, 1 s default on Mobile, Desktop (Tauri) and Chrome.** Affects: Server load; consistency with the brief. Evidence: apps/web/lib/hooks/useChatStream.ts:1365 vs apps/mobile/services/streaming.ts:983. Work needed: Decide one shared interval in the shared client and apply it.
- **CLI background runs are local and stop with the machine; they are not Cloud runs.** Affects: CLI users expecting server-side continuation. Evidence: apps/cli/src/background.rs:246-300. Work needed: Decide whether the CLI should offer Cloud background runs; document the difference.
- **Retention of run journal rows is unknown.** Affects: Reopening very old conversations. Evidence: No retention job found in the files read. Work needed: Find or define the retention rule and document it.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- file:apps/web/lib/hooks/useChatStream.ts
- file:packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts
- table:cloud_agent_runs
- table:cloud_agent_events
- api:GET /api/llm/v1/chat/completions/runs/{runId}
- api:POST /api/llm/v1/chat/completions/runs/{runId}/resume/stream
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-execution-boundaries
- SYS-authentication-and-identity

## Unknown

- Whether Mobile background continuation works on real devices; no run record found.
- Whether VS Code keeps a running turn alive after the window closes.
- Run journal retention period.
- Numeric value of the 'agent-run-follow' rate limit.
- Whether provider-funded Free turns on Mobile can be followed after a drop.
- Accessibility of the Reconnecting label on Mobile, Chrome and CLI was not checked.
