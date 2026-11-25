---
id: "DOC-70-qa-defects-root-causes-work-free-and-reload"
type: "root-cause"
title: "WORK-FREE-AND-RELOAD"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# WORK-FREE-AND-RELOAD

Basic W-15 (multi-step task in Work, finished result). Paths are relative to `apps/web` in the clean tree `~/.cache/agi-audit/worktrees/gap-read-main` unless stated. Nothing was run, built or edited. Test runs: Free `agi-dev-free+clerk_test@example.com` (evidence `.../runs/W-15/browser/free/20261124T1946Z-f1`), Ultra `agi-dev-ultra+clerk_test@example.com` (`.../subscribed/20261124T1946Z-s2`). Log: `~/.cache/agi-audit/web-lane/logs/server.log`.

The first diagnosis was cut off after the reload item, so the title cause (symptom 4) is my own trace. The skeptics are right on three points, and I use their corrections: the overwrite alone gives one scaffold bubble (the second bubble needs the lost delete), the stale card and doubled Progress rows come from the lost delete, and the log holds no request bodies.

## 1. What the person sees today / what they should see

Today:

1. Free: no Chat/Work switch in the composer, and nothing says Work needs a paid plan. The project's Work tab says "Switch a chat in w-15-f1 dispatch to Work and its runs will be listed here." (`06s.png`), though no switch exists. The task ran as a plain project chat. The answer arrived in about 4 s with a card "Cedar-Bay-Dispatch-Summary.txt" carrying an "Example" chip, no link, and the reply "...downloadable summary are ready below." (`12s.png`). Clicking the card does nothing.
2. Ultra, after Start work, two Allow-once approvals and a reload: an extra user bubble shows `[attached file: route-brief.pdf (application/pdf)]` and "Work through this plan in order: 1. Read ... 2. ... When you begin a step, first write a line of its own that starts with "Step N:"" (`18-light-scrolled-up.png`).
3. Same reload: the old plan card shows "Add a step / Start work / Cancel" again, and Progress lists the request and Plan twice (7/10 became 9/12).
4. Same reload: the chat is retitled "Please attach the route brief so I can identify the station..." although the file was attached (`11-after-reload.png`).

What they should see (the standard):

- Free or Basic: the Chat/Work switch is present, Work is marked as needing a plan, and pressing it opens the existing upgrade or waitlist flow with the sentence "Your plan does not include AGI Work. Upgrade to ... to use it." (same wording as `billingPlanCapabilityUpgradeMessage`). The project Work tab says the same and offers the same button. Nothing is sent, nothing errors.
- A file card that is not a real file says plainly that it is a preview, not a download, and does not read as broken.
- After any reload the conversation shows the person's own words in their bubble, the finished plan as history (no live Start work or Cancel on a finished plan), and a title that names the topic.
- Nothing about this is visibly worse than Claude or ChatGPT: their transcripts never show the internal prompt or a restartable finished plan.

## 2. Causes

### 2.1 Free: no Work switch, no message. Product defect.
- Work is gated by `canUseAgiWork`, which needs the `agi_work` plan capability. It is listed for `pro`, `max`, `max_15x`, `team`, `team_premium`, `enterprise` only (`packages/contracts/types/src/billing-catalog.ts:341,354`, `PRO_TIERS` at :337). The handshake strips it for lower tiers (`lib/services/capability-handshake-service.ts:121`).
- The switch renders only when `canUseAgiWork` is true (`features/chat/components/Composer/ChatComposerNew.tsx:6171`). An effect forces `workMode` to `chat` otherwise (:1213-1227). Nothing renders in its place.
- The gate is intended. The missing explanation is the defect. Deep Research on the same composer does explain ("Upgrade to use Deep Research", :1618, :6097) and the image button routes to `onUpgradeRequest` (:2627). Work does neither.
- A plan-stripped capability reaches the client as reason `requires_upgrade` (`packages/contracts/types/src/capability-handshake/types.ts:87`). Other reasons exist and must not be shown as an upgrade: no agentic model in the catalog (`capability-handshake-service.ts:101`), a workspace switch (`disabled_by_workspace`), an operator kill switch (`temporarily_unavailable`, :158).
- If the request were sent anyway, the server refuses with `agi_work_plan_required` (`app/api/llm/v1/chat/completions/lib/request-processor.ts:1480-1500`), so the plan gate is not bypassable. This is the denied case for the person-style check.
- Free and Basic are both affected (below `pro`).

### 2.2 Free: project Work tab promises a switch. Product defect.
- `features/projects/components/ProjectWorkPanel.tsx:119` always renders "Switch a chat in {projectName} to Work and its runs will be listed here." It reads no capability. Page: `app/chat/projects/[id]/page.tsx:1318`.
- The mobile screen has the same copy at `apps/mobile/src/features/projects/components/ProjectWorkTab.tsx:152` (not touched here; listed in section 8).
- The shared composer (`packages/ui/unified-chat/src/components/ChatInput.tsx:1583`) already shows an unavailable reason when Work is off, so desktop, Chrome and VS Code do not have the silent hide. Desktop hardcodes the sentence (`apps/desktop/src/features/v3/DesktopShellV3.tsx:256`); out of scope.

### 2.3 Free: "downloadable summary" card with no download and an "Example" chip. Provider or model limit, with a product lever.
- The Free turn is plain chat with no file tools. The model wrote an answer-UI `files` row with no `url`. A `url` is kept only if the model supplied an https link (`lib/services/answer-ui-tool-service.ts:1259-1264`); a model with no file tool has none to give.
- The card draws a non-link `div` and an "Example" chip for a url-less item (`features/chat/components/messages/cards/answer-ui/AnswerUiCard.tsx:652-690`). The chip is honest but unexplained ("Example" of what), and the reply text ("ready below") is the model's own claim, which the product cannot control.
- The prompt section that offers `files` rows says "name | kind | note rows for actual files" (`lib/prompts/chat-system-prompt.ts:772`). That line lives in a published, hash-locked prompt version (versions 1 to 17, `CHAT_SYSTEM_PROMPT_VERSIONS` at :1145-1165; pinned default 6). Editing it means a new version, lock regeneration, evals and a rollout choice. I do not propose that here (section 7).
- Not verified: the log carries no request bodies, so which tools the Free turn was offered is inferred from the plan (Free has no `canUseCloudExecution` or Work). The Free tester notes the activity shows only "Laying out the answer 40ms" (`10-activity.png`), which agrees.

### 2.4 Ultra: scaffold text in the user's bubble after reload. Product defect (code path proved, overwrite not seen at runtime).
- Start work sends the plan as a replacement turn with a new user message id (`features/chat/pages/WebChatPage.tsx:6388-6402`).
- The tool loop appends the work directive to the last user message in memory (`app/api/llm/v1/chat/completions/lib/tool-loop.ts:6298-6304`; text in `lib/agiwork-plan.ts:218-224`). The hydrated attachment header (`lib/chat-attachment-hydration.ts:103-105`) is already in that message.
- Each approval pause saves a checkpoint holding those mutated messages. The checkpoint request keeps every field of the original body except `messages`, `tools`, `tool_choice`, `code_execution` (`app/api/llm/v1/chat/completions/lib/approval-checkpoint-request.ts:83-99`), so `user_message {id, metadata}` is kept. The private-key list (:34-42) does not include it.
- All four resume routes build a synthetic request through `checkpointRequestForResume` plus `checkpoint.messages` (`approve/route.ts:115`, `resume-input/route.ts:113`, `lib/tool-result-resume.ts:92`, `runs/[runId]/resume/route.ts:100`) and call `processRequest`.
- `processRequest` takes `latestUserPrompt` from the last user message of the resumed messages (`lib/request-processor.ts:3751`) and, because `user_message` is present, persists it (`:4083-4101`). The insert is an upsert on the same id: `on conflict (id) do update set content = excluded.content` (`app/api/chat/conversations/[id]/messages/lib/message-thread.ts:33-45`). The first-turn persist runs before hydration, so it saves clean text; only a resume writes the scaffolded text. This fits the screenshot byte for byte: the real prompt, then `[attached file: ...]`, then the directive.
- Server evidence: Ultra user `user_3M0LdeblZKS2Rc7c3rEUEr7tm8L`, conversation `3a26dfec-c62e-47de-a2e0-105cfb594125`, Start work at `workflow.enqueue` log line 33438 (time 1795551900561), later resumes at 33482 and 34011. No bodies are logged.
- `ProcessedRequest.userMessageId` (`request-processor.ts:1578`, set at :6899) is read nowhere else in `app/` or `lib/` (grep of all non-test files), so no server code needs `user_message` on a resume.
- Reach: any resumed turn, in or out of Work, with an attachment (header) or in Work (directive). A steer message appended as a user message would be written the same way; unverified, and covered by the same fix.
- Skeptic correction applied: on its own this gives one bubble with scaffold text in place of the real request. The second bubble in the screenshot needs 2.5.

### 2.5 Ultra: old plan card live again, Progress doubled. Test-machine limit for the trigger; product defect for the fragility.
- Start work replaces the old rows: `sendReplacingMessages` then `deleteServerMessages` issue one DELETE per replaced row (`WebChatPage.tsx:5183-5209`, `5213-5256`). Replaced ids are the old user row and the old plan row (`planRegenerateRollback`, `packages/ui/unified-chat/src/lib/regenerateReplay.ts:130-145`, which returns every id from the user message to the end of the thread).
- The log shows both DELETEs failed with 500 right after Start work: `legal_hold_preserves(uuid, text, text) does not exist` (server.log 33447, then the failed `http.server` spans at 33448 and 33452, DELETE of `/api/chat/conversations/3a26dfec-.../messages/fb868e25-...`). Migration `db/neon/0416_legal_hold_preserves.sql` was not applied to the local database. Twelve such errors exist in the log. Production is recorded at migration 0425 (owner memory; I could not read the database), so this trigger is the test machine.
- With the rows left behind, the old plan row still carries `agiWorkPlanReview.awaitingApproval=true`, and `AgiWorkPlanReview` renders Start work and Cancel from that flag alone (`features/chat/components/work-session/AgiWorkPlanReview.tsx:55-56`, `MessageBubble.tsx:2643-2649`). The old user row also stays, so the request and Plan rows appear twice in Progress. The only warning is a toast (`WebChatPage.tsx:5200-5207`).
- Product defect that remains in production: the delete is a client call after commit. A closed tab, a network drop or any failed delete leaves the old row, and a stale plan card with live buttons is dangerous: pressing Start work on it rolls back everything after the old user message (`rollbackIds` above), so a finished task and its answer would be deleted and re-run. Cancel on a finished chat is also offered.
- Unavoidable by this design: when the delete is lost, the duplicate user bubble and duplicate Progress rows remain. I found no server-side replace field to make it atomic and I do not invent one (section 7 lists it as an optional later refactor).

### 2.6 Title "Please attach the route brief ...". Product defect (prompt weakness), with a model limit behind it. My own trace.
- Titles come from a background call that sends only the first message text to a small model (`app/api/chat/conversations/[id]/messages/lib/persist-message.ts:200`, `generate-title.ts:122-165`). The log shows it ran on the first turn of this conversation (cache outcome line 33414, trace of the plan turn).
- That text is "[w-15-s2] Using the attached route brief, give me a three-item dispatch checklist ...". The titler has no file, a one-line instruction as the system turn (`generate-title.ts:56-58`) and the message bare as the user turn. A model that follows the message instead of titling it answers "Please attach the route brief so I can identify the station ...". Evidence for this: the stage-1 truncation would start with "[w-15-s2] Using ..." (`lib/chat-title.ts:21-26`, 50 characters plus "..."), not with the visible words; the visible title is 60 characters with an ellipsis, which fits `sanitizeGeneratedTitle`'s 60-character cap (`generate-title.ts:71-74`) cutting a longer reply (output limit 24 tokens, :46).
- The server does not guard against a reply-shaped title, and the update replaces the title only if it is still the stage-1 or client truncation, so the person sees the wrong title as soon as it lands (they saw it on reload).
- Not observed: the title model's raw output is not logged. Marked as inferred.
- This is not caused by the reload bugs above.

## 3. Change

Smallest set that fixes each root cause. No refactor is needed except one small shared function (3.3) so the composer and the project tab cannot disagree about who needs an upgrade.

### 3.1 `app/api/llm/v1/chat/completions/lib/approval-checkpoint-request.ts` (fixes 2.4)
A resumed turn must never write the user's message: the turn that paused already wrote it. Drop `user_message` where a checkpoint request is replayed. All four resume callers go through `checkpointRequestForResume`, and checkpoints already saved are covered because the strip happens on read.

```ts
const CHECKPOINT_PRIVATE_KEYS: readonly string[] = [
  CONTEXT_POLICY_SNAPSHOT_KEY,
  ...existing keys,
  'user_message',
];
```
`replayableCheckpointRequest` and `checkpointRequestForResume` already filter on this list, so `buildApprovalCheckpointRequest` stops saving it too. Without `user_message` the persist block at `request-processor.ts:4083` is skipped and the existing row stays as written. The Zod rule "user_message requires conversation_id" is not hit. `conversation_id`, `assistant_message_id` and the assistant parent stay, so the resumed answer is still saved under the right parent.

Why not clean the text instead: the directive can be pushed as its own user message (`tool-loop.ts:6304`) and steer messages may do the same, so "strip the directive from the last user message" would be fragile. Skipping the write is exact.

### 3.2 `features/chat/components/messages/MessageBubble.tsx` (fixes 2.5, product part)
Only the newest assistant message can hold a live plan decision.

```tsx
<AgiWorkPlanReview
  steps={message.metadata.agiWorkPlan}
  awaitingApproval={isLatestTurn && message.metadata.agiWorkPlanReview?.awaitingApproval === true}
  ...
/>
```
`isLatestTurn` is already passed by `ChatMessageList.tsx:863` (assistant and last message) and is already in the memo comparison (`MessageBubble.tsx:4353`). Retry of a failed step on older runs is unchanged because it does not use `awaitingApproval`. A plan the person ignored by typing a new message stops being live, which matches how the replace flow treats it.

### 3.3 New `features/chat/lib/agiwork-access.ts` (used by 3.4 and 3.5)
One owner for "Work is off because of the plan". Pure, so it is cheap to test.

```ts
import { canUseBillingPlanCapability, type BillingPlanTier } from '@agiworkforce/types';

export function agiWorkNeedsPlan(input: {
  policyReady: boolean;
  granted: boolean;
  tier: BillingPlanTier;
}): boolean {
  return input.policyReady && !input.granted && !canUseBillingPlanCapability(input.tier, 'agi_work');
}
```
`tier` is the entitlement tier already computed in the composer (`ChatComposerNew.tsx:1047`, free when a free trial is on). Other denial reasons (no agentic model, workspace off, kill switch) return false, so they never show an Upgrade.

### 3.4 `features/chat/components/Composer/ChatComposerNew.tsx` (fixes 2.1)
Keep `canUseAgiWork` as is (:1058-1062). Add beside it:

```ts
const agiWorkNeedsUpgrade = agiWorkNeedsPlan({
  policyReady: billingPolicyReady,
  granted: agiWorkCapability,
  tier: entitlementTier,
});
```
In the switch block (:6171) render when `canUseAgiWork || agiWorkNeedsUpgrade`. In the locked case the Work segment is pressed-false, carries `aria-disabled`, the lock glyph and the title `billingPlanCapabilityUpgradeMessage('agi_work')`, and its click handler does not call `handleWorkModeChange`:

```ts
const handleLockedWorkPress = useCallback(() => {
  if (onUpgradeRequest) onUpgradeRequest();
  else setLocalNotice(billingPlanCapabilityUpgradeMessage('agi_work'));
}, [onUpgradeRequest]);
```
`onUpgradeRequest` is the existing prop wired to the upgrade and waitlist flow (`WebChatPage.tsx:7690`, `useUpgradePlanFlow`), so the sales pause and waitlist text stay owned there. The Chat segment stays selected; the existing effect at :1213-1227 keeps `workMode` on `chat`, so the denied send never happens. Copy comes from the catalog function, not a literal; the segment label reuses `WORK_MODE_LABELS` (product name from the registry, not a new string). The approvals control at :6209 still needs `canUseAgiWork`.

Note: this file has a sibling change (section 8). The two edits are in different places: the sibling removes the project-implies-Work effect and rewrites the project tab condition; this one adds the locked state of the switch.

### 3.5 `features/projects/components/ProjectWorkPanel.tsx` and `app/chat/projects/[id]/page.tsx` (fixes 2.2)
Add an optional prop and render a plan message instead of the promise when Work is not on the plan:

```tsx
export interface ProjectWorkPanelProps { projectId: string; projectName: string; onUpgradeRequest?: () => void }
...
const needsPlan = agiWorkNeedsPlan({ policyReady, granted: useCapability('canUseAgiWork'), tier });
if (needsPlan && state.runs.length === 0) {
  return (
    <div ...>
      <p>Work is not on your plan</p>
      <p>{billingPlanCapabilityUpgradeMessage('agi_work')}</p>
      {onUpgradeRequest && <button onClick={onUpgradeRequest}>Upgrade</button>}
    </div>
  );
}
```
`policyReady` and `tier` come from `useBillingStore` exactly as the composer does. The page already owns `handleUpgradeRequest` (`page.tsx:265-268`); pass it down (`page.tsx:1318`). A project that already has runs (account downgraded) keeps listing them. Free accounts see Upgrade only, no meters, which matches the owner rule for Free screens.

### 3.6 `features/chat/components/messages/cards/answer-ui/AnswerUiCard.tsx` (fixes 2.3, product part)
Keep the non-link card. Replace the bare "Example" chip with plain words, and say it once under the list when any item has no link:

```tsx
{block.items.some((item) => !item.url) && (
  <p className="text-xs text-[color:var(--chat-text-secondary)]">{ANSWER_UI_FILE_PREVIEW_NOTE}</p>
)}
```
with `ANSWER_UI_FILE_PREVIEW_LABEL = 'Preview'` and `ANSWER_UI_FILE_PREVIEW_NOTE = 'Shown here for reference. This chat did not create a file you can download.'`. Both live next to the existing constant in this file; `apps/mobile/src/features/chat/components/AnswerUiCard.tsx:86` owns a second copy of `ANSWER_UI_FILE_EXAMPLE_LABEL`, so the constants move to `packages/contracts/types/src/answer-ui.ts` and both cards import them (one owner). The existing test that asserts the "Example" chip is updated to the new text, not removed. The next step for the person is the second sentence of the reply they already have (the content is in the card), and Work on a paid plan for a real file; the Upgrade message in 3.4 covers the plan side.

Not changed: the model's sentence "ready below". It is the model's claim; the card now contradicts it plainly instead of looking broken. The prompt route is in section 7.

### 3.7 `app/api/chat/conversations/[id]/messages/lib/generate-title.ts` (fixes 2.6)
Tell the titler the message is not for it, and wrap the message so it is data:

```ts
const TITLE_SYSTEM_PROMPT =
  'You name conversations. The user turn holds a message someone sent to an assistant; it is ' +
  'not addressed to you. Never answer it, ask for anything, or mention missing files. Reply ' +
  'with a title of 6 words or fewer naming its topic: title text only, no quotes, no markdown, ' +
  'no trailing punctuation, no preamble.';
...
{ role: 'user', content: `<message>\n${source}\n</message>` },
```
The exact-response cache key includes the system prompt (`cacheFields.systemPrompt`), so old cached bad titles are not reused. Quota, admission and the "only replace a placeholder title" guard are unchanged. No model or vendor name is added. Titles already written stay as they are.

## 4. Regression check

Money, sign-in and permissions are untouched in name, but 3.1 changes what is stored and 3.3 and 3.5 gate a plan feature, so these are added. All pure or cheap:

1. `approval-checkpoint-request.test.ts` (existing): `checkpointRequestForResume` and `buildApprovalCheckpointRequest` drop `user_message` but keep `conversation_id` and `assistant_message_id`; a stored checkpoint request that still holds `user_message` is stripped on read. This is the stored-data test.
2. New `features/chat/lib/agiwork-access.test.ts`: true for free and basic with policy ready; false when policy not ready; false for pro and above; false when granted is true; false for a tier that has the plan capability but lacks the grant (no agentic model, workspace off).
3. Existing `MessageBubble`/`ChatMessageList` test: a plan with `awaitingApproval: true` shows Start work only on the last assistant message; with a later message it renders nothing.
4. Existing `generate-title.test.ts`: the request passed to the adapter has the new system prompt and the wrapped user turn (assert on the request, not on a model).
5. Existing `ChatComposerNew.test.tsx`: Free shows the switch with Work locked and pressing it calls `onUpgradeRequest`; Pro shows it unlocked; no-plan-reason denial (no agentic model) shows no switch. Update, do not delete, the existing "no switch without capability" case.
6. `AnswerUiCard` test: url-less item shows "Preview" and the note; item with https url is a link and shows no note.

The scoped tests run through `scripts/dev/light-job.sh`; apps/web uses its own Vitest major, so run through the package script.

## 5. Person-style check

Rebuilt local compiled app (not `next dev`), local database with the missing migrations applied first (`pnpm db:migrate -- status`, then apply 0416 and whatever else is pending, through `scripts/dev/heavy-job.sh`), seeded accounts, Chrome at 1280 and 390 wide.

Free (`agi-dev-free+clerk_test@example.com`):
1. Open Projects, create "free-check", open it. Composer shows Chat and Work; Work has a lock. Hover or focus shows "Your plan does not include AGI Work. Upgrade to ... to use it."
2. Click Work. The upgrade dialog or waitlist opens (whichever the flow shows today). Close it. The composer is still on Chat, nothing was sent, no red error anywhere.
3. Click the project's Work tab. It says Work is not on the plan, with an Upgrade button that opens the same dialog. The old "Switch a chat ..." sentence is gone.
4. In the project chat attach a small PDF and send "give me a three-item checklist and a downloadable summary file". First words within a few seconds. If the answer includes a file card it shows "Preview" and the note, with no click target that does nothing.
5. Reload. Same page, same answer, same card.
6. Denied case: with the browser devtools network tab, confirm no `work_mode=agiwork` request was sent from the locked switch. To cover the server answer, send one `work_mode: agiwork` request from a signed-in Free session and confirm the response carries `agi_work_plan_required`, and the page shows an upgrade message, not "Something went wrong".

Ultra (`agi-dev-ultra+clerk_test@example.com`):
7. New chat, Work, attach `route-brief.pdf`, send "Using the attached route brief, give me a three-item dispatch checklist and a downloadable summary file." Plan card in about 6 s. Press Start work. Allow once on each approval card until it finishes. The checklist and the CSV appear.
8. Reload. Scroll to the top. The first user bubble shows only the sentence typed (and the file chip). No "[attached file:" text, no "Work through this plan in order". There is one request and one Plan row in Progress. The old plan card has no Start work, Add a step or Cancel buttons.
9. The title names the topic (for example "Dispatch checklist from route brief"), not a request for the file. Check the sidebar and the header, at 1280 and 390, light and dark.
10. Lost-delete case: in devtools block the two DELETE requests to `/api/chat/conversations/<id>/messages/<id>` during Start work, reload. The old plan card has no live buttons. The duplicate request bubble is expected here and is not a failure of this change.
11. Failure case: Stop a second run at about 15 s, reload; it stays stopped and the bubbles are clean.
12. Plain chat with an attachment that needs an approval (a code-run request on a PDF in Chat with code execution on, if the account offers it): after Allow once and reload the user bubble is still the typed text.

## 6. Compatibility and rollback

- 3.1 is server-only and tolerant: checkpoints already saved with `user_message` still resume (the field is ignored). No migration, no new env.
- Rows already overwritten before this ships stay overwritten. The original text is not recoverable from the row; only the leading sentence can be recovered (section 7).
- 3.2 to 3.6 are client-only and revert cleanly. Persisted `agiWorkPlanReview.awaitingApproval` data is unchanged, so an older build shows the old behavior again with no data harm.
- 3.7 changes titles for new conversations only; the cache key changes with the prompt, so nothing stale is served.
- Rollback for each file is a plain revert; they are independent, so any one can ship alone.

## 7. Owner

1. Optional data repair (needs your decision; the fix does not depend on it). Rows already overwritten by a resume (user rows holding "...\n[attached file: ...]\n\nWork through this plan in order:...") show scaffold text in any conversation that finished before the fix. A one-off update could cut the text at the "Work through this plan in order:" marker and remove a trailing "[attached file: ...]" line, which restores the typed sentence. It is a production data change on user messages, so it is yours to approve. Recommendation: yes, run it once after the fix ships, on a copy first; if there are no real users yet, skip it.
2. Optional, later: a prompt version for the `files` guidance (2.3). A model-side line like "use a files row only for a file this chat already has; for a download you cannot create, put the content in a document the person can copy and say a real file needs Work" would reduce the mismatch, but it needs a new prompt version, lock regeneration, evals and a rollout choice, and it cannot guarantee behavior. Recommendation: not now; the card change makes the mismatch honest.
3. Optional, later: make Start work atomic on the server (a replace-turn field that deletes the old rows in the same transaction as the new user row) so a lost client DELETE cannot leave duplicates. It is a larger change to the send protocol and not needed for this basic once 3.2 is in. Recommendation: put it on the open-work list.
4. Test machine only: apply migration 0416 (and the other pending ones; the log also shows `connector_permission_generations` and `storage_targets` missing) to the local database before the person-style run. No production action: production is recorded at 0425, not verified here.

No provider credential, production setting or money decision is required for the code change.

## 8. Overlap

- `PROJECT-CHAT-AS-WORK.md` (same wave) edits `features/chat/components/Composer/ChatComposerNew.tsx` at :1213-1227 (the project-implies-Work effect), :2906-2908 and :7045. This design edits the same file at :1058-1062 (new constant) and the switch block at :6166-6210. No line is shared, but both land in one file: apply the sibling change first, then this one, and keep the effect `if (!canUseAgiWork) force chat` that the sibling keeps. The locked switch relies on that effect.
- Web-lane uncommitted edits (`~/.cache/agi-audit/worktrees/web-lane`): only one line in `request-processor.ts` (a project-context argument at :3855) and files under `app/api/chat/conversations/route.ts`, `packages/contracts/cloud-contracts`. This design does not touch `request-processor.ts`; none of its files are in the web-lane diff (checked with `git diff --stat` for each).
- Other agent (`~/Desktop/agiworkforce`, uncommitted): `ChatComposerNew.tsx` hunks at about :1005, :5516-5521, :5875, :6948 (imports and unrelated lines), so expect a textual merge there but no overlap of intent. Commit `52530d34f9` touches `response-builder.ts`, not these files. `approval-checkpoint-request.ts`, `MessageBubble.tsx`, `ProjectWorkPanel.tsx`, `page.tsx`, `AnswerUiCard.tsx`, `generate-title.ts`, `answer-ui.ts` and `billing-catalog.ts` show no uncommitted change or unpushed commit there.
- Mobile: `apps/mobile/src/features/projects/components/ProjectWorkTab.tsx:152` has the same promise copy and `apps/mobile/src/features/chat/components/AnswerUiCard.tsx:86` has its own "Example" constant. Per the bug-sweep rule these need the same change in the mobile lane; mobile v1 hides Remote Control and has no purchase path, so the Upgrade wording there is a separate owner call.
- Out of scope for this issue (other problems in the same W-15 rows, not touched): the missing `pymupdf` tool failure and its "High risk" label, the terms-of-service toast over the plan text, the attachment chip overlapping its remove button, the Progress header amber icon and unfinished step dots, red icons after Stop, the "UNKNOWN" artifact badge, the 390-wide composer placeholder, and the offline banner that stays after reconnecting.
