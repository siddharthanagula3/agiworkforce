---
id: "DOC-70-qa-defects-root-causes-cloud-code-first-turn"
type: "root-cause"
title: "CLOUD-CODE-FIRST-TURN: the first cloud task turn dies, and nothing shows live"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# CLOUD-CODE-FIRST-TURN: the first cloud task turn dies, and nothing shows live

Basic W-18 (subscribed, Ultra). Read-only design. Paths are under `apps/web` of origin/main
(`~/.cache/agi-audit/worktrees/gap-read-main`) unless marked. "Live" means the other agent's checkout
`~/Desktop/agiworkforce` (uncommitted).

## 1. What the person sees today / what they should see

Today (row W-18 subscribed, screens 05, 16, server log):

- Types a task on /code and presses Start the task. The session page opens with only their message. No spinner, no Stop,
  sidebar says Open. Nothing for 20s or more.
- After a reload: "The connection to this turn dropped before it finished, so it stopped where it was." and "Cancelled".
  Run this task again then works.
- On a long rerun only "Ns Working" shows. The tool steps appear after the turn ends or after Stop.
- After Stop, the transcript adds "The model failed to produce a response. Try again, or choose Auto to use another
  available model." under the finished steps, next to "Cancelled" (screen 16 shows exactly this, already on Auto).

They should see:

- Press Start: the session page opens at once with the message, a spinner row and a Stop button, sidebar "Running".
- Each tool step appears as it finishes (within a few seconds), then the answer. Same as Claude Code on the web.
- Reload, close the tab, or open another session mid-turn: the turn keeps going. Coming back shows the steps so far,
  still running, or the finished result. Never "connection dropped" for something the person did not stop.
- Stop shows only "You stopped this turn. Nothing further was run." and the steps already done.
- A plan without Code gets the existing Upgrade notice (unchanged, `availability.planEntitled`); no error is involved.

## 2. Causes

1. First turn cancelled about 1s after start, page blank. **Product defect.**
   - `createSession` calls `router.push(codeSessionPath(id))` (`features/code/CloudCodePage.tsx:873`). The submit handler
     then `await`s `startTurn` (`:1106`, POST at `:785`). /code and /code/[sessionId] are separate page files
     (`app/code/page.tsx`, `app/code/[sessionId]/page.tsx`), and `OwnedCloudCodePage` is keyed by sessionId
     (`CloudCodePage.tsx:217-218`), so the page remounts.
   - Unmount aborts the lifetime and retires every pending request
     (`features/code/hooks/use-cloud-code-authority.ts:14-21`); the fetch signal follows
     (`lib/identity/request-authority.ts:70-72`). The browser drops the POST.
   - The route hands `request.signal` to the turn (`app/api/code/sessions/[sessionId]/agent/route.ts:175`).
     `withTurnDeadline` copies that abort onto the loop signal (`lib/services/cloud-code-agent-service.ts:139-143`), the
     loop returns `cancelled` with 0 steps, and the row text is "connection dropped" (`:570-572`).
   - Log, session 8dad138a: POST /api/code/sessions answers at 1795552947708 (server.log:42890); two fresh page mounts'
     GETs at 947772-947796; sandbox provisioned 948185, paused 948768; "agent turn finished stopReason=cancelled
     steps=0" at 948787 (server.log:42905); POST /agent took 1074 ms (:42906). No `/agent/cancel` before it. The rerun
     on the existing session never navigates and finishes `done`, 5 steps (server.log:43070).
   - Not caused by the test machine: no provider, sandbox or GitHub error appears before the cancel.
   - The same disconnect-means-cancel rule also kills a turn on reload, tab close or phone sleep. Navigation is only the
     case that happens every time. Mobile and VS Code callers of `startAgentTurn` share it
     (`packages/contracts/cloud-contracts/src/managed-cloud-code-client.ts:480`).
2. Blank page and no live steps. **Product defect.**
   - The route answers once after the whole turn (`agent/route.ts:166-179`). The page fills the transcript only when the
     POST returns (`CloudCodePage.tsx:796`, `applyTurn`) and never re-reads the session on origin/main.
   - The server already writes each step as it finishes (`lib/services/cloud-code-agent-service.ts:770`, no wrapping
     transaction) and the session read returns running turns' steps (`lib/services/cloud-code-session-service.ts:491-520`
     joins on the turn id, not its state). `buildCodeTranscript` already draws steps for a turn with no stop reason
     (`packages/contracts/cloud-contracts/src/cloud-code-transcript.ts:73-76`; the reply is skipped at `:77`).
   - Log 43413-43421 shows 14 steps written while the 18.4 s POST was still open.
3. "The model failed to produce a response" after Stop. **Product defect.**
   - Stop flips `cancelled` through the 2.5 s poll (`cloud-code-agent-service.ts:154-170`), which aborts the loop signal.
     The aborted provider stream reports "Request was aborted." as an error chunk, which `drainAssistantTurn` stores in
     `drained.error` instead of throwing (`lib/services/cloud-code-agent-loop.ts:279-281`). Only the thrown branch checks
     `signal.aborted` (`:499-501`); the `drained.error` branch returns `stopReason: 'error'` with a provider message
     (`:519-527`).
   - The service then flips the reason to `cancelled` (`cloud-code-agent-service.ts:844-848`) but keeps `errorMessage`,
     and `terminalErrorMessage` prefers it over "You stopped this turn" (`:557-561`). The copy maps to the generic
     provider-error text (`upstream-error-copy.ts:546-549`). Log 43415: "Request was aborted.", step 14, 1.9 s after the
     cancel 200 at 43413.
   - Why the "choose Auto" variant appears although Auto was selected: the session model is an explicit id
     (`(model name)`, log 43415). How the page turns Auto into that id was not traced; the fix below removes the
     message for this case, so it is not needed.
4. No repository list, so no pull request. **Test-machine limit.** No GitHub App (log: "GitHub connector linking is
   disabled: missing GITHUB_APP_ID..."; picker says so honestly, public URLs still work). Not tested here: the PR path.
   Offline "Run this task again" gives no feedback, and the 390 px badge reads "Isola...": **product defects, not
   traced**, separate from this fix.
5. Provider or model limit: none. Sandbox, provider and test run worked on the rerun.

## 3. Change

One mechanism: the turn belongs to the server, the page only watches the stored turn. Three small server edits, one
client delta, one pure helper.

### 3.1 `lib/services/cloud-code-turn-transport.ts` (server, untouched by either checkout)

Ships only together with 3.3 (see Review response, blocker 2). Alone it makes the page worse.

The single entry decides the transport. Make the inline turn outlive the request; keep the request signal only for the
durable wait, which should stop polling when the client leaves.

```ts
return executePersistedAgentTurn({
  ...,
  signal: new AbortController().signal,
});
```

Pass the detached signal only into `executePersistedAgentTurn`; `prepareCloudCodeAgentTurn(input)` and the durable
`awaitDurableTurn` keep `input.signal`, so a durable wait still stops polling when the client leaves. Stop (2.5 s poll,
`cloud-code-agent-service.ts:154-170`), the time budget (`:139-143`) and the step bound still end the turn. After this
change no in-repo caller passes a live signal into the loop, so the "connection dropped" branch (`:570-572`) is dead copy
(AGENTS.md section 9): delete it with its service test at `lib/services/__tests__/cloud-code-agent-service.test.ts:501`,
unless the implementer finds a caller that still does. Approval resume has the same pattern
(`app/api/code/sessions/[sessionId]/agent/approvals/route.ts:118` passes `request.signal` into
`decideCloudCodeAgentApproval`); apply the same detached signal at the call in the approval service
(`lib/services/cloud-code-agent-approval-service.ts:376` uses `input.signal`). Not read in detail: verify the resume path
needs no other change.

Why not leave it: without this, a reload or closed tab cancels the turn and "survives a reload" cannot hold.

Unknown, must be checked on a preview deploy before relying on it: whether the platform keeps a Node route handler
running after the client disconnects until `maxDuration` (800). Locally it does (server.log:42897-42905 finished the turn
after the page left). If it does not, wrap the inline call in `after()` (already used at `lib/server/free-quota-turn.ts:5`)
or turn on `AGI_DURABLE_CODE_TURNS` (see Owner).

### 3.2 `lib/services/cloud-code-agent-loop.ts` (server, untouched)

At the `drained.error` branch (`:519`), treat an abort the same as the thrown branch:

```ts
if (drained.error) {
  if (input.signal.aborted || input.isCancelled?.()) {
    return { stopReason: 'cancelled', stepsUsed, finalMessage, messages, usage };
  }
  return { stopReason: 'error', ... };
}
```

This also stops a budget abort being reported as a provider error. The service already turns a budget `cancelled` into
`timeout` (`cloud-code-agent-service.ts:849-852`). In the service at `:844-848`, when `deadline.cancelled()` flips the
reason to `cancelled`, drop `errorMessage` so `terminalErrorMessage` reaches "You stopped this turn" (`:559-561`).

### 3.3 `features/code/CloudCodePage.tsx` (client, OVERLAPS the live checkout; write it as a delta on its shape)

Live already has: `observedTurn`, a 4 s `read()` poll that follows a stored turn with `stopReason === null` (live
`CloudCodePage.tsx:690-763`), the module store `features/code/services/cloud-code-background-turns.ts`, and
`backgroundApi` in `use-cloud-code-authority.ts` (not retired on unmount). Live still sends the normal first turn through
`api` after `router.push` (live `:1079`, `:1464`), so the first turn still depends on 3.1. Three deltas:

1. Start the first turn of a just-created session with the background runner, so the POST is not tied to the page that
   is about to unmount and the new page knows a turn is pending from its first render (this closes the race where the
   new page's first GET runs before the turn row exists):
   ```ts
   const running = runCloudCodeBackgroundTurn(ready.id, () => requestTurn(backgroundApi, ready, text, mode));
   ```
   Reuse `startBackgroundTurn`'s body without its "submitted" toast and without the "open" action; the person is already
   on the page.
2. Bound the spinner by age so a row stranded by a platform kill (`lib/services/cloud-code-turn-budget.ts` says it leaves
   `state = 'running'`, and no reaper was found: unknown) cannot show Working forever. Measure from the turn's last
   update, not its creation: approval resume keeps `created_at` and sets `updated_at = now()`
   (`lib/services/cloud-code-agent-approval-service.ts:320-323`) and runs with a fresh budget. The record has no
   `updatedAt` today (`packages/contracts/types/src/cloud-code.ts:288-302`), so add it:
   - contract: `updatedAt: string` on `CloudCodeAgentTurnRecord`;
   - `lib/services/cloud-code-session-service.ts`: add `updated_at` to `TURN_COLUMNS` (`:488-489`), to the turn row type
     and to the mapping in `attachTurnSteps` (`:535`). The column exists with `default now()`
     (`db/neon/0082_cloud_code_agent_turns.sql:58`); no migration;
   - `CodeTurnRecord` (`cloud-code-transcript.ts:18-37`) carries it.
   ```ts
   export function isCloudCodeTurnLive(turn: { stopReason: unknown; updatedAt: string }, now: number): boolean {
     return turn.stopReason === null && now - Date.parse(turn.updatedAt) < CLOUD_CODE_AGENT_TURN_REQUEST_LIMIT_MS;
   }
   ```
   (`CLOUD_CODE_AGENT_TURN_REQUEST_LIMIT_MS` is the shared 800 000 at `packages/contracts/types/src/cloud-code.ts:263`.)
   `updated_at` is written at insert, cancel (`cloud-code-agent-service.ts:405`), approval resume and finish, not per
   step. A healthy segment never outlives its budget: `CLOUD_CODE_TURN_BUDGET_MS` is 13 min = 780 s
   (`lib/deadline-policy.ts:42`), under 800 s, and an approval wait is `awaiting_approval`, which maps to a non-null
   stop reason (`cloud-code-session-service.ts:476-481`), so it is never "live". A stale null-reason row then draws as a
   stopped task with the existing retry button. The live checkout does not touch these files
   (`git diff HEAD --stat` on the session service and transcript is empty; the contract file only gains two unrelated
   session-ready constants).
3. Re-read approvals when a followed turn ends: live's approvals effect depends on `selectedBackgroundTurn` but not on
   `activeStoredTurn` (live `:785`), so a first turn that ends `awaiting_approval` shows its card only after a reload.
   Add `activeStoredTurn !== null` to that effect's dependencies.
4. If the live checkout's poll does not land first, the same change must carry its own: on origin/main the session is
   read once per `selectedId` (`CloudCodePage.tsx:600-640`) and the only thing that fills the transcript after a first
   turn is the POST return (`:796`). Add a re-read of `api.get(selectedId)` every 4 s while the selected session's state
   is `provisioning` or `running`, or any stored turn passes `isCloudCodeTurnLive`, and no POST of this tab is in flight
   (`turnRunning` false, so the tab's own pending row is never duplicated by its stored twin). The session-state clause
   covers the race where the new page's first GET runs before the turn row exists.

Nothing here changes `packages/ui`; web-only. Desktop (Electron shows the hosted app) gets it automatically. The Tauri
app and mobile/VS Code keep their own pages; they gain 3.1/3.2 for free but not the live view.

Refactor: none needed. The one new helper exists only because it makes the age rule testable.

## 4. Regression check

Money and stored data are touched (a turn now keeps spending after its client leaves), so:

- `app/api/code/sessions/[sessionId]/agent/route.test.ts` or the transport test: aborting the request signal does not
  abort the turn's signal; the Stop request still cancels it; the usage reservation settles on both.
- `lib/services/__tests__/cloud-code-agent-loop.test.ts`: a stream that yields an error chunk with the signal aborted
  returns `cancelled`; with the signal live it still returns `error`.
- Service test beside `cloud-code-agent-service.test.ts:495-505`: a user stop plus an aborted-stream error yields
  "You stopped this turn", not the provider copy.
- `cloud-code-transcript` test for `isCloudCodeTurnLive`: fresh, null reason: live; `updatedAt` 800 s old: not live; any
  stop reason: not live; a resumed turn whose `createdAt` is 15 min old but `updatedAt` is 10 s old: live.
- Session-service test: the turn record carries `updatedAt` from `updated_at`.
- Page test: after the session page opens with no stored turn and the session `running`, the poll picks up the turn and
  its steps without a POST return.

## 5. Person-style check

Rebuild the local app. Sign in as the seeded Ultra account (`agi-dev-ultra+clerk_test@example.com`), 1280 wide, then 390.

1. /code, Cloud, Isolated, no repository. Type "In a new scratch folder write sum.js exporting sum(a,b), plus a test that
   checks sum(2,3) is 5, and run the test." Press Start the task.
   Must see within 3 s: message, spinner row, Stop, sidebar "Running". Within about 10 s tool steps appear one by one.
   Ends with the answer and "Done"; no Cancelled, no dropped text.
2. Same task again; the moment the page opens press reload (twice). Must see: steps so far, still Working with Stop, then
   the finished answer. Never "connection dropped".
3. Start a long task (write a small Node calculator with tests and a README). Close the tab, wait 60 s, open the session
   from Cloud sessions: finished or still running with steps.
4. Start a long task, press Stop after the first steps. Must see: steps kept, "You stopped this turn. Nothing further was
   run.", "Cancelled", Run this task again. Must not see "The model failed to produce a response".
5. Start a task and open another session mid-turn, come back: still running or finished.
6. Start a task needing approval, wait 15 minutes before approving: after Approve the spinner and live steps show; the
   turn is not drawn as stopped.
6b. Denied/failure cases: sign in as the Free account, open /code: the existing Upgrade message, no error text and no
   request to /agent. With the network offline while the page is open, Run this task again: the existing Offline pill (the
   missing feedback is a separate, untraced defect). Task that needs approval (a command outside the sandbox policy): the
   approval card appears without a reload.
7. Repeat 1 at 390 px: spinner and Stop visible, nothing overlapping.

## 6. Compatibility and rollback

- No API shape, schema or migration change. The POST stays synchronous; mobile and VS Code still get the answer. What
  changes for them: closing the app no longer cancels the turn; it finishes and shows when they return.
- The loop and service edits only change which terminal text a stopped turn gets.
- Rollback: revert the one-line signal change in the transport (and approval service); the page edits are harmless without
  it (the turn is cancelled again but the page shows it correctly, which is still better than today). The reverse is not
  true: the transport change without the page edits is worse than today.
- The page deltas depend on the live checkout's background-turn store and poll. If they do not land, port them first:
  `useCloudCodeBackgroundTurns`, the `read()` poll, `backgroundApi`.

## 7. Owner

Decision (money and product): an abandoned turn keeps running to completion, spending provider and sandbox cost, until its
step bound, the time budget (`CLOUD_CODE_AGENT_TURN_BUDGET_MS`, under the 800 s ceiling) or Stop. Facts: today closing the
tab cancels it; the managed-usage reservation and plan quotas still apply per step
(`cloud-code-agent-service.ts:826-832`). Recommendation: yes, because Claude Code on the web and Codex continue after you
leave, and a reload killing a task is a visible defect. A cheaper cap, if wanted, is a shorter budget for turns whose
client has been gone more than a few minutes; not designed here.

Setup (production setting): `AGI_DURABLE_CODE_TURNS` (`.env.example:444`) is off by default
(`lib/workflows/start-cloud-code-turn-workflow.ts:21-24`, "off until someone has watched one work"). It makes turns survive
a function kill and is the real answer to stranded rows. Whether production has it on is unknown here. Recommendation:
after 3.1 ships, watch one durable turn on a preview, then turn it on.

GitHub App credentials are missing only on the test machine; production setup is the owner's and is unrelated to this fix.

## 8. Overlap

- Web-lane (`~/.cache/agi-audit/worktrees/web-lane`): `git diff --stat` is empty for every file above
  (CloudCodePage.tsx, CodeTranscript.tsx, agent route, transport, loop, service, session service, contracts client and
  transcript, cloud-code-api.ts). No conflict.
- Live checkout: `apps/web/features/code/CloudCodePage.tsx` has about 904 added and 215 removed uncommitted lines
  (background turns, poll, approvals); `hooks/use-cloud-code-authority.ts` and `services/cloud-code-background-turns.ts`
  are changed or new; `lib/services/cloud-code-agent-service.ts` has a small uncommitted step-bound edit (4+/3-, near
  `:822`); `components/CodeTranscript.tsx` 2+/2-. No commits ahead of origin/main touch these files. Untouched there:
  the route, the transport, the loop, `cloud-code-session-service.ts`, `cloud-contracts` transcript and client.
- To avoid a conflict: land only 3.2 (loop, service text) and its tests now. It needs no page change and gives the
  Stop-wins text, which is the only user-visible gain of landing early. Land 3.1 and 3.3 as one change, after the live
  `CloudCodePage.tsx` is committed, rebasing onto it, or hand the 3.3 deltas to that agent and land 3.1 only when they
  are in. The service edit in 3.2 (`:844-848`) is 22 lines from the live step-bound hunk at `:822`; it does not overlap
  textually.

## 9. Review response

Blocker 1 (age rule hides a resumed turn): right. The approval resume claim sets only `state = 'running'` and
`updated_at = now()` and leaves `created_at` (`lib/services/cloud-code-agent-approval-service.ts:320-323`). The record
has no updated time (`packages/contracts/types/src/cloud-code.ts:288-302`; `TURN_COLUMNS` at
`cloud-code-session-service.ts:488-489` omits `updated_at`), so `createdAt` was the only choice and it was wrong. Changed
in 3.3 delta 2: add `updatedAt` (column already exists, `0082_cloud_code_agent_turns.sql:58`, no migration) and measure
from it. The step table has a completed time but the contract does not carry it, and per-step time is not needed: a
healthy segment is at most the 780 s budget (`lib/deadline-policy.ts:42`), under the 800 s limit. Tests now cover the
resumed turn.

Blocker 2 (3.1 alone leaves a blank page): right. On origin/main the session is read once per `selectedId`
(`CloudCodePage.tsx:600-640`) and the turn result is applied only from the POST (`:796`), which the unmount still drops
(`use-cloud-code-authority.ts:14-21`). With the signal detached the turn would finish on the server and the person would
see a blank session instead of today's "Cancelled" row. Changed: 3.1 now ships only with 3.3 (new delta 4 carries a
minimal poll if the live one is late); section 8 now lands 3.2 alone first and says its Stop-wins text is the only
user-visible gain of landing early; section 6 rollback says the transport change alone is worse than today.

Suggestions taken: the detached signal goes only into `executePersistedAgentTurn` (3.1); the now-dead "connection
dropped" branch is to be deleted (3.1). The loop check at `cloud-code-agent-loop.ts:519` is kept as designed; a provider
error chunk just after a budget abort is already covered by the `deadline.expired()` branch (`:849`).

Suggestion on abandoned-turn spend: the second-device case is stopped by the session run lease
(`claimCloudCodeSessionForRun`, `cloud-code-session-service.ts:1455-1482`: a new run needs `state = 'ready'` or an
expired lease) and by the start check that throws "Code session is busy; wait and try again"
(`cloud-code-agent-service.ts:1085`), which the page already shows as a plain message (`CloudCodePage.test.tsx:1436-1446`).
Not verified: that a different session of the same user is bounded by the plan concurrency window; that is the existing
per-plan rule and is unchanged. Add a test that a second start on a session whose first turn lost its client gets the
busy conflict.
