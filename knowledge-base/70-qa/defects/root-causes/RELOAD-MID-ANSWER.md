---
id: "DOC-70-qa-defects-root-causes-reload-mid-answer"
type: "root-cause"
title: "RELOAD-MID-ANSWER"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# RELOAD-MID-ANSWER

Paths are relative to apps/web in the clean tree ~/.cache/agi-audit/worktrees/gap-read-main unless stated. Log line numbers are file lines of ~/.cache/agi-audit/web-lane/logs/server.log, as the skeptic corrected them (disconnect 15793, conversation GET 15945, /runs polls 15951-15986, second GET 16451).

## 1. What the person sees today / what they should see

Today: they reload while an answer is being written. The chat shows their message, then "Preparing" with Stop, then (about 25 s later) Preparing and Stop vanish and the composer is idle, with no answer. Only a second reload shows the essay (W-3, 18/19/20 screenshots). With a slower first poll (W-9) the screen is blank and then a red "The model returned no response for this turn" banner appears, although the server finished the turn.

Should see: after a reload the chat shows the person's message and "Preparing". When the turn ends the finished answer appears by itself, with no second reload and no false "no response" banner. If the turn really produced nothing, the existing banner stays (it is correct then). If the turn died on the server, the existing "This turn stopped running on the server" message stays. Nothing here depends on a plan, so no Upgrade message applies.

## 2. Causes

1. Answer never loaded after reload. Product defect. The recovery poll in lib/hooks/useChatStream.ts:4056-4144 asks GET /runs every 5 s (inFlightTurnRecovery.ts:10). While a run is active it calls setLoading(true) and reschedules (useChatStream.ts:4120-4124). When the run is idle it only calls setLoading(false) and ends (4120, no refetch). The only caller of refreshOpenConversation (lib/hooks/useConversations.ts:877-890) in app code is the focus/visibilitychange listener in features/chat/pages/WebChatPage.tsx:2323-2342, which a reload in a visible tab does not fire. Log for W-3: disconnect 15793, run polls 15951-15986 stop once idle, next conversation GET only at 16451 (second manual reload). The server kept running after the disconnect (provider step finished at 750), so the answer is saved.
2. False "no response" banner (W-9). Product defect, same root. features/chat/lib/turn-error-notice.ts:266-307 and features/chat/hooks/use-turn-error-notice.ts:23-43 show the emptyResponse text once the last on-screen message is a user message older than 45 s and nothing is loading. The page never re-read the saved answer, so the transcript still ends on the user message. Not a separate cause. The saved W-9 answer is inferred from W-3, not seen.
3. Long "Preparing" gap before text. Provider or model limit, tracked as SLOW-FIRST-WORDS. The first provider line came 25 s after send (log 741/750). A recovered view has no stream to show, so only the generic row appears. Not changed here.
4. Request-scoped turns (durable switch off, breaker open, first-event budget missed, no reservation) end with the connection (app/api/.../route.ts:934-1050, lib/workflows/durable-initial-turns.ts:9-18). Product risk, not traced and not exercised by these runs (both were durable, workflow.enqueue present). Needs a separate trace of what a reload leaves in the database for that path. No change proposed here; the refetch below makes whatever is saved visible.
5. Retry on the banner hits the wrong turn: RETRY-WRONG-TURN, separate. Removing the false banner here removes the usual way into it.
6. No video: test-machine limit (ffmpeg missing), unrelated.

Test settings did not cause this (rate limits x4 and test sign-in do not affect it).

## 3. Change

Smallest fix: refetch the open conversation once the recovery poll ends. A live re-attach is not needed.

Order matters: refreshOpenConversation returns false while the id is in loadingConversationIds (useConversations.ts:877-890), so the refetch must run after setLoading(false). Hence a signal out of the hook, acted on in an effect, not a call inside the poll.

### lib/hooks/useChatStream.ts
In useChatStream add state and set it after the idle/stalled branch of `ask` (after the `setLoading(...)` at ~4120, for every verdict other than 'running'):

```ts
const [settledRecovery, setSettledRecovery] = useState<{ conversationId: string; sequence: number } | null>(null);
...
useChatStore.getState().setLoading(verdict === 'running', conversationId as string);
if (verdict === 'running') { timer = setTimeout(() => void ask(), IN_FLIGHT_TURN_RECHECK_MS); return; }
setSettledRecovery((previous) => ({ conversationId: conversationId as string, sequence: (previous?.sequence ?? 0) + 1 }));
```
Return `settledRecovery` on UseChatStreamReturn. It fires whether the first verdict is already idle (answer saved between the page's read and the poll) or idle after running. The poll only asks when the last message is a user message with nothing loading (inFlightTurnRecovery.ts shouldAskWhetherTurnIsRunning), so ordinary sends do not trigger it. A failed turn leaves a user message last and costs one extra GET; the effect has no dependency on messages, so there is no loop.

### features/chat/pages/WebChatPage.tsx
Next to the focus effect (2323-2342), reusing refreshOpenConversation (the one owner of re-reading the open conversation):

```ts
const { settledRecovery } = useChatStreamRuntime();
useEffect(() => {
  if (!authLoaded || !settledRecovery || settledRecovery.conversationId !== activeConversationId) return;
  void refreshOpenConversation(settledRecovery.conversationId);
}, [settledRecovery, activeConversationId, authLoaded, refreshOpenConversation]);
```
refreshOpenConversation already guards on active id, streaming and loading, and extendedCachedTranscript (useConversations.ts ~838-860) swaps in the server rows plus newer ones. After a reload the cache comes from the same server read, so the ids match and the answer is taken. Nothing else changes: with the answer in the transcript, resolveTurnErrorNotice returns no banner; no edit to turn-error-notice.ts.

Not changed on purpose: the banner wording (correct when a turn is truly empty), packages/ui (the poll and page are web-only; Electron Desktop shows the hosted web app, so it gets the fix with the web deploy). The Tauri desktop's own apps/desktop/src was not checked and is unknown. No refactor is needed: the fix is two small edits and testable as is.

Open check for the implementer (unverified): that the run row turns idle only after the assistant message is written. If it can turn idle first, add one retry of refreshOpenConversation after about 2 s when the last message is still the user message. I did not trace the workflow's completion order.

## 4. Regression check
Add a hook test in lib/hooks/useChatStream.test.tsx (existing file, existing runs-endpoint fakes): conversation whose last message is a user message; runs endpoint returns one active run, then none; assert settledRecovery changes after the idle answer and not while running. Add a page-level or small test that the effect calls refreshOpenConversation once per signal and not for another conversation. Shows stored data, so worth it. Do not weaken or reuse mocks that omit real exports (check:mock-exports).

## 5. Person-style check
Rebuilt compiled local app, Premium seeded account, test sign-in.
1. New chat, type "Write a 1500 word essay about bicycles", press Enter. About 3 s in, press the browser reload.
2. Must see: your message, then "Preparing" with Stop. Within about 5 s after the turn ends (a poll interval) the essay appears without touching anything; Stop disappears; no red banner. Repeat on the Ultra account.
3. Reload twice in a row mid-answer; the essay still appears once, no duplicate.
4. Failure: stop the provider key (blank it in .env.local) or send a message that is refused; reload mid-turn. The existing error text appears, not a blank screen.
5. Truly empty turn: the "no response" banner is still allowed after 45 s only if nothing was saved.
6. Switch to another chat while recovering; the first chat's answer must not appear in the second. Open a second chat reload mid-answer in tab A and leave the tab in view; confirm it still recovers without a focus change.
7. Normal send without reload: answer streams as before and no extra GET /api/chat/conversations/<id> appears in the network panel after it ends.

## 6. Compatibility and rollback
No API, schema or stored-data change. Additive field on the hook return; consumers that ignore it are unaffected. Worst case is one extra read of a conversation the user already has open. Roll back by reverting the two edits; behavior returns to today's.

## 7. Owner
None.

## 8. Overlap
web-lane worktree: no diff in lib/hooks or WebChatPage.tsx (checked with git diff --stat). Live checkout ~/Desktop/agiworkforce: no uncommitted diff in the four files; one commit not on origin/main touches useChatStream.ts: 52530d34f9 "fix(web): distinguish service configuration failures in chat", a provider-configuration error change away from the recovery block (4056-4144). Expect an easy merge; apply the edits after that commit lands or rebase on it. The same WebChatPage.tsx and useChatStream.ts are touched by RETRY-WRONG-TURN and SLOW-FIRST-WORDS fixes; keep this change confined to the lines above.
