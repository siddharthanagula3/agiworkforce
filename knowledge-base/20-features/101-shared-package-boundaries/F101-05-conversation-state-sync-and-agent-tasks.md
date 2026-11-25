---
id: "F101-05"
type: "feature"
title: "Conversation state, sync and agent tasks"
aliases: ["client-runtime message queue", "follow-up queue", "applyAgentActivityEvent", "@agiworkforce/sync", "sync engine", "tombstones", "task board stages", "scheduled run cancellation", "S101.13", "S101.14", "S101.24"]
area: "101 Shared package boundaries"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S101.13", "S101.14", "S101.24"]
depends_on: ["SYS-sync-and-continuity", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "F101-01", "F101-04", "surface:chrome", "surface:mobile", "surface:vscode", "file:packages/client/sync/src/index.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F101-05 Conversation state, sync and agent tasks

A shared message queue holds follow-ups sent while an answer streams; VS Code caps it at 20, the shared default is 100 per priority lane. A shared reducer builds agent activity. A shared sync package handles cursors, deltas and tombstones. Task states map to board stages; Chrome reads that map to cancel scheduled runs.

Area: [101. Shared package boundaries](README.md). Requirement items: [S101.13](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10113), [S101.14](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10114), [S101.24](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10124).

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

**What it does.** Keeps conversation state moves in shared code: a priority message queue (packages/client/client-runtime/src/queue/messageQueueManager.ts), an activity reducer (packages/client/client-runtime/src/agentActivity.ts:484), a sync package for cursors, conversation, message, memory, project and settings deltas and tombstones (packages/client/sync/src), and one task-state to board-stage map (packages/contracts/types/src/cross-device.ts:413-431).

**Why it exists.** A client that drops a deleted row keeps no record the deletion reached it, so its next push re-creates the row (packages/client/sync/src/tombstones.ts:1-6). Each client inventing its own queue or lifecycle names makes states disagree.

**Who uses it.** People who type follow-ups mid-answer, use more than one device, or schedule runs; engineers.

**Problems it solves**

- Messages lost while an answer streams
- A deleted chat coming back from another device
- Chrome treating a partial or timed-out run as still running (packages/contracts/types/src/cross-device.ts:425-427)
- Mobile showing archived chats (apps/mobile/services/cloudSyncEngine.ts:128,146)

**Use cases**

- Type a follow-up in VS Code while the assistant answers; it waits and runs next (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1066)
- Star a chat on Web and see a star on the Mobile chat row (apps/mobile/services/cloudSyncEngine.ts:120,136)
- Delete a chat on Web and have Mobile receive the tombstone (packages/client/sync/src/tombstones.ts:22)
- Cancel a scheduled Chrome run and have it settle correctly (apps/extension/src/features/background/scheduled-task-cancellation.ts:127-146)

## 2. User experience

**Where to find it**

- VS Code chat sidebar: a notice when the follow-up queue is full (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4813)
- Chrome side panel: follow-up queue (apps/extension/src/side_panel.ts:8701) and the Schedules section with run statuses (apps/extension/src/features/side-panel/schedulesSection.ts:1049-1062)
- Mobile chat list: star on a row; archived chats absent (apps/mobile/services/cloudSyncEngine.ts)
- Web: chats and projects via /api/chat/sync (apps/web/app/api/chat/sync/route.ts)

**Before you start**

- Signed-in account for sync (Chrome conversation sync and Mobile sync are cloud features)

**Screens and controls**

- Chrome schedule run status labels come from the keys spScheduleRunSucceeded, Failed, TimedOut, Cancelled, AwaitingApproval, Running (apps/extension/src/features/side-panel/schedulesSection.ts:1049-1062); their English text was not opened
- The 'Cancel' button in the Chrome schedule form closes the new-schedule form, it does not cancel a run (apps/extension/_locales/en/messages.json:2326-2328). The control that cancels a run: unknown
- The VS Code follow-up full notice uses message key chatNotice.followUpCapacity (ChatStateManager.ts:4813); its text was not opened

**Journey**

1. Send a message; while it streams, type another
2. The second message is queued by priority and runs when the first ends
3. On another device the chat list pulls changes after a cursor
4. A deleted chat arrives as a tombstone and is removed or marked deleted
5. For a scheduled run, a cancel request is written to a journal and retried with back-off until the run is terminal

**What the person sees and gets**

- Queue-full notice in VS Code (count 20)
- Chrome run status text
- Chat list updated across devices

**Settings**

- none found in the code for queue size; VS Code's 20 is a constant (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:276)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The queue has three priority lanes now, next and later; each lane has a cap of 100 by default, FIFO within a lane, and throws QueueFullError when full (packages/client/client-runtime/src/queue/types.ts:1-9,48-55; packages/client/client-runtime/src/__tests__/../queue/__tests__/messageQueueManager.test.ts:61-73)
- Persisted queue entries leave out priority 'now' (packages/client/client-runtime/src/queue/messageQueueManager.ts initial and persist functions)
- VS Code builds its queue with laneCap 20 and refuses a new send when size reaches 20, with a notice (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:276,1066,4761,4813)
- Chrome's side panel uses the default queue and catches QueueFullError (apps/extension/src/side_panel.ts:8701,8726,8813)
- Mobile stores its queue through a storage adapter (apps/mobile/lib/sendQueue.ts:31); Web code sessions use a default queue (apps/web/features/code/local-session-memory.ts:25)
- applyAgentActivityEvent is imported by Chrome chat-state, Mobile chat store and Web useChatStream (apps/extension/src/features/side-panel/chat-state.ts:3,179; apps/mobile/stores/chat/chatExecutionStore.ts:7; apps/web/lib/hooks/useChatStream.ts:129)
- The sync package exports cursor, conversations, memory, messages, projects, settings and tombstones (packages/client/sync/src/index.ts:1-7)
- Consumers: Chrome conversationSync, Mobile cloudSyncEngine, VS Code account memory, Web artifact sync, Desktop settings sync (apps/extension/src/features/cloud-bridge/conversationSync.ts:9-14; apps/mobile/services/cloudSyncEngine.ts:85-89; apps/extension-vscode/src/memory/accountMemoryStore.ts:5-9; apps/web/features/chat/services/artifact-cloud-sync.ts; apps/desktop/src/services/managedCloudSettingsSync.ts)
- The conversation delta carries starred, archived and deleted_at (packages/contracts/cloud-contracts/src/sync.ts:117-130); Mobile applies starred and skips archived (apps/mobile/services/cloudSyncEngine.ts:120-146)
- Server push and pull exist on one route and return conflicts with the current server row (apps/web/app/api/chat/sync/route.ts:590-597,1020-1021)
- Task states map to board stages; partial becomes done and timed_out becomes failed (packages/contracts/types/src/cross-device.ts:413-431)
- Chrome treats stages done, failed, cancelled and archived as terminal, plus 'cancellation requested' on needs_approval or paused (apps/extension/src/features/background/scheduled-task-cancellation.ts:127-152)
- Cancellation retries back off with an exponent capped at 6 (apps/extension/src/features/background/scheduled-task-cancellation.ts:155-162)

**Incomplete**

- The brief says cap 20; the shared default is 100 per lane and 20 applies only to VS Code (see above). The brief says Chrome and VS Code keep their own sync code; the code shows Chrome and VS Code import the shared sync package for conversations and memory (apps/extension/src/features/cloud-bridge/conversationSync.ts:9-14; apps/extension-vscode/src/memory/accountMemoryStore.ts:5-9). How much sync logic each still keeps privately was not measured
- The brief says Chrome has its own chat state reducer; chat-state.ts imports the shared applyAgentActivityEvent (apps/extension/src/features/side-panel/chat-state.ts:3,179), though it also holds Chrome-specific state
- The brief says VS Code local-runtime tool progress is posted straight to the webview, not through the reducer (doc: area-briefs/101-shared-package-boundaries.md S101.13); not opened
- The CLI keeps its own state and sync logic and is checked against golden JSON (apps/cli/src/cloud/contract_fixtures.rs:44-95)
- Chrome's schedulesSection.ts switches on a separate schedule-run vocabulary: success, failed, timeout, cancelled, awaiting_approval, running (apps/extension/src/features/side-panel/schedulesSection.ts:1049-1062)

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Cancel-queued-message control labels for each app were not opened

## 4. Required behaviour

**Established requirements**

- Conversation state transitions (activity, queue, message status) use one shared reducer on every client. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.13)
- Sync (cursors, push and pull, tombstones, conflicts) runs through one shared implementation on every synced surface. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.14)
- Agent runs and tasks share one model and one lifecycle vocabulary across server and clients. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.24)
- Mobile receives starred and drops archived chats, tested by a sync test. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.14)
- Every synced object uses one deletion vocabulary. (source: packages/client/sync/src/tombstones.ts:1-6)
- A full queue lane refuses the item with QueueFullError. (source: packages/client/client-runtime/src/queue/types.ts:48-55)

**Acceptance criteria**

1. Enqueue 21 follow-ups in VS Code: the 21st is refused with a notice, none dropped silently
2. Enqueued items on the same priority run first in first out
3. A deleted conversation on one device is marked deleted or removed on another after the next pull
4. A starred chat shows a star on Mobile; an archived chat does not show
5. A scheduled run in partial or timed_out state counts as terminal for cancellation
6. Cancellation of a run that cannot be reached retries with back-off
7. A push with a stale baseVersion returns the current server row as a conflict (apps/web/app/api/chat/sync/route.ts:590-597)

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The cap should be stated per app; a user cannot rely on 20 everywhere [inferred]
- A full queue should keep the typed text in the box [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Expose one queue size constant from the shared package and let VS Code read it
- [proposed] Merge the schedule-run vocabulary with the shared task states
- [proposed] Route VS Code local tool progress through the reducer

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Message queue manager | `packages/client/client-runtime/src/queue/messageQueueManager.ts` | Priority queue with optional storage |
| schema | Queue types | `packages/client/client-runtime/src/queue/types.ts` | Priorities, LANE_CAP 100, QueueFullError |
| service | Agent activity reducer | `packages/client/client-runtime/src/agentActivity.ts` | applyAgentActivityEvent and activity types |
| service | Sync conversations | `packages/client/sync/src/conversations.ts` | Apply deltas, build push items |
| service | Sync cursors | `packages/client/sync/src/cursor.ts` | selectNextCursor |
| service | Sync tombstones | `packages/client/sync/src/tombstones.ts` | applySyncTombstone |
| schema | Sync wire schemas | `packages/contracts/cloud-contracts/src/sync.ts` | Deltas, push and pull bodies |
| endpoint | Chat sync route | `apps/web/app/api/chat/sync/route.ts` | GET pull and POST push with conflicts |
| schema | Task board stages | `packages/contracts/types/src/cross-device.ts` | AGENT_TASK_BOARD_STAGE_BY_STATE |
| service | Chrome scheduled cancellation | `apps/extension/src/features/background/scheduled-task-cancellation.ts` | Terminal stages and retry back-off |
| service | Chrome chat state | `apps/extension/src/features/side-panel/chat-state.ts` | Side panel state using the shared reducer |
| service | Chrome conversation sync | `apps/extension/src/features/cloud-bridge/conversationSync.ts` | Uses shared sync deltas and cursors |
| component | Chrome schedules section | `apps/extension/src/features/side-panel/schedulesSection.ts` | Schedule list and run status labels |
| service | VS Code chat state manager | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Follow-up queue with cap 20 |
| service | Mobile send queue | `apps/mobile/lib/sendQueue.ts` | Persisted shared queue |
| service | Mobile cloud sync engine | `apps/mobile/services/cloudSyncEngine.ts` | Applies conversation deltas incl. starred and archived |
| store | Mobile chat execution store | `apps/mobile/stores/chat/chatExecutionStore.ts` | Uses applyAgentActivityEvent |
| hook | Web chat stream hook | `apps/web/lib/hooks/useChatStream.ts` | Uses the shared activity reducer |
| service | CLI cloud sync | `apps/cli/src/cloud/chat.rs` | Rust sync copy, tested against golden JSON |
| table | user_projects | `apps/web/app/api/chat/sync/route.ts` | Checked for project ownership on conversation push |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person sends a follow-up; the client enqueues it with a priority | device | packages/client/client-runtime/src/queue/messageQueueManager.ts; apps/extension/src/side_panel.ts:8701 |
| A client pushes local changes with baseVersion; the server applies or returns conflicts | our servers | packages/client/sync/src/conversations.ts:100-127; apps/web/app/api/chat/sync/route.ts:590-597 |
| Another device pulls deltas after its cursor and applies them, using tombstones for deletions | device and our servers | packages/client/sync/src/conversations.ts:46; packages/client/sync/src/tombstones.ts:22 |
| Stream events update the activity state with the shared reducer | device | apps/extension/src/features/side-panel/chat-state.ts:179 |
| Chrome writes a cancel request to a journal and calls the managed run cancel until the run is terminal | device and our servers | apps/extension/src/features/background/scheduled-task-cancellation.ts:164-175 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Queued follow-ups | memory; Mobile persists through a storage adapter (apps/mobile/lib/sendQueue.ts:31) | no | entries with priority 'now' are not persisted |
| Conversations, messages, memory, projects | server database (table:user_projects named in the sync route) and device stores | yes, by cursor | deleted rows carry deleted_at and stay as tombstones (packages/contracts/cloud-contracts/src/sync.ts:117-130) |
| Scheduled run cancellation journal | Chrome extension storage | no | journal removed after settle (dependency removeJournal, scheduled-task-cancellation.ts:100-113) |

**Models and providers.** Sync rows carry model and provider as nullable strings (packages/contracts/cloud-contracts/src/sync.ts:117-140). No file opened chooses a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sync requires a signed-in account; queue and reducer work without one [inferred from local-session-memory.ts:25 using the queue in memory]. |
| Permissions | Conversation push checks that a referenced project belongs to the user and organization (apps/web/app/api/chat/sync/route.ts:80-98). |
| Subscription | none found in the code for the queue or reducer. Sync availability by plan: see SYS-sync-and-continuity. |
| Limits and metering | Queue cap 100 per lane by default, 20 in VS Code; sync batch rules are in sync.ts (duplicate id in a batch is refused, sync.ts:100-104). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Web code sessions keep a local in-memory queue (apps/web/features/code/local-session-memory.ts:25). The CLI docs say no silent global chat sync for CLI and VS Code (doc: docs/product/commercial.md:28). Other Local mode sync behaviour: none found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Queue full | QueueFullError; VS Code shows a notice; Chrome catches the error | packages/client/client-runtime/src/queue/types.ts:48-55; apps/extension/src/side_panel.ts:8726,8813; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4813 |
| Queue cleared or item cancelled | Removed; abort handlers detached | packages/client/client-runtime/src/queue/messageQueueManager.ts:detachAbort |
| Sync conflict | Server returns the current row | apps/web/app/api/chat/sync/route.ts:590-597 |
| Duplicate id in one batch | Refused | packages/contracts/cloud-contracts/src/sync.ts:96-104 |
| Store cannot tombstone | Falls back to remove | packages/client/sync/src/tombstones.ts:22-24 |
| Archived chat on Mobile | Not stored or shown | apps/mobile/services/cloudSyncEngine.ts:128,146 |
| Scheduled run partial or timed out | Terminal for cancellation (mapped to done or failed) | packages/contracts/types/src/cross-device.ts:425-427; apps/extension/src/features/background/scheduled-task-cancellation.ts:127-146 |
| Cancellation unreachable | Retry later with capped exponential back-off | apps/extension/src/features/background/scheduled-task-cancellation.ts:155-162 |
| Offline | not handled in the code opened for the queue; client-runtime has offline-queue and offline-sync folders not opened | packages/client/client-runtime/src/offline-queue |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/client/client-runtime/src/queue/__tests__/messageQueueManager.test.ts`: FIFO, priority order, peek, dequeueAll and more
- `packages/client/sync/src/__tests__/conversations.test.ts`: Conversation delta apply and push
- `packages/client/sync/src/__tests__/deletion-durability.test.ts`: Deletion survives sync
- `packages/client/sync/src/__tests__/tombstone-coverage.test.ts`: Tombstone vocabulary across synced objects
- `packages/client/sync/src/__tests__/cursor.test.ts`: Cursor comparison
- `apps/mobile/__tests__/cloud-sync-engine.test.ts`: Mobile sync engine
- `apps/extension/__tests__/side-panel-chat-state.test.ts`: Chrome chat state
- `apps/extension/__tests__/scheduled-task-cancellation.test.ts`: Chrome scheduled cancellation
- `packages/client/client-runtime/src/__tests__/agentActivity.test.ts`: Activity reducer

**Test scenarios**

- **Queue limit in VS Code**
  1. Start a long answer
  2. Queue 21 follow-ups
  - Expected: The 21st is refused with the capacity notice
- **Cross-device delete**
  1. Delete a chat on Web
  2. Open Mobile and pull
  - Expected: The chat is gone on Mobile and does not return on the next push
- **Star and archive**
  1. Star one chat and archive another on Web
  2. Sync Mobile
  - Expected: Star shows on the first; the second is absent
- **Partial scheduled run**
  1. Cancel a scheduled run whose state is partial
  - Expected: Cancellation settles at once as terminal
- **Conflict**
  1. Edit a title on two devices from the same version
  2. Push both
  - Expected: The second push receives the current row as a conflict

**Where to look when it fails**

- QueueFullError text 'message queue lane ... is full (cap=N)'
- Sync response conflicts arrays
- Chrome journal fields cancellationPending, cancellationAttempts

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Queue size differs by app (20 in VS Code, 100 default elsewhere)** Affects: VS Code, Chrome, Mobile, Web. Evidence: packages/client/client-runtime/src/queue/types.ts:9; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:276. Work needed: Choose one stated cap or document the difference
- **CLI keeps its own state and sync logic** Affects: CLI. Evidence: apps/cli/src/cloud/contract_fixtures.rs:44-95. Work needed: Extend golden coverage or share logic
- **VS Code local-runtime tool progress bypasses the reducer (per brief)** Affects: VS Code. Evidence: (doc: area-briefs/101-shared-package-boundaries.md S101.13). Work needed: Add a runtime-event adapter
- **Chrome schedule-run vocabulary differs from task states** Affects: Chrome. Evidence: apps/extension/src/features/side-panel/schedulesSection.ts:1049-1062. Work needed: Map schedule-run status to the shared stages
- **Chrome and VS Code private sync code extent unknown** Affects: Chrome, VS Code. Evidence: imports at conversationSync.ts:9-14. Work needed: Measure what remains private

**Depends on**

- SYS-sync-and-continuity
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- F101-01
- F101-04
- surface:chrome
- surface:mobile
- surface:vscode
- file:packages/client/sync/src/index.ts

## Unknown

- Visible text of the VS Code queue-full notice and Chrome schedule run labels
- Which control cancels a run in the Chrome schedules list
- Whether VS Code tool progress still bypasses the reducer
- Offline queue and offline sync behaviour (folders not opened)
- Sync availability per plan
- The server table that stores conversations
- Whether tests pass today; nothing was run
