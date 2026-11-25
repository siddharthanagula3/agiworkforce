---
id: "DOC-70-qa-defects-root-causes-search-stop-and-cap"
type: "root-cause"
title: "SEARCH-STOP-AND-CAP"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# SEARCH-STOP-AND-CAP

Basics: W-5 (Free, 12 HTML spec changes with a link each, Stop during "Searching the web", screenshot 14-stopped.png) and W-11 (Ultra, project chat, lighthouse request, 22-stopped.png). Code read at ~/.cache/agi-audit/worktrees/gap-read-main (all paths below are relative to it). The web-lane worktree and the live checkout have no diff in any file named in section 3 (checked with git diff --stat and git log origin/main..HEAD per file).

## 1. What the person sees today / what they should see

Today (W-5): after Stop the activity shows the header "Search stopped", five rows "Searching the web" in amber with "Partial, see body", a row "Search limit reached" (with "Show more") between the second and third search rows, a grey notice "Web search didn't return results for this turn, so the answer relies on the model's own knowledge." with Retry, then "Response stopped." with "Try again". There is no answer text. In the Work panel (W-11) the same rows are red.

Should see: the person pressed Stop, so Stop is the only story. Header "Search stopped"; the search rows say "Stopped" in a calm muted colour (not amber, not red, not "see body" when there is no body); no "didn't return results / relies on own knowledge" notice, because nobody answered; "Response stopped." with "Try again". If the turn used its search allowance before Stop, one plain row says so in the person's words (wording and place owned by PROJECT-CHAT-AS-WORK.md, not repeated here). Nothing of this depends on the plan, so no Upgrade message applies. A reload shows the same stopped state (the stopped finish reason is already stored: MessageBubble.tsx:2054, 2225).

## 2. Causes

1. Amber "Partial, see body" rows (red in Work panel) after a user Stop. Product defect.
   - The OpenAI translator emits a search's result only at first text or completion (packages/ai/providers/openai/src/stream-responses.ts:446-453, 592), so rows are still running when Stop lands. Log 7586: 5 web_search_call.in_progress, 4 completed, emitted.text false; log 7587 stop_reason cancelled.
   - finishAgentActivityLocally turns every running tool row into 'cancelled' (packages/client/client-runtime/src/agentActivity.ts:1058-1086). ToolCallCard maps 'cancelled' to 'partial' (packages/ui/unified-chat/src/components/ToolCallCard.tsx:226-227), which InlineToolCall prints "Partial, see body" in the warning colour (InlineToolCall.tsx:253-254, 266-267, icon 230). The Work panel StatusIcon paints 'cancelled' with the danger colour (apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:176-178). A choice the person made is shown as a partial result or an error.
   - Skeptics' point that the provider finished 4 of 5 is true but irrelevant: with no answer text there is nothing to "see", and showing the rows as Stopped is correct either way.
2. "Web search didn't return results ... model's own knowledge" next to "Response stopped." Product defect, confirmed by both skeptics.
   - webSearchNoticeFor returns null when producedNoVisibleOutput (packages/ui/unified-chat/src/lib/web-search-notice.ts:21), but MessageBubble.tsx:2225 deliberately returns false for a stopped turn, so the guard is off exactly then and line 36 yields 'no-results'. Mounted at MessageBubble.tsx:3650-3657. Fixing producedNoVisibleOutput instead would change the empty-placeholder behaviour for stopped turns, which is intended (2225), so the notice needs its own stopped input.
   - Same shared function is used by mobile: apps/mobile/src/features/chat/components/messageTurnNotices.ts:78-98. Mobile has `stoppedByUser` (MessageBubble.tsx:1953) so the same wrong notice is probably reachable there; not run.
3. "Search limit reached" row, five searches against a cap of three. Part product defect (wording and placement), part provider limit.
   - Cap default 3 (20 in research), env AGI_NATIVE_SEARCH_MAX_USES (request-processor.ts:2542-2560). Counting is in tool-loop.ts:6965-6990: counted as each hosted search starts, row emitted mid-step when the count hits the cap, tool withdrawn for the next step only. The skeptic is right that this is not "only between steps": the row appears while the step streams, which is why it sits between search rows 2 and 3. One OpenAI step can still run more hosted searches than the cap (log 7586: five); no per-request limit is sent to the provider (I found none in packages/ai/providers/openai; whether the provider API offers one: not verified here). That overshoot is a provider/model behaviour; the cap is a deliberate cost control (AGENTS.md section 7) and stays.
   - Log 7419 (cap 3) is a different turn (the stopped step at 7586 still lists the search tool), so the cap line for the stopped W-5 turn is not identified. In W-11 the cap line is 31063.
   - Row text: the detail is a sentence written for the model ("Answer now using the results you already have...", web-search-tool.ts:578-584) shown to the person. Already designed in PROJECT-CHAT-AS-WORK.md section 3; follow it.
4. Local test limits: none apply to causes 1 to 3. Provider key, scaled rate limits and no scan do not change them. The Free-limit banner above the composer in 14-stopped.png is a normal Free allowance state, not part of this item.
5. W-11: no answer text on screen after Stop, 7 paragraphs after reload. Not traced; product defect likely, unconfirmed. NOT FIXED by this design: see section 9.
   - Log: a step with 125 output_text deltas and finish stop at 14:21:52, then stop_reason cancelled at the same instant (line 31559 region). The client saved the abort with the text it held, which was empty (apps/web/lib/hooks/useChatStream.ts:6141-6170), while the server stored text. Why the client held no text although the server had 125 deltas is not established (a buffering or slow-first-words effect is possible; see SLOW-FIRST-WORDS.md and RELOAD-MID-ANSWER.md). I will not propose code for it. The person-style check below decides whether it reproduces; if it does, open a separate item that starts at the client text buffer before the stop handler.
   - The red "Search limit reached" in the Work panel: the cap row is emitted with status 'completed' (tool-loop.ts:6987), so the red one is a different row or a cancelled copy; not traced. Fix 3a removes the red for cancelled; re-check.

## 3. Change

Smallest change: three small edits in shared code, one edit in web. No refactor needed.

### packages/ui/unified-chat/src/components/InlineToolCall.tsx (shared: web, desktop, Chrome, VS Code)
Add a status that means "the person stopped it".
```ts
export type InlineToolCallStatus =
  'pending' | 'running' | 'awaiting-approval' | 'success' | 'error' | 'partial' | 'stopped';
// labelSuffix:  case 'stopped': return 'Stopped';
// colorClassForStatus: case 'stopped' falls to the muted branch with 'pending'
// icon: reuse the 'partial' CircleSlash but with the muted colour var(--chat-text-muted)
```
Why: 'partial' means "there is a body to read"; a stopped step has none. Colour tokens already exist (`--chat-text-muted` is used in the same file); no new design value.

### packages/ui/unified-chat/src/components/ToolCallCard.tsx:226-227
```ts
case 'cancelled': return 'stopped';
```
Expired approvals still map to 'partial' (lines 217, 220): unchanged. Input-request rows: AgentActivityTimeline.tsx:954-959 gives 'cancelled' only to a row that still holds its inputRequest while the activity is no longer paused or awaiting approval (isWaitingForInput, line 116-121). An answered request loses its inputRequest in the reducer (packages/client/client-runtime/src/agentActivity.ts:1000), so it takes the entry's own status and never reads "Stopped" because of this change. See Review response.

### apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:176-178
Stop is not an error:
```tsx
if (status === 'failed') { return <CircleAlert ... text-danger /> }
```
'cancelled' then falls to the final muted Circle. Keep 'partial' in the warning branch.

### packages/ui/unified-chat/src/lib/web-search-notice.ts (shared with mobile)
```ts
export interface WebSearchNoticeTurn { ...; stopped?: boolean; }
if (turn.stopped) return null;   // after the producedNoVisibleOutput line
```
Optional field, like declinedSearch, so no caller breaks; each caller passes it. Fail-closed reasoning: silence is the safe default for a stopped turn.

### apps/web/features/chat/components/messages/MessageBubble.tsx:2474-2506
Add `stopped: message.metadata?.finishReason === 'stopped'` to the webSearchNoticeFor input and `message.metadata` is already in the dependency list. Do not touch producedNoVisibleOutput (2225).

### apps/mobile/src/features/chat/components/messageTurnNotices.ts:78-98 and its caller
Pass `stopped: input.stoppedByUser` (add the field to WebSearchNoticeInput; MessageBubble.tsx:1953 already computes it). Same root cause, per the bug-sweep rule. Desktop and Chrome mount the shared MessageBubble paths through packages/ui; they get 1 to 3 from the package.

### Cap row
No further code here. Apply PROJECT-CHAT-AS-WORK.md section 3 ("lib/web-search/web-search-tool.ts" wording and tool-loop.ts:2203 summary) and update its tests there. If that item chooses to keep "Show more", fine; if it drops the detail, also delete the unused nativeSearchBudgetExhaustedMessage import at tool-loop.ts:340. I add one constraint: the summary must be a past-tense fact in plain words and read the same whether or not the person pressed Stop.

Not changed on purpose: the search-result timing in stream-responses.ts (an earlier "completed" event would make four rows green before Stop; it risks sources arriving without text and is not needed for a correct Stopped display); the cap value; any provider limit.

## 4. Regression check
Pure functions make these cheap. None touches money, sign-in, permissions or stored data.
- packages/ui/unified-chat/src/lib/web-search-notice.test.ts: stopped true with attemptedSearch and no sources returns null; stopped false still returns 'no-results'.
- InlineToolCall.test.tsx: add 'stopped' renders "Stopped" with no warning class; keep the existing 'partial' test (line 115) as is.
- ToolCallCard test: 'cancelled' renders "Stopped"; expired approval still renders partial.
- AgentActivityTimeline test: a row whose input request was answered (input-resolved, outcome not cancelled) does not read "Stopped"; a row left unanswered after Stop reads "Stopped".
- A WorkSessionPanel status icon test only if one already exists; do not weaken it.
- apps/mobile/__tests__/messageTurnNotices.test.ts: stopped passes through.

## 5. Person-style check (rebuilt local app, seeded accounts)
1. Free account: new chat, turn Web search on, type "List 12 changes in the HTML spec this year, one link each" and send. When "Searching the web" shows, click Stop.
   Must see: header "Search stopped"; search rows say "Stopped" in a muted colour, no amber, no "Partial, see body"; no grey "Web search didn't return results" notice; "Response stopped." with "Try again". If a limit row appears it is plain words. Reload: same screen. Click Try again: a new answer streams.
2. Ultra account, project chat, the 12-paragraph lighthouse request with search on, click Stop at "Searching the web". Open the Work panel. Must see no red rows, no sentence addressed to a model. Wait 20 seconds, reload: whatever text the server saved appears; note whether the stopped screen showed text before reload (decides cause 5).
3. No Stop: same request, let it finish. Must see answer with sources, no stopped wording, no notice.
4. Failure case: blank the search provider key in apps/web/.env.local, ask a web question, do not Stop. The existing "search unavailable" wording stays; no "Stopped" rows. Denied case: a plan or account without web search sees the existing Upgrade message, unchanged.
5. A web question that truly returns no sources without Stop still shows the "didn't return results" notice (the guard is only for Stop).
6. Mobile (simulator): stop a search turn; no "didn't return results" notice.

## 6. Compatibility and rollback
No API, schema or stored-data change. Old stopped messages are re-rendered with the new label and without the false notice, because the state is derived from stored finishReason and activity entries. A new optional field and a new union member only; rollback is a plain revert of the commit. The 'stopped' status must be handled in every exhaustive switch over InlineToolCallStatus (type-check will list them).

## 7. Owner
None for this item. For information: whether production sets AGI_NATIVE_SEARCH_MAX_USES is unknown (cannot read production settings). Recommendation: leave the default of 3; raising it costs more per search-heavy turn, and a request for 12 linked items is the case where the person is better served by the answer saying which items it could not confirm.

## 8. Overlap
- web-lane worktree: no diff in any file above.
- Live checkout: no uncommitted or unpushed change to any file above (checked per file).
- Same-wave docs: PROJECT-CHAT-AS-WORK.md edits web-search-tool.ts, tool-loop.ts:2203 and their tests (cap row); do not touch those files here. ARTIFACT-AFTER-STOP.md edits MessageBubble.tsx near 1510 and the artifact sync; my MessageBubble edit is a one-line addition at 2474-2506, so apply both in the same pass or rebase; they do not touch the same lines. RELOAD-MID-ANSWER.md owns useChatStream.ts recovery; cause 5 stays out of it until reproduced.

## 9. Follow-up item (cause 5, W-11 stays failing until done)
Named item: STOP-KEEPS-TEXT-ON-SCREEN. This design does not fix W-11. If check 5.2 shows no answer text on the stopped screen but text after reload, W-11 still fails and must not be released as passing. Start point: the client stores finishReason 'stopped' with the text it holds (apps/web/lib/hooks/useChatStream.ts:6141-6170, content falls back to EMPTY_KEPT_ASSISTANT_CONTENT at about line 6163), while the server had streamed 125 output_text deltas and finished (log region line 31559). Find why the client message had no content when Stop landed (text buffering before it reaches updateMessage), and how the server's stored text should replace the client's on stop. Owner of the code: RELOAD-MID-ANSWER.md / SLOW-FIRST-WORDS.md; hand them this evidence. A release gate: W-11 stays a failing basic until that item passes the person-style check.

## 10. Notes added from review
- Desktop, Chrome and VS Code: the shared hook stamps finishReason 'stopped' only when content is non-empty (packages/ui/unified-chat/src/hooks/useChat.ts:1549), so an empty stopped turn there has no 'stopped' flag. The producedNoVisibleOutput guard still hides the notice there. Do not "fix" this; the new `stopped` field is an extra guard, not the only one.
- WorkSessionPanel.tsx:188 is the only place that makes 'cancelled' red; before the change, grep for other consumers of TaskDockStepStatus and any test asserting red for cancelled.
- The red "Search limit reached" row is not traced (the cap row is 'completed', tool-loop.ts:6987). After the change, open the Work panel and confirm no red row is left; if one is, trace it before release.
- OpenAI can run 5 hosted searches in one step against a cap of 3; left as a provider behaviour and cost control.
- Add a mobile test that messageTurnNotices passes `stopped` (apps/mobile/__tests__/sharedChatEntries.test.ts:258 calls webSearchNoticeFor directly; the optional field keeps it valid).

## Review response
Blocker 1 (answered input rows would read "Stopped"): the premise is wrong for this code, the concern is partly right. When the person answers, the reducer removes inputRequest and sets the entry running (packages/client/client-runtime/src/agentActivity.ts:992-1004), so AgentActivityTimeline.tsx:954-957 yields undefined and the row uses toToolStatus (line 389-406), not 'cancelled'. The 'cancelled' branch (line 959) only applies to a request still unanswered after the activity left paused/awaiting-approval, which is a stopped or ended run, where "Stopped" is true (and "Partial, see body" was wrong). I did not give it a new status, because that would add a second meaning to fix a case that does not occur. I corrected section 3 (it wrongly said "answered") and added a test that pins both cases, so the claim is checked rather than assumed. If that test finds an answered row reading "Stopped", then change line 959 to 'complete' for rows with a non-cancelled resolution.
Blocker 2 (cause 5 left unfixed): right. Added section 9 with a named follow-up and a release gate; W-11 is not claimed fixed by this design.
Suggestions: all taken in section 10 (and the test list in section 4).
