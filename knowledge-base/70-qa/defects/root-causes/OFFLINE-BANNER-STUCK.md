---
id: "DOC-70-qa-defects-root-causes-offline-banner-stuck"
type: "root-cause"
title: "OFFLINE-BANNER-STUCK"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# OFFLINE-BANNER-STUCK

Paths are in ~/.cache/agi-audit/worktrees/gap-read-main (origin/main). I checked the code myself and confirmed both skeptic readings. I did not open screenshots; the symptoms come from the testers' rows.

## 1. What the person sees today / should see

Today:
- (A) Offline, type, press Enter. A yellow alert says "You are offline. Your draft is saved here and can be sent after you reconnect." The network returns, Send turns on, the alert stays until a send works or the draft is reset.
- (B) Offline, archive the open chat. The chat is not archived. A red notice "You appear to be offline. Check your connection." with Retry stays above the composer after the network is back. Only the top "Offline" pill goes away.

Should see:
- Both notices disappear on their own when the browser comes back online. Nothing says "offline" while online.
- A failed sidebar action (archive, pin, move) gives its own short message ("Could not archive this conversation"), not a message about the chat turn. Retry must never regenerate the last answer because an archive failed.
- The draft is kept, and Enter works right after reconnecting.

## 2. Causes

1. (A) Stale yellow banner: product defect. `ChatComposerNew.tsx:3584-3586` sets `localNotice` to `SEND_REASON.offline` on Enter while offline and returns. It is rendered at `:4929-4936`. The typing handler clears only three named notices (`:2842-2849`), and the draft reset clears all (`:2155`). `useOnlineStatus` does update on `online` (`packages/ui/unified-chat/src/hooks/use-online-status.ts:5-19`), which is why Send re-enables (`:4802` disabled reason), but nothing clears `localNotice`. The same text is duplicated as a live disabled reason and a sticky notice.
2. (A) "Enter did not send first time" in W-5: not established. After the fix the stale notice is gone, so the symptom is likely gone, but I could not prove focus loss or another cause. No claim made. The copy "can be sent after you reconnect" is accurate (draft kept; user sends), so no copy change needed.
3. (B) Stale red notice: product defect. `useConversations.ts:943-945` catch calls `setError(toUserMessage(err, ...), id)`. `network-error.ts:6-13` makes the offline text because `navigator.onLine` was false. `web-chat-store.ts:1809-1815` writes the shared `error` only when `id` is the active conversation (so this appears only for the open chat). `WebChatPage.tsx:6856-6866` turns the store error into an inline turn failure with a Retry that calls `handleRegenerateMessage` (`:6883-6925`). The only `online` listener in this hook (`useConversations.ts:985-997`) refetches the list and does not clear the error. Same path for delete (`:970`).
4. (B) "No feedback": the toast exists (`sidebar-session-actions.ts:36-43`, called from `WebChatPage.tsx:5376-5388` and `WebAppShell.tsx:359`). Whether the tester missed it is unproven. Product defect only in the sense that the only lasting feedback is the wrong one. Nothing queues the archive; that is acceptable (user retries).
5. Test artifact: no. Playwright offline fires the same events as a browser. Not a test-machine limit; production is affected on all plans.

## 3. Change

a) `packages/ui/ui/src/lib/network-error.ts` (shared lib, used by web; the new helper is additive). One owner for the offline copy, so the clear step does not compare against a duplicated literal:
```ts
const OFFLINE_FALLBACK = 'You appear to be offline. Check your connection.';
export function offlineErrorMessage(): string {
  return translateUi('errors', 'network.offline', OFFLINE_FALLBACK);
}
// networkErrorMessage uses offlineErrorMessage() in its offline branch
```

b) `apps/web/lib/hooks/useConversations.ts`: next to the existing `online` effect, clear the shared error when it is the offline message:
```ts
useEffect(() => {
  const clearOfflineError = () => {
    if (useChatStore.getState().error === offlineErrorMessage()) setError(null);
  };
  window.addEventListener('online', clearOfflineError);
  return () => window.removeEventListener('online', clearOfflineError);
}, [setError]);
```
This also fixes a failed send offline (same channel). Not added: removing `setError` from update/delete, because callers at `WebChatPage.tsx:4862` and `:5369` (`void updateConversation(...)`) have no toast and would go silent. Wrong-action Retry while still offline remains (it is only visible while offline, and retrying then fails the same way); say so to the owner as a known limit, optional follow-up: wrap those two callers in `runSessionRowAction` then drop `setError` in update/delete. No refactor needed for the fix.

c) `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (near `const online = useOnlineStatus()` at `:837`):
```ts
useEffect(() => {
  if (online === true) setLocalNotice((c) => (c === SEND_REASON.offline ? null : c));
}, [online]);
```
Shared code check: the composer is web only. `use-online-status.ts` is unchanged, so desktop, Chrome and VS Code are untouched.

## 4. Regression check
Add two cheap ones (no money/sign-in/data):
- Unit in `ChatComposerNew.sendPending.test.tsx` (existing offline test at `:111-138`): set offline, type, press Enter, assert the alert shows; dispatch `online`, assert the alert is gone and the draft text remains.
- Unit for `useConversations`: store error equals `offlineErrorMessage()`, dispatch `online`, error is null; a different error stays.
Extend `e2e/composer-offline.spec.ts` (`:5-34` never presses Enter offline) with the Enter step.

## 5. Person-style check (rebuilt local app, seeded account, compiled build)
1. Open /chat, type "hello offline", set the browser offline (DevTools Network offline, or Playwright setOffline), press Enter. Yellow alert shows, draft stays, Send disabled.
2. Go online. Within a second the alert vanishes, Send is enabled, press Enter once: message sends first time. Watch for the W-5 focus symptom here; if Enter still fails once, report it separately.
3. Open an existing chat, go offline, archive it from the sidebar menu. See the toast "Could not archive this conversation". Go online: the red "You appear to be offline" notice (if shown) vanishes, the chat is still listed. Archive again: it archives with the Undo toast.
4. Denied cases: stay offline and press Enter again (alert returns); reload online (no stale notice); with a real server error (not offline), the red notice must stay until dismissed.

## 6. Compatibility and rollback
Additive: one new exported helper, two effects. No data, API or setting changes. Roll back by reverting the three files. Translations: key `network.offline` unchanged.

## 7. Owner
None. Optional decision: whether sidebar actions should stop using the turn-error channel (follow-up in 3b).

## 8. Overlap
- web-lane worktree: `ChatComposerNew.tsx` differs (stat shows 13 lines; a -U0 diff printed nothing, likely whitespace or mode, so recheck before editing). `useConversations.ts`, `network-error.ts`: unchanged there.
- Desktop checkout: `WebChatPage.tsx` has an unpushed commit (52530d34f9, service configuration failures); I do not touch that file. The others show no change in the checkout. Make edits in one worktree after rebasing; the three edits are small insertions that will not collide.
