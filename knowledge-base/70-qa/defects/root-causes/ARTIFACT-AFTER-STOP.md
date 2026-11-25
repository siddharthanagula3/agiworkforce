---
id: "DOC-70-qa-defects-root-causes-artifact-after-stop"
type: "root-cause"
title: "ARTIFACT-AFTER-STOP"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# ARTIFACT-AFTER-STOP

Paths are relative to origin/main (gap-read-main). Log lines are in ~/.cache/agi-audit/web-lane/logs/server.log.

## 1. What the person sees today / should see

Today (Ultra W-8, conversation 9a16992c, "Live Sum" edit):
- Stop mid-artifact: the reply shows a big raw html code block with its own live preview, plus the "Live Sum" card, the banner "This artifact was saved from a partial response..." and "Response stopped." (13b-stopped-tall.png). The Free tester saw the same raw block with a blank white preview (10-stopped.png).
- Reload, or Try again then reload: half a raw html block, an empty preview, "Continue generating" (14, 15).
- After Continue generating the reply stays a raw block plus preview, never a card, even after reload (16, 23).
- Outputs lists two "Live Sum" entries and the panel opens on "v1/2" (17, 18).

Should see: after Stop, one "Live Sum" card marked as partial, with the banner and Regenerate. The prose has no raw source and no half-page preview. A reload shows the same. A finished edit is a card, v2/2, with the newest version open. If the model gives a page that is not an artifact, the person sees it plainly, not half-broken.

## 2. Causes

1. Raw fence next to the card after Stop. **Product defect.** Confirmed.
   - `MessageBubble.tsx:1510` sets `streamingBlock = message.isStreaming ? trailingArtifactBlock : null`. When Stop ends the stream it becomes null.
   - `MessageBubble.tsx:2060-2062` then uses the whole `proseContent` as `base`, so the open fence stays. (The diagnosis said 2056-2058. Those lines are the comment.)
   - `removeArtifactBlocks` (`artifact-derivation.ts:613-633`) only removes blocks that `extractCodeBlocks` returns. That function skips a fence with no closing line (`artifact-derivation.ts:~100`, `if (close >= lines.length) break`).
   - `closeUnterminatedFence` (`MessageBubble.tsx:446-448`, used at 2083) closes the fence for display, so half a document renders as a code block with a preview.
   - The card comes from `useStreamingArtifactSync` (`use-streaming-artifact.ts:55-78`), which retains the partial artifact on Stop.
   - Local-setting check: not a test-machine effect. It is client logic and the Free tester hit it too.
2. After reload, a stopped or interrupted message shows only the raw block. **Product defect.**
   - The retained artifact lives in the in-memory store with its `interrupted` flag in a side map (`artifacts-store.ts:722-724`). The shared snapshot carries no such flag. The characterization tests say so (`__tests__/MessageBubble.interruptedArtifact.test.tsx`: "does not infer a partial marker from the shared snapshot" and "does not reconstruct interrupted evidence on a cold open-fence message").
   - That cold-open test uses an approval-projection message with no marker. It is about awaiting-approval turns, not Stop. A message the server saved as stopped carries `finishReason: 'stopped'` (`app/api/llm/v1/chat/completions/lib/stopped-run-turn.ts:9`, read at `MessageBubble.tsx:2054`), so Stop can be told apart from approval.
   - Traced: a reload during a retry is a client leave, saved with `truncated: true` and no `finishReason` (`stream-transform.ts:571-574, :750`; `assistant-turn-persistence.ts:320-324`), not 'stopped'. The persisted partial also loses its flag on reload, even from localStorage or the cloud (`artifacts-store.ts:491, :700-711`). See 3a to 3c and section 9.
3. Unmarked reply never becomes a card. **Provider or model limit, plus a product policy gap.**
   - Under the stored policy `explicit-v1`, a fence is an artifact only if `hasExplicitArtifactMarker` finds a marker (`artifact-derivation.ts:178-186`). Correction: the check is `content.includes(marker)`, anywhere in the block, not "first line".
   - The prompt asks for the marker (`capability-preamble.ts` around 324-335). Variant 2/2 left it out (15, 16, 23), variants 1 and the first turn had it. Continue generating (`useChatStream.ts` ~4910-5170) appends to the old text and cannot add it. Prompts and replies are not logged, so I cannot show why. It is model variance on (model name) under Auto.
   - Unmarked full pages still show as an html block with a working preview. That is by design of `explicit-v1`, and the policy is shared by 20+ files including mobile (`apps/mobile/stores/chat/derivedMessageArtifact.ts`) and the server persistence. See section 7.
4. Retry then reload gives a TypeError in the log. **Product defect, log and billing label only.**
   - `server.log` line 3951 is `sse_stream_disconnected` (866 ms after the retry started), line 3952 is `llm_stream_threw_mid_stream` with `TypeError: Invalid state: Controller is already closed`. The same pair appears for the Ultra user at 2060-2062 and 40294. (Line 3951/3952 re-checked by grep; the skeptic's offset note was right to ask for it.)
   - `stream-transform.ts:668` calls `controller.enqueue` after the client left. The catch (`:709`) logs level error and settles with `outcome: 'failed'` but already passes `cancelled: true` when `request.signal.aborted` (`:735-745`). The person never sees this; the half block is cause 1 and 2. Lower priority and does not change the screen.
5. Two "Live Sum" entries and "v1/2". **Mostly follows from causes 1-3; the versioning itself is by design.**
   - An edit in a new message gets a new id from `conversationId:messageId:ordinal` (`artifact-derivation.ts:~425`), and versions are chained by type plus lowercase title (`artifact-lineage.ts:9-12, 25-44`, used at `ArtifactPreview.tsx:694-712, 945-954`). So the original plus the stopped partial are two "Live Sum" entries, and "v1/2" is the stepper. Proper v2/2 is the intended result of a finished, marked edit.
   - Why the panel opened on the old version at 17/18: the finished edit never became a card (cause 3), so the only complete "Live Sum" was the old one. Which version the panel opens on after the fix I did not trace. It is a check in section 5.

## 3. Change

### 3a. Store: `apps/web/features/chat/stores/artifacts-store.ts` (new action, fixes the reload blocker)
Why it is needed: the interrupted flag lives only in the side map (`:93-119`, read at `:169`). The side map is emptied on every rehydrate (`rehydrateSharedStore` calls `clearSideMap()`, `:491`) and the persisted shape holds only `artifacts`, `versionsById` and `selectedArtifactId` (`:483-487, :508-510`). `toArtifactPushItem` (`:253-268`) sends no interrupted field. So after a reload the partial artifact comes back from localStorage or from the cloud with no flag, and `retainPartialArtifact` counts it as known (`:700-707`) and returns before setting anything (`:707-711`).

Add `markArtifactInterrupted(id: string): boolean`:
- If `mergedArtifacts()` has no visible artifact with that id, return false (nothing to flag, a deleted cloud copy stays deleted).
- If `getSideEntry(id).interrupted === true`, return true and do nothing (idempotent, no re-render loop).
- Otherwise `setSideEntry(id, { interrupted: true })`, then `notifyArtifactSubscribers()` (the same pair `applyArtifactPushResult` uses at `:1110` and `:1126`), return true.
It never touches content, title or version lists. `supersedesCloudCopy` (`:238-250`) compares only content, title and language, so `collectArtifactPushBatch` (`:1053-1078`) still skips the push for a flagged cloud copy. A cold flag causes no cloud write and no duplicate version.
Existing clearing paths stay: a content change through `upsertArtifact` rewrites the side entry (`:743`), and a server conflict resets it (`:1110`).

### 3b. Hook: `apps/web/features/chat/hooks/use-streaming-artifact.ts` (fixes cause 2)
Add inputs `settledPartial: boolean` and return `{ retentionBlocked: boolean }` (state, set when retention returns 'blocked').
In the branch where `!isStreaming || !block` (`:55-78`):
```ts
const coldPartial = Boolean(block) && !streamed && settledPartial;
if (block && (streamed || coldPartial)) {
  const source = streamed ?? fromBlock(block);
  const id = computeDerivedArtifactId(conversationId, messageId, source.ordinal);
  const retained = store.retainPartialArtifact({ id, ...fields from source, interrupted: true });
  if (retained === 'blocked') setRetentionBlocked(true);
  else if (retained === 'unchanged' || (coldPartial && retained === 'preserved')) {
    store.markArtifactInterrupted(id);
  }
  if (streamed && retained === 'preserved') notice = '...';
  if (streamed && retained === 'blocked') notice = '...';
}
```
- `fromBlock` reuses `detectArtifactType` and `extractArtifactTitle` (already imported) and `block.ordinal`, `block.language`, `block.content`, with the title fallback `INTERRUPTED_ARTIFACT_TITLE`.
- The id is derived from `conversationId` and `messageId`, the same arguments the live path uses (`MessageBubble.tsx:1512` passes `artifactConversationId`), so a cold rebuild lands on the same id as the live one and as any cloud copy.
- Live path keeps its toast for 'preserved' (existing saved work wins, flag not set). Cold path never toasts, because every old stopped message would toast on mount.
- 'created' needs no mark: the retain call already created it with `interrupted: true`.
- `retentionBlocked` resets in the `[messageId]` effect (`:46-50`).
- `trailingArtifactBlock` is already limited to renderable explicit fences (`MessageBubble.tsx:1496-1505`), so only real artifacts are rebuilt. The cold-open test with `cloudApproval` stays true: `awaitingApproval` is excluded from `settledPartial`. Update that test only by adding cases.

### 3c. Component: `apps/web/features/chat/components/messages/MessageBubble.tsx` (fixes cause 1)
Compute, before the hook call at `:1512` (`awaitingApproval` is defined earlier, `:1009`):
```tsx
const settledPartial =
  !isUser && !message.isStreaming && !awaitingApproval &&
  (message.metadata?.finishReason === 'stopped' ||
    (message.metadata as { truncated?: unknown } | undefined)?.truncated === true);
const { retentionBlocked } = useStreamingArtifactSync({ ..., settledPartial });
```
(`truncated` is read the way `turn-error-notice.ts:53` reads it.) Then:
```tsx
const streamingBlock = message.isStreaming ? trailingArtifactBlock : null;
const unfinishedBlock =
  streamingBlock ??
  ((settledPartial || hasInterruptedArtifact) && !retentionBlocked ? trailingArtifactBlock : null);
```
`base`, `split` and the memo deps use `unfinishedBlock` (slice from `message.content`, not `proseContent`, as the streaming branch does). Other `streamingBlock` uses (`:2239, :2862, :2975-2982`) stay: they drive the "Creating" row only while streaming. `hasInterruptedArtifact` (`:1937`) is defined before the memo at `:2055`.

Why the gate is the message state and not the store flag alone:
- The Stop render: `handleStreamError` sets `isStreaming: false` and `finishReason: 'stopped'` in one `updateMessage` (`useChatStream.ts:6140-6150`), so the very first post-Stop render already has `settledPartial` true and the raw block never flashes, even though the card is retained one effect later.
- Reload: the gate does not wait for the flag, so the card and the hiding appear on the same pass; the flag then adds the banner.
- Nothing is lost: if retention is 'blocked' (a known id whose copy is deleted, `:707-709`) `retentionBlocked` keeps the raw block visible. A message with no stopped or truncated marker and no flagged card keeps the raw block, as today.
- Known gap, stated: a live provider failure mid-turn with no Stop is covered only by `hasInterruptedArtifact` (live retain), so it can show the raw block for one render. The persisted row of such a turn is truncated, so reload is covered.

### 3d. Optional, `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` (cause 4, log only)
Log a client leave as info, not error:
```ts
} catch (streamError) {
  const clientLeft = request.signal.aborted;
  logger[clientLeft ? 'info' : 'error']({ event: clientLeft ? 'llm_stream_client_left' : 'llm_stream_threw_mid_stream', ... }, ...);
```
Billing already handles `aborted` (`:735-745`) with `cancelled: true`; leave the billing outcome as it is. This change does not touch what is saved (`:750` stays).

### 3e. Cause 3 (no code until the owner answers, section 7)
Do not add a heuristic that guesses artifacts.

No refactor is needed: each change is a few lines in files that already own the concept.

## 4. Regression check
- `artifacts-store` tests (new): (a) store holds the partial from localStorage rehydrate (side map empty): `markArtifactInterrupted` flags it and `getMessageArtifacts` returns `interrupted: true`; (b) same with the partial only as a cloud copy (`applyCloudArtifactDeltas`); (c) after the mark, `collectArtifactPushBatch()` returns nothing for that id; (d) deleted cloud copy: returns false; (e) second call is a no-op with no notify.
- `__tests__/MessageBubble.interruptedArtifact.test.tsx`: content `'Here is the page.\n\n```html\n<!-- @artifact -->\n<!DOCTYPE html>\n<html><body>'`.
  1. Empty store, `finishReason: 'stopped'`: no raw html, one interrupted card, banner, no toast.
  2. Store seeded with the same id as a cloud copy and as a persisted engine copy (the reload case; this is the case the first draft missed), message `finishReason: 'stopped'`: card flagged, banner shown, raw block hidden.
  3. Same seeding, message `metadata.truncated: true` and no `finishReason` (retry then reload): same result.
  4. No stopped or truncated marker and no stored artifact: raw block still shown.
  5. `awaitingApproval` message with `truncated: true`: no retention, behaviour unchanged.
  6. Seeded with a deleted cloud copy: 'blocked', raw block stays.
  7. First render after `isStreaming` flips false with `finishReason: 'stopped'`: the transcript never contains the raw block (assert on the first committed render, not after effects).
- `use-streaming-artifact.test.ts`: cold stopped mount retains once, no toast; live 'preserved' still toasts; `awaitingApproval` retains nothing; cold mount twice does not notify twice.
- Cause 4: one test that an aborted request logs at info, if 3d is done.

## 5. Person-style check
Rebuilt local app, seeded Ultra and Free accounts, test sign-in.
1. Ultra: new chat, type "make a small live sum html page", Send. Wait for the card. Type "add a reset button to the Live Sum page", Send, and click Stop once the code is growing in the panel.
   Must see: one "Live Sum" card with the partial banner and "Response stopped" with Try again. No code block with Copy/Edit/Download and no preview strip in the chat body, and none flashing for a frame (record or step through).
2. Reload the page, signed in, with the partial already pushed to the cloud (wait for the sync indicator). Same view, same single card, banner present. Repeat once with the browser storage cleared before reload (cloud copy only), and once offline (local copy only).
3. Click Try again, then reload within 1 s. Must see no half raw block: the card with the banner, plus "Continue generating" (that row is shown because the saved turn is truncated with no finish reason, `ChatMessageList.tsx:1355-1357`). Never a blank preview.
4. Let one edit finish. Must see the card selected on open and the stepper counting every "Live Sum" in the chat. After step 1 left a partial in the same chat there are three members (original, partial, finished), so expect the finished one last (`v3/3`); in a fresh chat with one finished edit expect `v2/2`. Why: the streaming sync selects the new id (`use-streaming-artifact.ts`, `selectArtifact` on first block) and `artifactLineage` orders by `createdAt` (`artifact-lineage.ts:24-45`). I did not run this; this step is the check.
5. Free account: repeat step 1. Same result, no blank white preview.
6. Denied/failed case: with the provider key blanked in `.env.local`, send an artifact request. Must see the plain error message, not code.
7. Check the unmarked case by sending several edits; if one comes back as an html block without a card, it must show as a normal code block with a working preview, not half a page.

## 6. Compatibility and rollback
- No stored data, schema or API change. Old messages: those with a stopped or truncated unclosed fence now get a card (3b) and hide the raw block (3c); other old messages are unchanged.
- Cold flag: pushes nothing (3a). A cold retain of a missing id ('created') is one new local artifact that the existing sync pushes like the live path (same derived id, so it upserts). Not checked: whether a person who deleted a local-only partial card sees it return on reload (a cloud copy is protected by its tombstone, `:707-709`). Check this in step 2 of the person check.
- Rollback: revert the three web files (store, hook, MessageBubble); nothing else depends on them.

## 7. Owner
Question: when the model replies with a full html page but leaves out the artifact marker, should it still become a card?
- Facts: `explicit-v1` was chosen so ordinary code never becomes an artifact (`artifact-derivation.ts:35, 178-186`). A model slip loses the card; the person still sees a working preview but no panel, no versions. The policy name is stored per message and read by about 20 files plus mobile.
- Recommendation: yes for a complete page (`<!doctype html` or `<html` root, or `<svg` root) in a new stamped policy `explicit-v2` applied only to new turns, so old messages do not change. It is a larger change (server persistence, branch/sync routes, mobile derivation) and should be its own task. Until you decide, do nothing.
No credential or production setting is needed.

## 8. Overlap
- `git diff HEAD --stat` in web-lane and in ~/Desktop/agiworkforce is empty for `artifacts-store.ts`, `MessageBubble.tsx`, `use-streaming-artifact.ts` and `stream-transform.ts`; `git log origin/main..HEAD` for them is empty in the live checkout. Build on origin/main.
- Other wave2 designs also mention `MessageBubble.tsx` (SLOW-FIRST-WORDS, SEARCH-STOP-AND-CAP, RETRY-WRONG-TURN). Keep this edit to the `settledPartial`, `unfinishedBlock` lines and rebase before the commit.

## 9. Review response
Blocker 1 (reload with a cloud copy): right, and wider than stated. Checked: `retainPartialArtifact` returns 'unchanged' or 'preserved' for any known id without touching the side map (`artifacts-store.ts:700-711`); the side map is cleared on rehydrate (`:491`) and is not in the persisted shape (`:483-510`), so even a local-only partial that came back from localStorage loses its flag. The push item has no interrupted field (`:253-268`). Fix: a store action that sets only the side entry (3a), called by the hook on the cold path and on 'unchanged' (3b). It does not change content, so `supersedesCloudCopy` still skips the push (suggestion 1, checked at `:238-250` and `:1068-1070`). I did not add an interrupted field to the wire: the shared artifact wire is shared with mobile and the flag is derivable from the message, so there is no new data to keep in sync.

Blocker 2 (flash and dependence on the flag): right. The hook retains in an effect (`use-streaming-artifact.ts:55-78`), after the first post-Stop render. Fix: hide on the message's own state (3c). The first post-Stop render already carries `finishReason: 'stopped'` because `handleStreamError` sets it with `isStreaming: false` in one update (`useChatStream.ts:6140-6150`). The "keep the raw block if no card exists" condition is kept by `retentionBlocked`, set only when retention returns 'blocked'. A one-frame gap with neither card nor block can occur between the first render and the effect for a cold open; that is a card appearing, not a raw block flashing. The first-render test (case 7) pins it.

Blocker 3 (retry then reload is not 'stopped'): right. Traced: a client leave goes through the catch at `stream-transform.ts:709` and `persistAssistantTurnSnapshot(true, request.signal.aborted)` at `:750`, or `cancel()` at `:951`, both with `stoppedByReader` true. `persistAssistantTurnSnapshot` omits `finishReason` when no wire reason was seen and the reader stopped it (`:571-574`), and writes `truncated: true` (`assistant-turn-persistence.ts:320-324`). The stopped marker is written only for a cancelled agent run (`stopped-run-turn.ts:12-40`), and the client's own save writes it only when its abort handler runs (`useChatStream.ts:6146`), which a reload does not allow. This also explains screens 14 and 15: with no finish reason an unclosed fence reads as truncated (`continue-generation.ts` `looksTruncated`), so "Continue generating" shows and "Response stopped" does not. The gate now includes `metadata.truncated === true` (3c), excluding `awaitingApproval`. The retry-then-reload screens are fixed by the design, and step 3 of the check no longer passes either way: it must show the card. The server row is not read here (no database access); the claim rests on the code above.

Suggestions: 1 done (above). 2 kept: the optional log change leaves billing alone. 3 done: step 4 now names the lineage ordering and the three-member case, and says it was not run. 4 done: tests 2, 3, 6 and 7 in section 4 seed the store.
