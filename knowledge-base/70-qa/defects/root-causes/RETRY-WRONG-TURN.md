---
id: "DOC-70-qa-defects-root-causes-retry-wrong-turn"
type: "root-cause"
title: "RETRY-WRONG-TURN: design"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# RETRY-WRONG-TURN: design

Paths are relative to ~/.cache/agi-audit/worktrees/gap-read-main (origin/main 22649ece43) unless stated. Line numbers are from that tree.

## 1. What the person sees today / what they should see

Today (tester W-9, conversation db6da6f8-620a-41dc-ac77-0528fd3c9487):

1. They send a third message, reload about 3 s later, and see their bubble with no answer. About 45 s later the red banner "The model returned no response for this turn. Retry, or rephrase your message." appears, even though the server saved a full answer 3 s after the reload (see Causes). The answer only shows up after a later reload or a window focus.
2. They press a Retry. The first answer becomes "2/2", later turns disappear, and pressing again gives "3/3". "Previous response" brings the later turns back.

Should see:

- After a reload mid-turn, the page shows "working" while the server works, and the finished answer appears by itself within a few seconds of the server saving it. The "no response" banner appears only when the server has no answer and no live run for that message.
- A Retry control says what it will do. Retrying an older message says it starts again from that message, so nobody is surprised that later turns move behind the pager.

## 2. Causes

### A. False "no response" banner after a reload mid-turn. PRODUCT DEFECT (corrected from the first diagnosis)

The first diagnosis said the client had no way to re-read the conversation. Both reviewers partly corrected that: a focus/visibility refresh exists. The real gap is narrower and I traced it:

- The banner is client-only. `resolveTurnErrorNotice` returns the `emptyResponse` text for any trailing user message once `pastGracePeriod` is true (`apps/web/features/chat/lib/turn-error-notice.ts:292-307`, grace 45 s at line 267). It never asks the server.
- A recovery loop already exists for exactly this case. In `apps/web/lib/hooks/useChatStream.ts:4050-4144`, when the last message is a user message and nothing is loading, `ask()` calls the runs endpoint (`apps/web/lib/hooks/inFlightTurnRecovery.ts:83`, path `/api/llm/v1/chat/completions/runs`). On `running` it sets loading and re-asks every `IN_FLIGHT_TURN_RECHECK_MS` = 5 s (lines 4120-4123). On `idle` it only calls `setLoading(false)` and stops (line 4120, then nothing). It never re-reads the messages.
- Server log shows that sequence: conversation GET at server.log line 10569 (time 1795550267155, before the answer existed); runs GET at time 1795550267345 (200, 43 ms); the answer row is persisted at about 1795550270.7 (assistant 2263ecec, created 13:57:50.692 per the first diagnosis, DB not re-queried by me); next runs GET at 1795550272391 (200, 15 ms). That second poll is the one that ends the loop (a verified terminal run returns `idle`, `inFlightTurnRecovery.ts:103-110`). I did not see the response bodies, so "second poll said idle" is inferred from the loop stopping, not read. After it, the next conversation GET is line 14002, minutes later.
- So: loading goes true then false, the transcript still ends with the user message, and 45 s later the banner shows. The focus refresh (`WebChatPage.tsx:2330-2343`) does not fire because the tab never lost focus.
- `refreshOpenConversation` (`apps/web/lib/hooks/useConversations.ts:877-890`) is the correct re-read: it declines while the conversation is loading or streaming, so a live turn is never overwritten.

Not the test machine. The local database also lacks `public.connector_permission_generations` (server.log line 10518); it is logged non-fatal ("approvals are asked once") and unrelated.

### B. Retry regenerated the first message (2/2, 3/3). Control clarity defect; which control was clicked is NOT PROVEN

- DB rows (from the first diagnosis, not re-queried): both retry answers have parent = first user message. The banner's Retry calls `handleRegenerateMessage(lastChatMessage.id)` (`WebChatPage.tsx:6915-6923`), the last message being the third user message, so the banner cannot produce parent = first message by this code. Every user bubble has its own icon button, `aria-label="Retry this message"`, tooltip "Retry" (`MessageBubble.tsx:3717` area, calls `onRegenerate(message.id)`). With variants on (default for all plans per the skeptic, `message-variants-gate.ts:50-55`) it sends `regenerateParentMessageId: userMsg.id` and creates a sibling answer without confirming (`WebChatPage.tsx:5801-5812`). Later turns leave the visible path by design.
- The probable path is a name-based click on "Retry" that matched the first bubble's button (the Playwright snapshot lists it before the banner's). Two near-identical retry icons labelled "Retry" is a product clarity defect regardless of who clicked. If the tester really pressed the banner, the code read cannot explain it; I could not check that.
- Provider or model limit: none. Test-machine limit: none.

### C. If the banner Retry had been pressed on stale rows, it would have added a duplicate answer. PRODUCT DEFECT (follows from A; not reproduced)

`regenerateCreatesSibling` (`useChatStream.ts:895-899`) sees no answer under the third user message in stale rows. Fixing A removes the stale rows. No separate change.

### D. The Excel failure inside that answer ("I couldn't create the Excel file...")

Not part of this problem; it belongs to the office-file problem. No change here.

## 3. Change

### 3.1 `apps/web/features/chat/lib/turn-error-notice.ts` (owner of turn-notice rules)

Add one pure function, next to `shouldAskWhetherTurnIsRunning`'s sibling rules, so the rule is testable:

```ts
export function shouldReReadSettledTurn({
  lastMessage, isLoading, hasError, isTemporary,
}: {
  lastMessage: ChatMessage | undefined | null;
  isLoading: boolean;
  hasError: boolean;
  isTemporary: boolean;
}): boolean {
  if (isLoading || hasError || isTemporary) return false;
  return lastMessage?.role === 'user' && !lastMessage.isStreaming;
}
```

Why: one owner for "a user message with no answer and no live turn is worth re-reading from the server before anyone reports it as failed". Fail closed: errors and temporary chats never trigger a read.

### 3.2 `apps/web/features/chat/pages/WebChatPage.tsx`, beside the focus-refresh effect at 2330-2345

```tsx
const trailingUserMessageId = chatMessages[chatMessages.length - 1]?.id;
const rereadSettled = shouldReReadSettledTurn({
  lastMessage: chatMessages[chatMessages.length - 1],
  isLoading,
  hasError: Boolean(chatError),
  isTemporary: displayedConversation?.isTemporary ?? false,
});
useEffect(() => {
  if (!authLoaded || !activeConversationId || !rereadSettled) return;
  void refreshOpenConversation(activeConversationId);
}, [authLoaded, activeConversationId, rereadSettled, trailingUserMessageId, isLoading, refreshOpenConversation]);
```

Why this and not an edit to `useChatStream`: the hook cannot read conversations itself, and `ChatStreamRuntimeProvider` (`features/chat/components/ChatStreamRuntimeProvider.tsx`) and `DesktopChatRunner` also mount it; a second `useConversations()` instance there would duplicate per-instance refs. The page already owns `refreshOpenConversation` and the banner. The loop's `setLoading(false)` on idle flips `isLoading`, which re-runs this effect, so the read happens right after the run ends. It also fires once on first mount with a trailing user message (a cheap duplicate GET) and covers the case where the run finished before the first runs poll. No timers, no new loop: the effect re-fires only when the message, the loading flag or the conversation changes. `refreshOpenConversation` itself refuses while loading, so a live turn wins. No refactor needed.

Verify before coding: that `isLoading` at this point in the file is the per-conversation flag (it is used at line 6856 as `isLoading && !isStreaming`), and that `chatMessages` is declared before line 2330 (it is used at 6855; if it is declared later, move the effect below it).

### 3.3 `apps/web/features/chat/components/messages/MessageBubble.tsx`, user-bubble retry button (about line 3711-3722)

Make the label say what it does and stop it matching the banner's "Retry":

```tsx
aria-label="Retry from this message"
...
<TooltipContent>Retry from here</TooltipContent>
```

The banner keeps "Retry this turn". No test or e2e file references "Retry this message" (grep over apps/web found only the source line and an unrelated confirm title at `WebChatPage.tsx:5829`). The 2/N pager stays as the cue that other versions exist. Cite: `isLatestTurn` is true only for assistant bubbles (`ChatMessageList.tsx:863`), so one label for all user bubbles is the smallest correct change; per-bubble wording would need a new prop.

Not changing: the variants behaviour itself (deliberate, nothing deleted, no confirm needed per the comment at `WebChatPage.tsx:5801`).

### 3.4 Shared surfaces

`packages/ui` and `unified-chat` are not touched. `apps/web/features/chat` is web-only; desktop shows hosted web; Chrome/VS Code have their own chat shells and are not affected by this code. Search for the same root cause on those: none known; I did not check them, so mark unknown.

## 4. Regression check

- Add apps/web/features/chat/lib/turn-error-notice.reread.test.ts (not found) (pure, cheap): true for trailing user message not loading; false when loading, when an error is set, when temporary, when last is assistant, when last is streaming.
- No stored data, money or permissions change, so no further test. Existing `turn-error-notice.*.test.ts` stay unchanged.

## 5. Person-style check (rebuilt local app, seeded Ultra account, compiled build)

1. Sign in with the test sign-in. Start a chat, send "Make an .xlsx workbook with three sheets of sample sales data" (a tool-heavy turn that takes more than 10 s).
2. Reload the tab about 3 s after sending. Must see: the user bubble and a working indicator (Stop button, "Generating response"), not an empty page and not a banner.
3. Wait without clicking or switching tabs. Must see: the finished answer appear by itself within about 5 to 10 s of the server finishing, no red banner at 45 s or later.
4. Failure case: stop the local server's provider key (blank the key in `.env.local` copy used for the run) and send a message. Must see the existing failure notice with Retry; no extra flicker or duplicate bubble.
5. Denied case: sign in as a Free seeded account on a model it cannot use; the existing Upgrade message shows as before and no re-read loop (watch the network tab: no repeated conversation GETs).
6. Labels: hover the refresh icon under the first user bubble: tooltip "Retry from here". Under a failed last message the banner button reads "Retry". Press the bubble's one on the first message: the answer becomes 2/2 and the person understands from the label; "Previous response" returns.
7. Network tab on step 2 to 3: exactly one extra conversation GET after the last runs poll, no more.

## 6. Compatibility and rollback

No API, schema or stored-data change. Older servers are unaffected: the effect only calls the existing conversation GET. Rollback is reverting the page effect and the label; nothing persists. The label change breaks any external script matching the old name; none found in the repo.

## 7. Owner

None. (Variants default on for all plans is already a product decision in `message-variants-gate.ts`; the change keeps it.)

## 8. Overlap

- web-lane worktree: `git diff HEAD --stat` for `WebChatPage.tsx`, `turn-error-notice.ts`, `MessageBubble.tsx`, `useChatStream.ts`, `useConversations.ts` is empty. No conflict.
- ~/Desktop/agiworkforce: no uncommitted diff to those files; one unpushed commit, 52530d34f9 (service-configuration errors), touches `WebChatPage.tsx` (9 lines) and `useChatStream.ts` (2 lines) and `WebChatPage.headerTitle.test.tsx`. Those are error-text edits, not near line 2330; a rebase should merge cleanly. Place the new effect right after the focus-refresh effect and keep the new import on its own line to avoid hunk collisions.
- Other problems in this wave that edit `WebChatPage.tsx` or the turn banner (for example any "no response" or Retry design) could overlap; apply this one after them or merge by hand.

## Unknowns

I could not see which control the tester pressed, the runs-endpoint response bodies, or re-query the DB. The DB parent ids come from the first diagnosis.
