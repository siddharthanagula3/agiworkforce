---
id: "F071-10"
type: "feature"
title: "Keeping your place after the app closes"
aliases: ["Conversation restoration", "Process death recovery", "In-flight turn recovery", "Waiting for the answer", "Composer draft", "Interrupted reply"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.19"]
depends_on: ["surface:mobile", "mode:cloud", "mode:local", "SYS-sync-and-continuity", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "store:mmkv-encrypted", "api:GET /api/llm/v1/chat/completions/runs", "F071-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-10 Keeping your place after the app closes

After the phone closes AGI Mobile, chats and unsent drafts are still stored on the device. If a Cloud reply was still being written, the app asks the server whether it finished, restores the answer, or says it stopped. The code does not reopen the last chat on its own after a cold start.

Area: [71. Mobile application](README.md). Requirement items: [S71.19](../../10-requirements/capabilities/071-mobile-application.md#s7119).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps chat messages and the unsent draft in encrypted phone storage, marks a reply that was streaming as stopped when the store reloads, and for Cloud chats asks the server what happened to the turn (apps/mobile/stores/chat/chatMessageStore.ts:411-417, 1729-1748; apps/mobile/src/features/chat/inFlightTurnRecovery.ts).

**Why it exists.** The brief: after the OS kills the app, relaunching returns the user to their conversation with messages, draft and any in-flight reply (doc: knowledge-base/data/area-briefs/071-mobile-application.md S71.19).

**Who uses it.** All Mobile users, in particular those who switch apps while a long Cloud answer is running.

**Problems it solves**

- No lost typing.
- No chat lost to an OS kill.
- No second paid answer for a turn the server is still working on.

**Use cases**

- Type a long message, switch apps, come back after the OS closed AGI: draft is there.
- Start a Cloud answer, lock the phone for a minute: the chat shows the finished answer or 'Waiting for the answer'.
- A server run dies: the chat says the turn stopped.

## 2. User experience

**Where to find it**

- Mobile only. Automatic; no setting. Recovery happens inside an open chat screen (apps/mobile/app/(app)/chat/[id].tsx:469).
- Draft appears in the chat composer (apps/mobile/src/features/chat/components/ChatInput.tsx:462, 752).

**Before you start**

- Cloud recovery needs a Cloud chat and a network (apps/mobile/src/features/chat/inFlightTurnRecovery.ts:65-70, 176-185).
- Storage must open; if the encrypted store cannot open, the root layout reports it (apps/mobile/app/_layout.tsx:580-600).

**Screens and controls**

- Chat thread and composer; message shows a stopped state when interrupted; waiting text shown as an error line when you try to continue (apps/mobile/stores/chat/chatExecutionStore.ts:5103).

**Journey**

1. Use a chat; the app saves messages and draft as you go.
2. The OS closes the app.
3. Open AGI again; the app starts on the chat tab (apps/mobile/app/index.tsx:9-25; apps/mobile/app/(app)/index.tsx:4).
4. Open the chat from the list; messages and draft load from storage.
5. If it is a Cloud chat with an unfinished turn, the app asks the server and shows the answer, a waiting state, or the stopped message.

**What the person sees and gets**

- 'Waiting for the answer. It appears here when it is ready.' (apps/mobile/src/features/chat/inFlightTurnRecovery.ts:20-21).
- 'This turn stopped running on the server and will not finish. Send it again to retry.' (inFlightTurnRecovery.ts:19-20).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Local chats persist to 'chat-message-store-local' and Cloud chats to 'chat-message-store-cloud' in the encrypted key-value store (apps/mobile/stores/chat/chatMessageStore.ts:1729; apps/mobile/stores/chat/chatCloudMessageStore.ts:313; apps/mobile/lib/mmkv.ts:61).
- Stores rehydrate after encryption opens (apps/mobile/stores/chat/chatMessageStore.ts:2075).
- A streaming assistant message is saved as stopped with finishReason 'stopped' in the local store (apps/mobile/stores/chat/chatMessageStore.ts:411-417, 1745); the cloud store drops streaming messages from the saved copy (apps/mobile/stores/chat/chatCloudMessageStore.ts:351-352).
- Cloud store keeps up to 200 chats and 100 messages each, plus unsynced ones (chatCloudMessageStore.ts:325-326).
- Drafts with attachments are saved under the 'composer-draft:' key prefix (apps/mobile/src/features/chat/draftStore.ts:5, 186).
- In-flight recovery: asks the server for the conversation's runs, follows a recorded run, restores a finished answer, or decides running, waiting or stalled (apps/mobile/src/features/chat/inFlightTurnRecovery.ts:65-300).
- Stall deadline 150 seconds and re-check every 5 seconds; re-asks when the app returns to the front or the network returns (inFlightTurnRecovery.ts:17-18, 186-200).
- Continuing a Cloud answer first asks the server and refuses with the waiting message when the turn still runs (apps/mobile/stores/chat/chatExecutionStore.ts:5095-5105).

**Incomplete**

- No code was found that reopens the last open chat after a cold start; the root route goes to the chat tab (apps/mobile/app/index.tsx; apps/mobile/app/(app)/index.tsx:4). The saved current conversation id is cleared when the chat screen unmounts (apps/mobile/app/(app)/chat/[id].tsx:571-577). The brief's 'returns the user to their conversation' is therefore not established.
- Only Cloud chats are checked against the server; an interrupted Local turn has no server and stays stopped (apps/mobile/src/features/chat/inFlightTurnRecovery.ts:65-70).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Other apps: n/a. Background upload recovery is a separate item and not applicable (doc: area brief S71.18).

## 4. Required behaviour

**Established requirements**

- After the OS kills the app, relaunching returns the user to their conversation with messages, draft and any in-flight reply. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.19)
- The phone does not keep writing an interrupted reply itself; it checks the server and shows what the server has. (source: apps/mobile/src/features/chat/inFlightTurnRecovery.ts (code rank 2))
- Local, own key and Cloud are separate; nothing silently moves a Local chat to Cloud. (source: AGENTS.md section 6)

**Acceptance criteria**

1. After killing the app, a previously sent message and its chat are present.
2. An unsent draft is present in the same chat's composer.
3. A Cloud reply that finished on the server appears without resending.
4. A reply still running shows the waiting state, and resending is refused with the waiting message.
5. A turn with no sign of life for 150 seconds shows the stopped message.
6. A Local reply interrupted by the kill is marked stopped, not left spinning.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Returning to the same chat needs a stored last-chat route; none exists, so the criterion is read as 'the chat is intact when opened' [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store the last open chat id and open it on cold start, or change the brief wording.
- [proposed] Add a visible 'Reply was interrupted' note for Local chats with a Retry.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | Local message store | `apps/mobile/stores/chat/chatMessageStore.ts` | Persists local chats; stoppedByAppExit. |
| store | Cloud message store | `apps/mobile/stores/chat/chatCloudMessageStore.ts` | Persists cloud chats with caps. |
| store | Draft store | `apps/mobile/src/features/chat/draftStore.ts` | Saves and restores unsent drafts. |
| hook | useInFlightTurnRecovery | `apps/mobile/src/features/chat/inFlightTurnRecovery.ts` | Asks the server about the turn and reports a verdict. |
| service | Finished run answer | `apps/mobile/src/features/chat/finishedRunAnswer.ts` | Finds a run for an operation and restores its answer. |
| store | In-flight turn record | `apps/mobile/src/features/chat/inFlightTurnRun.ts` | Remembers the run id of a sent turn. |
| service | Agent activity helpers | `apps/mobile/src/features/chat/utils/agentActivity.ts` | hasUnfinishedRun and stopped finish reasons. |
| screen | Chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | Uses the recovery hook and loads history. |
| component | ChatInput | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Reads and writes drafts. |
| service | MMKV encryption | `apps/mobile/lib/mmkv.ts` | Encrypted storage, rehydrateWhenMmkvReady. |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Blocks continuing while a run is live (line 5095). |
| screen | Root routing | `apps/mobile/app/index.tsx` | Cold start redirect to age gate, onboarding or app. |
| screen | App index | `apps/mobile/app/(app)/index.tsx` | Redirects to the chat tab. |
| endpoint | Run list by conversation | `apps/web/app/api/llm/v1/chat/completions/runs/route.ts` | Queried with conversationId (inFlightTurnRecovery.ts:104). |
| test | InFlightTurnRecovery test | `apps/mobile/__tests__/InFlightTurnRecovery.test.tsx` | Covers the hook. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Messages and drafts are written to encrypted storage as the person uses the app. | device | apps/mobile/stores/chat/chatMessageStore.ts:1729-1748; apps/mobile/src/features/chat/draftStore.ts:186 |
| On relaunch the storage key is opened, then stores rehydrate; streaming messages are settled as stopped. | device | apps/mobile/app/_layout.tsx:580-600; apps/mobile/stores/chat/chatMessageStore.ts:411-417 |
| Opening a Cloud chat whose last row is an unanswered question or an unfinished run starts the check. | device | apps/mobile/src/features/chat/inFlightTurnRecovery.ts:65-72 |
| The phone asks GET runs?conversationId=<id> and, with a recorded run id, reads the finished answer. | device and our servers | apps/mobile/src/features/chat/inFlightTurnRecovery.ts:100-125, 205-260 |
| Finished: answer restored, or history reloaded. Running: re-check every 5 seconds. No life for 150 seconds: stalled message. | device | inFlightTurnRecovery.ts:17-18, 85-95, 262-300 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Local chat messages | Encrypted key-value store, key chat-message-store-local | No | Until chat deletion or the wipe |
| Cloud chat messages cache | Encrypted key-value store, key chat-message-store-cloud | Yes, with server history | Capped at 200 chats and 100 messages each; cleared by clearCloudData (chatCloudMessageStore.ts:301-306) |
| Draft text and attachments | Key-value store, key 'composer-draft:<key>' scoped by local or cloud owner | No | Removed when empty or sent (draftStore.ts:170-200) |
| In-flight turn run record | Phone store inFlightTurnRun | No | Forgotten after answered or ended |

**Models and providers.** No model is called to recover. The server run continues with whatever model it used; the phone only reads the result. Local turns use the on-device runtime and cannot be resumed after a kill.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local chats need none. Cloud recovery needs the signed-in account that owns the chat; drafts are scoped by owner (apps/mobile/src/features/chat/draftStore.ts:8-12). |
| Permissions | none found in the code. |
| Subscription | none found in the code for restoration itself. |
| Limits and metering | 150 second stall deadline, 5 second re-check (inFlightTurnRecovery.ts:17-18); cloud cache caps 200 and 100 (chatCloudMessageStore.ts:325-326). Recovery avoids a second paid answer by waiting on recent unanswered questions (inFlightTurnRecovery.ts:127-146). |
| Feature flags | none found in the code. |
| Model compatibility | Applies to every model; Local turns settle as stopped. |
| Provider restrictions | none found in the code. |
| Local mode | Messages and drafts persist on the device. No server check; an interrupted reply is marked stopped. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Process killed mid-stream (local) | Assistant row saved as stopped. | apps/mobile/stores/chat/chatMessageStore.ts:411-417, 1745 |
| Process killed mid-stream (cloud) | Streaming rows are not saved; server check restores or reports. | apps/mobile/stores/chat/chatCloudMessageStore.ts:351-352 |
| Offline on return | Check runs again when the network returns. | apps/mobile/src/features/chat/inFlightTurnRecovery.ts:186-190 |
| App back to front | Re-asks the server. | inFlightTurnRecovery.ts:180-184 |
| Server unreachable | Verdict unknown; keeps asking only if a run was seen running. | inFlightTurnRecovery.ts:276-282 |
| Run answered elsewhere | History reloads. | inFlightTurnRecovery.ts:244-250 |
| Run paused or awaiting input | Counted alive no matter how old. | inFlightTurnRecovery.ts:63, 75-79 |
| Storage cannot open | unavailable status in the root layout; not examined further | apps/mobile/app/_layout.tsx:580-600 |
| Cold start | Opens the chat tab, not the last chat | apps/mobile/app/(app)/index.tsx:4 |
| Accessibility | not handled in the code beyond ordinary message text | apps/mobile/src/features/chat/inFlightTurnRecovery.ts (no accessibility announcement found) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/InFlightTurnRecovery.test.tsx`: Recovery hook verdicts
- `apps/mobile/__tests__/InFlightTurnRunRecord.test.ts`: Recorded run ids
- `apps/mobile/__tests__/FinishedRunAnswer.test.tsx`: Restoring a finished answer
- `apps/mobile/__tests__/ChatReopenSettled.test.tsx`: Reopening a settled chat
- `apps/mobile/__tests__/ChatThreadFinishedRunAnswer.test.tsx`: Finished answer in the thread
- `apps/mobile/__tests__/draft-store.test.ts`: Drafts
- `apps/mobile/__tests__/local-chats-persist-reload.test.ts`: Local chats survive reload
- `apps/mobile/__tests__/chat-local-persistence-durability.test.ts`: Local persistence
- `apps/mobile/__tests__/mmkv-restore-recovery.test.ts`: Storage restore
- `apps/mobile/__tests__/cloud-continue-answer.test.ts`: Continue blocked while running

**Test scenarios**

- **Draft survives kill**
  1. Type text in a chat, do not send.
  2. Kill the app, reopen, open the chat.
  - Expected: The same text is in the composer.
- **Local reply interrupted**
  1. Start a local reply, kill the app mid-stream.
  2. Reopen the chat.
  - Expected: The partial reply shows as stopped.
- **Cloud reply finishes**
  1. Start a long Cloud answer, kill the app.
  2. Wait, reopen the chat.
  - Expected: Answer appears, or the waiting message until ready.
- **Stalled run**
  1. Use a test run that stops reporting for over 150 seconds.
  2. Open the chat.
  - Expected: Stopped-on-server message.
- **Cold start destination**
  1. Open a chat, kill the app, relaunch.
  - Expected: Observe whether the chat tab or the old chat opens; code suggests the chat tab.

**Where to look when it fails**

- Warning '[chatMessageStore] Hydration failed:' and '[chatCloudMessageStore] Hydration failed:'.
- Warning '[mmkv] ...' lines on storage open.
- Server runs listed by conversationId.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **No automatic return to the last open chat after a cold start.** Affects: Mobile users. Evidence: apps/mobile/app/(app)/index.tsx:4; apps/mobile/app/(app)/chat/[id].tsx:571-577. Work needed: Persist and restore the last route, or update the brief.
- **The brief's code reference (MessageBubble.tsx:1110) points to an image attachment block, not to restoration.** Affects: Documentation. Evidence: apps/mobile/src/features/chat/components/MessageBubble.tsx:1100-1125. Work needed: Correct the brief reference.
- **Local interrupted replies cannot be resumed.** Affects: Local mode users. Evidence: apps/mobile/stores/chat/chatMessageStore.ts:411-417. Work needed: Product decision on a Retry affordance.

**Depends on**

- surface:mobile
- mode:cloud
- mode:local
- SYS-sync-and-continuity
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- store:mmkv-encrypted
- api:GET /api/llm/v1/chat/completions/runs
- F071-07

## Unknown

- Whether the OS ever restores the navigation state itself.
- How the server decides a run is stale (staleForMs source).
- Cloud chat history retention.
- Behaviour of drafts when the chat id key changes (draftKey source in ChatInput not traced).
- Tests were not read line by line.
