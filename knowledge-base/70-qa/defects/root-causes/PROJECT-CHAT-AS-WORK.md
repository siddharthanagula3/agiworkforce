---
id: "DOC-70-qa-defects-root-causes-project-chat-as-work"
type: "root-cause"
title: "PROJECT-CHAT-AS-WORK"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# PROJECT-CHAT-AS-WORK

Paths are relative to apps/web in the clean tree ~/.cache/agi-audit/worktrees/gap-read-main unless stated. Read only; nothing was run or built.

## 1. What the person sees today / what they should see

Today (Ultra tester W-11, screens 07, 11, 15, 19, 21, 22, 23):
- A plain question typed in "New chat in <project>" opens as "<title> · Work", with a "Work session" side panel, the "Describe a multi-step task..." composer text and a "Some tools run without asking" notice.
- A 12-paragraph prompt spends about 13 s on Connecting/Thinking/Searching the web. After Stop the panel shows red "Search limit reached" and red "Searching the web" rows. The "Search limit reached" row carries a sentence written to the model ("Answer now using the results you already have...").
- Project file upload and "Add text" fail with "Something went wrong on our side. Try again shortly." In the Add sources dialog the line shows twice: in the dialog and as a red banner behind it.

They should see:
- A question typed in a project opens as a normal chat scoped to that project, like Claude and ChatGPT: no dock, no "Work" in the title, the normal composer text, no autonomy notice. The project name stays visible on the composer. The person can switch to Work on purpose with the Chat/Work toggle, and the project stays.
- The chat survives a reload as the same kind of chat it was created as.
- The search cap row, if shown, is plain words for the person and never looks like a failure.
- A failed source upload shows one message, in one place, with the real reason.

## 2. Causes

1. Project chat opens as Work: product defect (a coded product decision that contradicts the owner direction that project chats are normal chats).
   - ChatComposerNew.tsx:1213-1227: with a preselected project and `canUseAgiWork`, the effect calls `setWorkMode('agiwork')`.
   - Project page handoff goes to /chat?projectId=...&handoff (app/chat/projects/[id]/page.tsx:230-260; features/projects/lib/project-chat-handoff.ts:126). The page composer has no toggle because the toggle renders only with `projectPicker` (ChatComposerNew.tsx:6166; page.tsx:1083-1088 passes only `projectId`).
   - web-chat-store.ts:2015-2051 copies the pending mode into `workModeByConversation`, so the new conversation is Work and stays Work after a reload.
   - It is locked by a comment (ChatComposerNew.tsx:1207-1212) and two tests: ChatComposerNew.test.tsx:2628 "a preselected project (URL entry) auto-enters AGI Work" and the test after it, "switching back to Chat clears the project selection (no hidden scope)".
   - Hidden-scope guard: the project tab renders only when `workMode === 'agiwork' || (!canUseAgiWork && pickerHasSelection)` (ChatComposerNew.tsx:7045), and project selection is allowed only in Work or without the capability (ChatComposerNew.tsx:2906-2908). So the "Work only" coupling is built into three places. Removing only the effect would leave a Work-capable account in Chat with a hidden project. All four spots must change together.
   - Scope in production: accounts where `canUseAgiWork` is true (paid plans with the `agi_work` capability; ChatComposerNew.tsx:1058-1062). Free, Basic and free-trial accounts already get plain project chat (1222-1223).
   - Unverified: what `workMode` the first request body carried. Request bodies are not in server.log. The handoff sends `meta.workMode` from the project page composer (project-chat-handoff.ts, WebChatPage.tsx around 2985-3010), which is `chat`; the Work state shown comes from the conversation toggles. Check this in the person-style check below.
2. About 13 s before first words, three searches: provider or model limit, with a product lever.
   - Native web search is offered on every turn (request-processor.ts:2562-2582). The model chose to ground 3 times though search was not required (server.log:30899 `web_search.required:false`; cap reached server.log:31063; Auto-model line 30889 to cap line is about 15.7 s).
   - The cap is a setting: 3 by default, one env override (request-processor.ts:2542, 2558-2561). Not a bug. Not separable from Work mode in the evidence.
3. "Search limit reached" row shows model-facing text, and red rows after Stop: product defect (text) and not fully traced (red).
   - tool-loop.ts:6970-6990 emits the row with `detail: nativeSearchBudgetExhaustedMessage(cap)` (web-search-tool.ts:578-584). That function is used nowhere else (grep: only tool-loop.ts:340 and :6986), so it never reaches the model. It is written to the model but only ever shown to the person.
   - Status of the row is 'completed' (tool-loop.ts:6987). The red icon is the dock's failed/cancelled style (work-session/WorkSessionPanel.tsx:188). The baseline row for the Stop case (screens 14, 22) says Stop happened first; the client maps a stopped turn's running rows to cancelled (packages/client/client-runtime/src/agentActivity.ts:1058). So the red rows follow Stop, not the cap itself. Which event made each red row is not traced to the end. The fix below removes the misleading text only; it does not claim to fix the Stop styling (the sibling basic with amber "Partial" rows after Stop is a separate problem).
4. Project upload and Add text fail: test-machine limit.
   - The local DB lacks migration 0419: `column "storage_targets" of relation "project_knowledge_files" does not exist` (server.log:28876-28880, 29374-29379, 29561-29565), added at db/neon/0419_project_knowledge_object_lifecycle.sql:46-48. Eight `legal_hold_preserves(uuid,text,text) does not exist` errors (server.log:33445-33447 and others) show the DB is behind by more than one migration. The generic sentence is the standard 500 mapping. Owner memory says production is at 0425, not verified here (cannot read the DB).
5. Same error twice when adding a source: product defect, production would show it on any failure.
   - features/projects/components/SourcesPanel.tsx:220-237 `handleUpload` sets the red banner (`uploadState` error, rendered at 366-382) and rethrows. AddSourcesModal.tsx:87-89 and 120-122 catch the rethrow and show it again in the dialog. Banner is needed for the two callers with no catch: the DropOverlay `onDrop` (line 814) and the file input (826), which today also leave an unhandled rejection.

## 3. Change

### features/chat/components/Composer/ChatComposerNew.tsx (shared by every surface that mounts the composer; only web passes `projectPicker`)

Smallest change: a project selection no longer implies Work. Five edits (a to e).

a. Drop the auto-entry (1213-1227). Keep fail-closed for plans without Work:
```ts
useEffect(() => {
  if (!billingPolicyReady || canUseAgiWork) return;
  if (useChatStore.getState().getComposerToggles(conversationId).workMode !== 'chat') setWorkMode('chat');
}, [billingPolicyReady, canUseAgiWork, setWorkMode, conversationId]);
```
Delete the stale comment at 1207-1212 (rewrite to nothing; code reads without it). `pickerActiveProjectId` is no longer used in the effect; remove it if unused elsewhere.

b. Let Chat mode carry a project (2906-2908):
```ts
const projectScopeSelectable = Boolean(projectPicker && !imageMode);
```
c. Show the project tab whenever a project is selected, in any mode (7045):
```tsx
{projectPicker && !imageMode && (workMode === 'agiwork' || pickerHasSelection) && ( ...
```
The tab already has a `composer-project-tab` variant (`workScopeBarVisible`), used today for Free accounts, so Chat-with-project looks like what Free users already see.

d. Switching to Chat keeps the project and drops only the working folder (2800-2811):
```ts
if (mode === 'chat') { clearFolder(); closeProjectPicker(); }
```
Why `clearFolder` stays: a folder is a Work-only working directory; a project is data scope that plain chat supports (it works today for Free).

e. Gate the picker's folder button on Work (7202). Today it renders on `canUseAgiWork && canUseWorkingDirectory` alone. With edit (c) the tab shows in Chat, so a desktop person could pick a folder in Chat, which sets `pickerFolderName` (2759) and displaces the project (2796-2798 `onSelectProject(null)`). Change the condition to `workScopeBarVisible && canUseWorkingDirectory` (`workScopeBarVisible` is `agiWorkActive` = `canUseAgiWork && workMode === 'agiwork'`, 2763-2764). `pickerFolderName` (2759) needs no change once the button is hidden in Chat, because `handleWorkModeChange('chat')` already calls `clearFolder()`.

Work stays one click away: /chat shows the Chat/Work toggle (ChatComposerNew.tsx:6166, `projectPicker` passed by WebChatPage), and picking Work keeps the project.

Not changed: the default-work-mode effect (1228-1232) still honours the person's own Settings choice; the store's `adoptPendingComposerToggles` is correct as is (it copies whatever mode the person had).

### features/chat/components/Composer/ChatComposerNew.test.tsx (update, not weaken)
- Replace "a preselected project (URL entry) auto-enters AGI Work..." with: project preselected, Work-capable account, the Chat button is `aria-pressed`, the `composer-project-tab` shows "Project or folder: <name>", and clicking Work keeps `picker.onSelectProject` uncalled.
- Replace "switching back to Chat clears the project selection" with: switching Work to Chat does not call `onSelectProject(null)` but clears the folder.
- Keep the test for plans without Work.
- New: on a working-directory surface (`canUseWorkingDirectory` true), Chat mode with a project selected shows no "Choose a different folder" button; Work mode shows it.

### lib/web-search/web-search-tool.ts:578-584 (server text; web only, nothing shared)
Say it to the person and make it read as information, not an alarm:
```ts
export function nativeSearchBudgetExhaustedMessage(limit: number): string {
  return `Searched ${limit} times for this answer. The reply uses what was found.`;
}
```
Update web-search-tool.test.ts:285 (expects 'No further grounded searches will run') to the new wording. tool-loop.ts:2203 summary: rename to a plain label, for example 'Search limit reached' to 'Used the search allowance for this answer'; update tool-loop.tool-governor.test.ts:330 and 343 (they match the summary text). Cap value stays configuration (request-processor.ts:2558). No model or vendor name appears.

### features/projects/components/SourcesPanel.tsx (shared package? no: apps/web feature only)
Split the throwing upload from the banner path so each caller reports once:
```ts
async function uploadFile(file: File) {            // throws, no banner
  setUploadState({ status: 'uploading', fileName: file.name, progress: 0 });
  try { await uploadProjectKnowledgeFile({...}); /* success path as today */ }
  catch (err) { setUploadState({ status: 'idle' }); throw err; }
}
async function handleUpload(file: File) {          // drop and file input: banner
  try { await uploadFile(file); }
  catch (err) { setUploadState({ status: 'error', message: toUserMessage(err, 'Upload failed.') }); }
}
```
Modal gets `onUploadFile={uploadFile}` and `onUploadText` built on `uploadFile` (line 298-303). Drop and the file input keep `handleUpload`. The modal shows the one message; the banner appears only for paths without a dialog. AddSourcesModal.tsx is unchanged. The Google Drive handler (`handleAddFromGoogleDrive`, 243-303) does NOT already follow this rule: its catch sets `uploadState` to error (297-300) and rethrows, and AddSourcesModal.tsx:139-141 shows the message again, so a Drive failure also shows twice. Same split: the catch resets `uploadState` to idle and rethrows (modal path, no banner). Nothing else calls it without a catch (only `onAddFromGoogleDrive` at SourcesPanel.tsx:838), so no banner wrapper is needed. Also the not-configured throw at 247-249 happens before the uploading state and is already single.

### Not changed (and why)
- Time to first words (cause 2): model behaviour. No code change; cap is an env setting (see Owner).
- Red rows after Stop: not traced; do not guess a fix. Re-check after the text change with the person-style check; if red persists, trace `agentActivity.ts:1058` and the Stop path as a separate item (the Stop basic).
- Migration 0419: not a code change.
- No refactor needed: every edit is a few lines and testable with the existing test files.

## 4. Regression check
- Composer tests above (pure render tests, cheap): project preselected does not enter Work for a Work-capable account; plan without Work stays Chat; switch to Work keeps the project.
- Message wording test (web-search-tool.test.ts) and the governor test (both updated).
- SourcesPanel: add a Drive failure test: a failing Drive POST (non-ok, no results) shows the message once in the dialog and no banner. Add a test that a global New chat clears `activeProject` (WebAppShell.tsx:303; WebChatPage.tsx:4777) so a stale project tab does not show on a plain chat.
- SourcesPanel: add a test with a failing `uploadProjectKnowledgeFile`: opening the modal and adding a file shows the message once (one element with that text), and a dropped file shows the banner once. Money, sign-in and permissions are not touched; stored data only through the unchanged upload route. No other test needed.

## 5. Person-style check (rebuilt local app, compiled build, DB with 0419 and later applied)
Seeded accounts: the Ultra account (W-11) and a Free account.
1. As Ultra: Projects, open "QA project w-11-s2", type "What is a lighthouse?" and press Enter. Must see: the chat title without " · Work", no side panel, the normal composer, no "Some tools run without asking" notice, and the project name on the composer. First words within a few seconds.
2. Reload the page: still the same plain chat.
3. In that chat open /chat?projectId=<id> in a new tab: the Chat button is selected and the project tab shows the project name. Click Work: the project stays; click Chat: the project stays, a chosen folder (if any) clears.
4. Send the 12-paragraph lighthouse prompt: if the search allowance is spent, the row reads "Searched 3 times for this answer..." in normal colour, no sentence addressed to the model, no red before Stop. Press Stop: note what colours remain (this decides the follow-up on red rows).
5. As Free: the same project chat opens as before, with the project tab visible.
6. Project page, Files: upload a small .txt. It must appear in the list.
7. Sources, Add sources, Add text: type a note, Add. It must appear.
8. Failure case: stop the database connection (or upload a file over the size limit). Add sources: the real reason appears once, in the dialog; no red banner behind it. Drag a file onto the Sources panel with the same failure: one banner, with Dismiss.
9. Denied case: sign in as a Free account and click the project tab: it still offers no Work and no error; the Work toggle is absent, no autonomy notice.

## 6. Compatibility and rollback
- Existing conversations already stored as Work stay Work (`workModeByConversation` is read as stored). Only new project chats start as Chat.
- A person whose Settings default is Work still gets Work on a new chat (the default effect is untouched).
- Handoff storage and URL params are unchanged, so an open project tab or a pending handoff across a deploy still works.
- Rollback: revert the commit; no data or migration is involved. The wording change reverts with it.

## 7. Owner
- Confirm the product call: project chats open as plain chats for Work-capable plans (what Claude and ChatGPT do). This reverses a coded decision and its comment, so record it in the owner decision notes. Recommendation: yes; Work stays one click away with the project kept.
- Local test DB: run `pnpm db:migrate -- status` on the test database and apply what is missing (at least 0416 and 0419) before retesting upload and Add text. Check the same status on production; memory says 0425.
- Optional setting: the per-turn search allowance (`AGI_NATIVE_SEARCH_MAX_USES`, default 3). Lowering it to 1 or 2 shortens plain-chat waits at the cost of fewer grounded answers. Recommendation: leave 3 until step 4 above shows how often the cap is hit in plain chat after the Work change; the 13 s may mostly be Work-mode effort and not the cap.

## 8. Overlap
- Web-lane worktree: none of the files above are edited there (checked `git diff --stat`; only request-processor.ts, a 1-line `organizationId` addition, is touched and I do not change it).
- Other agent's live checkout (~/Desktop/agiworkforce): it has uncommitted edits in ChatComposerNew.tsx (13 lines: composer-focus imports at 44, `isFocused` state removal at 1006, `onPointerDown` and `className` block around 5517-5526, `onFocusChange` removal at 5875, dictation text at 6948). My hunks are at 1207-1232, 2800-2811, 2906-2908 and 7045, so they do not collide, but both change the same file, so apply mine after that agent commits, or rebase. It also has commit 52530d34f9 on WebChatPage.tsx, useChatStream.ts and response-builder.ts; I touch none of them. No edits found by it in SourcesPanel.tsx, web-search-tool.ts, tool-loop.ts or the test files above.

## 9. Review response
Blocker 1 (folder button reachable from Chat): right. The button at ChatComposerNew.tsx:7202 gates on `canUseAgiWork && canUseWorkingDirectory`, not on mode, and `handlePickFolderFromPicker` (2790-2798) clears the project once a folder is chosen. Fixed by new edit (e) and a new composer test.

Blocker 2 (Drive handler): right; my earlier line was wrong. SourcesPanel.tsx:297-302 sets the error banner then rethrows, and AddSourcesModal.tsx:139-141 shows it again. Fixed in section 3 (catch resets to idle and rethrows) and a Drive failure test added to section 4.

Suggestions taken: (1) the first-request `workMode` stays marked unverified; the 13 s search wait is not claimed to be Work effort until the person-style check shows the request body. (2) The "anything it could not confirm is said so" sentence is dropped; the text now says only what happened. (3) Not adopted as a requirement: dropping the cap row in plain chat. It is a behaviour call (the log line stays either way); listed for the owner as an option, and the reworded row is the default. (4) Test for global New chat clearing the project added. (5) Order unchanged: apply composer edits after the other checkout commits its ChatComposerNew.tsx changes; regenerate the symbols index only if the guard asks.
