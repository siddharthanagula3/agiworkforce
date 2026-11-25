---
id: "F063-07"
type: "feature"
title: "Pause, resume, edit, delete, share"
aliases: ["Pause, resume, edit, delete, share", "Enable/disable (S63.24)", "Edit schedule (S63.26)", "Delete routine (S63.27)", "Share routine template (S63.29)", "Pause until date (S63.25, not built)", "Duplicate routine (S63.28, not built)", "Remove (Electron local routine)", "setScheduleEnabled / isActive toggle", "Stop sharing"]
area: "63 Routines, schedules, and triggers"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S63.24", "S63.26", "S63.27", "S63.29", "S63.25", "S63.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "table:scheduled_tasks", "table:scheduled_task_runs", "table:scheduled_task_shares", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "SYS-agents-tools-and-automation"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F063-07 Pause, resume, edit, delete, share

Manage a routine that already exists. On Web, Mobile, CLI, VS Code and Chrome you can pause or resume it; Web, Mobile, CLI and Chrome can edit it; Web, Mobile, CLI and Chrome can delete it. Web and the internal Tauri desktop can share a copy as a link. Pause-until-date and Duplicate are not built anywhere.

Area: [63. Routines, schedules, and triggers](README.md). Requirement items: [S63.24](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6324), [S63.26](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6326), [S63.27](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6327), [S63.29](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6329), [S63.25](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6325), [S63.28](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6328).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the owner of a Cloud routine stop it without losing it (pause), start it again (resume), change its settings (edit), remove it with its run history (delete), and hand a copy of its name, instructions and timing to someone else through a link (share). On the Desktop app, Local routines have their own Pause, Resume and Remove buttons.

**Why it exists.** Unattended work needs a safe off switch and a way to fix or retire it. Sharing lets a good routine spread without retyping. The brief lists these as items S63.24 to S63.29 (doc: knowledge-base/data/area-briefs/063-routines-schedules-and-triggers.md).

**Who uses it.** Any signed-in person who owns a routine; on a paid plan that allows scheduled tasks. A link recipient only reads the shared page and then makes their own copy.

**Problems it solves**

- A routine misbehaves or is not needed for a while: pause it instead of deleting it.
- The timing, prompt or model is wrong: edit in place instead of recreating.
- A routine is finished: delete it and its history after a confirmation that names the loss.
- Someone else wants the same routine: share a link they can turn into their own routine.

**Use cases**

- Pause the weekly review routine during a holiday, resume it when back (Web switch on the card).
- Edit a daily digest prompt from the phone (Mobile card menu, Edit).
- Delete an old once-only routine from the CLI with agi schedules delete.
- Share a routine from Web: Share, Create link, Copy link; later Stop sharing.

## 2. User experience

**Where to find it**

- Web: Scheduled page at /chat/schedules. Each card has an on/off switch labelled 'Pause <name>' or 'Resume <name>', a pencil 'Edit Schedule' button, and a 'More actions' menu with Run now, Share, Pause/Resume, Notification settings, Delete (apps/web/features/schedules/components/ScheduleCard.tsx:383, :427-500; menu order checked by apps/web/features/schedules/components/SchedulesPage.test.tsx:987).
- Desktop (public Electron app): shows the hosted web page (doc: AGENTS.md section 5), so the same Web cards appear, plus an 'On this computer' section for Local routines with 'Pause' / 'Resume' and 'Remove' buttons (apps/web/features/schedules/components/LocalRoutinesSection.tsx:206, :267-296).
- Desktop (internal Tauri build, DesktopShellV3): a list with 'Pause'/'Resume', 'Share schedule', 'Delete schedule' buttons and a 'Stop sharing' button once a link exists (apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1229, :1283-1309, :1383). This is not the screen the Electron window shows.
- Mobile: Schedules screen (Cloud mode only). Each card has a switch, a 'More actions' button; the menu lists Run now, Pause/Resume, Show history, Edit, Delete (apps/mobile/src/features/schedules/components/ScheduleCard.tsx:229-242, :297).
- CLI: agi schedules pause|resume|edit|delete <id or name> (apps/cli/src/lib.rs:1541-1585, handlers at :4413-4486).
- VS Code: commands 'Code: Pause Schedule' and 'Code: Resume Schedule' on the schedules view; no edit or delete (apps/extension-vscode/package.json:621-627; apps/extension-vscode/src/features/schedules/scheduleActions.ts:233).
- Chrome extension side panel Schedules section: 'Pause'/'Resume', 'Edit', 'Delete' buttons per row (apps/extension/src/features/side-panel/schedulesSection.ts:905, :940-972).

**Before you start**

- A routine exists and belongs to the signed-in account.
- Cloud mode on Mobile (the screen shows a Cloud gate otherwise) (apps/mobile/app/(app)/schedules/index.tsx:181).
- CLI: not in Local or own-key mode; the client refuses with a NotManaged error (apps/cli/src/schedules.rs:230-234).
- Resuming needs the routine not to be completed, expired, over its run limit, over its credit cap, or without a next occurrence (apps/web/lib/services/schedule-service.ts:1244-1273).
- Free plan on the internal Tauri desktop: resuming is blocked with 'Upgrade to Basic or higher before resuming unattended runs.' (apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:696).

**Screens and controls**

- Web card switch (Pause/Resume), pencil Edit, More menu, Delete Schedule? dialog with 'Cancel' and 'Delete Schedule' (SchedulesPage.tsx:1402-1425).
- Web edit dialog: ScheduleForm with 'Save Changes' button and an 'Active After Save' switch (ScheduleForm.tsx:791, :808-815).
- Web Share dialog: 'Create link', read-only 'Share link' field, 'Copy link', 'Stop sharing' (SchedulesPage.tsx:1527-1566).
- Stop sharing confirmation: title 'Stop sharing this schedule?', button 'Stop sharing' (SchedulesPage.tsx:781-790).
- Public share page /share/schedules/<token>: heading 'Shared schedule', the name, timing and instructions, and a link 'Add to my schedules' (apps/web/features/schedules/components/SharedSchedulePreview.tsx:33-56).
- Mobile delete: native alert 'Delete schedule?' with Cancel and Delete (apps/mobile/src/features/schedules/deleteConfirmation.ts:9).
- CLI delete: prompt that names the loss; --yes skips it; a non-interactive run without --yes refuses (apps/cli/src/lib.rs:4413-4430, :2579-2600).
- VS Code pause/resume progress toasts (scheduleActions.ts:115-124).
- Chrome delete: inline alert dialog 'Delete $NAME$ and its run history? This cannot be undone.' with Delete and Cancel (apps/extension/_locales/en/messages.json:2910; schedulesSection.ts:1001-1040).
- Electron local routine Remove: confirmation titled 'Remove <name>?' with button 'Remove routine' (LocalRoutinesSection.tsx:287-296).

**Journey**

1. Pause: toggle the switch (or choose Pause in the menu, or run agi schedules pause). The card shows 'Paused' and the next run disappears; the web shows the message 'Schedule paused.' (SchedulesPage.tsx:528-542).
2. Resume: toggle again. The server recomputes the next run time from now; if it cannot (finished, expired, limit, cap, no more occurrences) it answers with a conflict message that the card shows under the schedule (schedule-service.ts:1244-1273; SchedulesPage.tsx:540).
3. Edit: Web pencil, Mobile menu Edit (or tap the card), CLI edit with flags, Chrome Edit (name, description, prompt only). Change fields and save; the card updates and the web says 'Schedule updated.' (SchedulesPage.tsx:509-526).
4. Delete: choose Delete; read the confirmation; confirm. The card disappears; the web says 'Schedule deleted.' If a run is in progress the server refuses (schedule-service.ts:1305).
5. Share (Web, internal Tauri desktop): More menu, Share, Create link, Copy link, send it. The other person opens the page, reads it, clicks 'Add to my schedules', which opens the create form filled in; they review and save to get their own routine (SchedulesPage.tsx:803-826).
6. Stop sharing: press 'Stop sharing', read the warning (link dies for everyone; copies already made stay), confirm.

**What the person sees and gets**

- Web toasts and the action message line: 'Schedule paused.', 'Schedule resumed.', 'Schedule updated.', 'Schedule deleted.', 'Link copied', 'Sharing stopped' (SchedulesPage.tsx:508-542, :735, :776, :788).
- Row error under the card on failure, ending with 'Retry the action when ready.' (ScheduleCard.tsx:361-368).
- Card notices: 'Paused: it used its N cap. Raise the cap in Edit to run it again.' and 'Paused: a run needed your approval...' (ScheduleCard.tsx:336-352).
- CLI prints the updated schedule list row, or 'Deleted schedule <id>.' or 'Left the schedule in place.' (apps/cli/src/lib.rs:4413-4432).
- Shared link format: <web origin>/share/schedules/<24-character token> (packages/contracts/cloud-contracts/src/schedules.ts:326, :368-370).

**Settings**

- Web edit form: 'Active After Save' switch decides whether the routine is enabled after saving (ScheduleForm.tsx:791-801).
- Share only reaches people who have the link; there is no per-person access list (apps/web/db/neon/0311_scheduled_task_shares.sql:9-20).
- Workspace external-sharing rule can block Share (apps/web/app/api/schedules/[id]/share/route.ts:45-49).
- Desktop Local routine create dialog has 'Keep this computer awake while running' (LocalRoutinesSection.tsx:566); not part of manage actions.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web pause/resume through PATCH with an isActive boolean; resume recomputes next run and refuses terminal, over-limit, over-cap and no-occurrence cases (apps/web/app/api/schedules/[id]/route.ts:108-121; apps/web/lib/services/schedule-service.ts:1234-1289).
- Web edit: PUT merges the patch over the stored routine, refuses completed or expired routines, checks the prompt for secrets, validates the model against the plan (apps/web/app/api/schedules/[id]/route.ts:74-90; schedule-service.ts:1102-1120).
- Web delete: confirmation dialog, then DELETE; the server refuses while a run has status running, then deletes the routine row; runs are removed by the database cascade (SchedulesPage.tsx:1402-1425; schedule-service.ts:1291-1312; apps/web/db/neon/0009_scheduling.sql:36).
- Web share: POST makes or refreshes one live share per routine, DELETE revokes it; the recipient page and GET /api/schedule-shares/[token] only resolve while the token is not revoked and the owner may run unattended work (apps/web/lib/services/schedule-share-service.ts:52-102).
- Share is blocked by the workspace external-sharing rule and by the outbound secret inspection (apps/web/app/api/schedules/[id]/share/route.ts:45-62).
- Share snapshot holds name, description, prompt, model, timing fields, a small allow-list of timing metadata keys, missed-run policy and retry settings; nothing else (schedule-share-service.ts:21-45; packages/contracts/cloud-contracts/src/schedules.ts:328-343).
- Opening a share link then 'Add to my schedules' pre-fills the create form with no project and no agent (apps/web/features/schedules/lib/schedule-form.ts:181-188; SharedSchedulePreview.tsx:20).
- Mobile switch and menu pause/resume with an optimistic update and rollback path; Edit opens the create screen with the id; delete asks first and rolls the list back on failure (apps/mobile/src/features/schedules/store.ts:208-258, :262-300).
- CLI pause, resume, edit (name, description, prompt, model, cron expression, time zone) and delete with confirmation (apps/cli/src/schedules.rs:460-482; apps/cli/src/lib.rs:4413-4486).
- VS Code pause and resume only (scheduleActions.ts:104-127).
- Chrome pause/resume, edit of name, description and prompt, and delete with an inline confirmation (schedulesSection.ts:905, :1207-1225, :1001-1040).
- Electron Local routines: Pause cancels the active run; Resume asks a native confirmation and re-checks the folder grant; Remove stops the active run, then deletes the record (apps/desktop/electron/runtime/localRoutineEngine.ts:331-364; apps/desktop/electron/runtime/localRoutineService.ts:190-206).

**Incomplete**

- Edit is missing on VS Code and Local (Electron) routines; Chrome edits only name, description, prompt; CLI edits a fixed list of fields and cannot set caps, notifications, retries or missed-run policy (scheduleActions.ts:233; localRoutineService.ts:190-206; schedulesSection.ts:1221-1225; apps/cli/src/schedules.rs:460-482).
- Share exists only on Web and on the internal Tauri desktop; Mobile, CLI, VS Code, Chrome and Electron Local routines have none (searched apps/mobile, apps/cli, apps/extension, apps/extension-vscode for share routines in the schedule code; none found).
- Delete does not check for a run waiting for approval; only status running blocks it (schedule-service.ts:1297-1306).

**Present but disconnected or switched off**

- Mobile schedules screen shows a feature-unavailable view when FEATURES.schedules is off (apps/mobile/app/(app)/schedules/index.tsx:179).
- DesktopCloudSchedules.tsx is wired into the Tauri DesktopShellV3 only (apps/desktop/src/features/v3/DesktopShellV3.tsx:40, :818); the public Electron Desktop shows the hosted web page instead (doc: AGENTS.md section 5).

**Not available**

- Pause until a chosen date: no code found on any app (search of apps and packages for pause-until and pauseUntil returned nothing about schedules; brief S63.25 says missing on all apps).
- Duplicate routine: no code found; brief S63.28 says missing on all apps.
- Unshare after the routine is deleted: see gaps.
- Trash or undo for a deleted routine: deleteSchedule is a plain SQL delete (schedule-service.ts:1307-1311).

## 4. Required behaviour

**Established requirements**

- S63.24: a routine can be paused and resumed without deleting it, on every app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.24)
- S63.25: the user can pause until a chosen date and it resumes by itself. Not built on any app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.25)
- S63.26: an existing routine's timing and settings can be edited and saved (done on Web, Desktop, Mobile; missing on CLI and Chrome per the brief, but code shows CLI and Chrome edit exist). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.26)
- S63.27: a routine can be deleted after a confirmation and then stops running. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.27)
- S63.28: one action copies a routine into a new editable routine. Not built. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.28)
- S63.29: a routine or its template can be shared so another person can create their own copy. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.29)
- Pause, resume and delete are required parts of scheduled work, alongside run history, notification and permission review. (source: doc: docs/product/requirements.md (section 20, Scheduled Tasks, Dispatch, And Automations))
- An action a user cannot undo asks first and names the consequence; useConfirmAction is the shared surface; a mutation fired straight from onClick is a defect. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Pausing an active Cloud routine sets it to paused with no next run; resuming sets status active and a future next-run time.
2. Resume of a completed or expired routine, a routine at its run limit, or one at its credit cap is refused with a message and the routine stays paused.
3. Delete shows a confirmation that names what is lost; confirming removes the routine and its run history; cancelling changes nothing.
4. Delete of a routine that has a run with status running is refused with 'Schedule cannot be deleted while a run is in progress'.
5. Share creates one link per routine; opening it shows name, timing and instructions without signing in; Stop sharing makes the link answer not found.
6. A share is refused when the workspace forbids external sharing or the secret scan blocks the content.
7. A person who follows 'Add to my schedules' gets a pre-filled form and no routine exists until they save.
8. On the Electron Desktop, Remove of a Local routine asks first and stops its active run.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- After raising a credit cap on a paused routine, the routine stays paused until the owner resumes it, because the edit keeps the current enabled flag (apps/web/lib/services/schedule-service.ts:1088-1100, :1168-1181; test title at apps/web/lib/services/schedule-service.test.ts:1700) [inferred].
- Resume is not plan-checked on the server: setScheduleEnabled has no plan test; a Free account's routine is instead cancelled when it tries to run (schedule-service.ts:1234-1289; apps/web/lib/services/scheduled-agent-executor.ts:889-915) [inferred].
- Pausing a routine whose run is in progress does not cancel that Cloud run; no code in setScheduleEnabled touches runs [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Pause until date as a resume-at time stored on the routine and cleared by the sweep.
- [proposed] Add Duplicate as a client action that opens the create form with the routine's fields (same path as a shared copy).
- [proposed] Revoke or list a user's shares independent of the routine so a link can be stopped after the routine is deleted.
- [proposed] Make the Tauri desktop delete use the shared confirm dialog instead of window.confirm.
- [proposed] Show 'Share' and 'Duplicate' on Mobile, CLI and Chrome, or record that they are web-only on purpose.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | setScheduleEnabled | `apps/web/lib/services/schedule-service.ts` | Pause/resume rules and next-run recompute (lines 1234-1289) |
| service | updateSchedule | `apps/web/lib/services/schedule-service.ts` | Edit: merges patch, validates, keeps pause reason rules (lines 1102-1232) |
| service | deleteSchedule | `apps/web/lib/services/schedule-service.ts` | Delete with running-run guard (lines 1291-1312) |
| endpoint | PATCH/PUT/DELETE /api/schedules/[id] | `apps/web/app/api/schedules/[id]/route.ts` | HTTP entry for toggle, edit, delete; csrf, rate limit, secret check on edit |
| endpoint | POST/DELETE /api/schedules/[id]/share | `apps/web/app/api/schedules/[id]/share/route.ts` | Create or refresh a share; revoke a share; sharing and secret gates |
| endpoint | GET /api/schedule-shares/[token] | `apps/web/app/api/schedule-shares/[token]/route.ts` | Public read of a live share |
| service | schedule-share-service | `apps/web/lib/services/schedule-share-service.ts` | Snapshot, save, unshare, read-by-token |
| screen | Shared schedule page | `apps/web/app/share/schedules/[token]/page.tsx` | Public server page, not indexed |
| component | SharedSchedulePreview | `apps/web/features/schedules/components/SharedSchedulePreview.tsx` | Shows the shared routine and the 'Add to my schedules' link |
| component | ScheduleCard | `apps/web/features/schedules/components/ScheduleCard.tsx` | Web card: switch, Edit, More menu, notices |
| component | SchedulesPage | `apps/web/features/schedules/components/SchedulesPage.tsx` | Web handlers: toggleEnabled, saveSchedule, deleteSchedule, share dialog, stop sharing, shared-link intake |
| component | ScheduleForm | `apps/web/features/schedules/components/ScheduleForm.tsx` | Edit form |
| service | schedule-api client | `apps/web/features/schedules/services/schedule-api.ts` | Web client calls (setScheduleEnabled, shareSchedule, unshareSchedule, getSharedSchedule) |
| component | LocalRoutinesSection | `apps/web/features/schedules/components/LocalRoutinesSection.tsx` | Local routine list with Pause/Resume/Remove inside the Desktop app |
| service | LocalRoutineEngine | `apps/desktop/electron/runtime/localRoutineEngine.ts` | setEnabled and remove for device-run routines |
| service | localRoutineService | `apps/desktop/electron/runtime/localRoutineService.ts` | Native confirmation on create and resume; remove |
| component | DesktopCloudSchedules | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Tauri desktop list: pause/resume, share, stop sharing, delete |
| component | Mobile ScheduleCard and store | `apps/mobile/src/features/schedules/components/ScheduleCard.tsx` | Switch and menu; store.ts and service.ts do the calls |
| command | agi schedules pause/resume/edit/delete | `apps/cli/src/lib.rs` | CLI subcommands (1541-1585) and handlers (4413-4486) |
| service | SchedulesClient | `apps/cli/src/schedules.rs` | CLI HTTP client: set_active, update, delete |
| command | pauseSchedule / resumeSchedule | `apps/extension-vscode/src/features/schedules/scheduleActions.ts` | VS Code actions |
| component | Chrome schedules section | `apps/extension/src/features/side-panel/schedulesSection.ts` | Pause, edit, delete with inline confirm |
| table | scheduled_task_shares | `apps/web/db/neon/0311_scheduled_task_shares.sql` | One row per share; token, snapshot, revoked_at |
| schema | getScheduleActionAvailability | `packages/contracts/cloud-contracts/src/schedules.ts` | canRun/canEdit/canToggle used by every client (line 208) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person flips the switch or runs the command; the client sends PATCH /api/schedules/<id> with isActive. | device | apps/web/features/schedules/services/schedule-api.ts:220-226; apps/mobile/src/features/schedules/service.ts:224-236; apps/cli/src/schedules.rs:316 |
| Server checks sign-in, rate limit and CSRF, then runs setScheduleEnabled in one transaction: locks the row, refuses terminal, over-limit, over-cap, expired or no-occurrence cases, computes next run, updates scheduled_tasks. | our servers | apps/web/app/api/schedules/[id]/route.ts:96-111; apps/web/lib/services/schedule-service.ts:1234-1289 |
| Edit: client sends PUT; server screens the prompt for secrets, resolves the plan tier, merges the patch with the stored routine, validates (model must be eligible for the plan, caps and retry ranges) and writes the row. | our servers | apps/web/app/api/schedules/[id]/route.ts:74-90; apps/web/lib/services/schedule-service.ts:566-583, :1102-1232 |
| Delete: client shows a confirmation; on yes sends DELETE; server refuses if a run has status running, else deletes the routine; run rows cascade. | our servers | apps/web/lib/services/schedule-service.ts:1291-1312; apps/web/db/neon/0009_scheduling.sql:36 |
| Share: POST loads the routine, checks the workspace external-sharing rule, inspects the snapshot for secrets, then inserts or refreshes the share row with a random 18-byte token. | our servers | apps/web/app/api/schedules/[id]/share/route.ts:28-62; apps/web/lib/services/schedule-share-service.ts:52-70 |
| Recipient opens /share/schedules/<token>; the server reads the share (public, rate limited) and renders it. 'Add to my schedules' goes to /chat/schedules with the token; the page fetches the share and fills the create form. | our servers | apps/web/app/share/schedules/[token]/page.tsx:25-37; apps/web/app/api/schedule-shares/[token]/route.ts:13-22; apps/web/features/schedules/components/SchedulesPage.tsx:803-826 |
| Electron Local routine pause/resume/remove: the web page calls the Desktop host bridge (local_routine_set_enabled, local_routine_remove); the main process updates a device-stored routine list and cancels any active run. Resume shows a native confirmation. | device | apps/web/features/schedules/components/LocalRoutinesSection.tsx:267-296; apps/desktop/electron/runtime/localRoutineService.ts:190-206; apps/desktop/electron/runtime/localRoutineEngine.ts:331-364 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Routine row (state, is_enabled, next_execution_at, paused_reason, settings) | table scheduled_tasks in the Cloud database | Read by every signed-in app through the API | Hard delete by deleteSchedule; no trash (schedule-service.ts:1307-1311) |
| Run history | table scheduled_task_runs | Read through the runs API | Removed with the routine by foreign-key cascade (apps/web/db/neon/0009_scheduling.sql:36) |
| Share snapshot and token | table scheduled_task_shares | Public read by token while not revoked | Revoked by setting revoked_at; the row is kept after the routine is deleted (apps/web/db/neon/0311_scheduled_task_shares.sql:15-17; schedule-share-service.ts:74-84) |
| Local routine records and run notes | device store managed by the Electron main process (exact file or store name: unknown, not opened) | Not synced to Cloud (no sync code found in localRoutineEngine.ts) | Remove deletes the record after the active run stops (localRoutineEngine.ts:353-364); history kept to the last 20 runs (localRoutineEngine.ts:144, :519) |

**Models and providers.** Pause, resume, delete and share do not call a model. Edit validates the chosen model against the shared model catalog and the plan; an unknown id is refused, 'automatic selection' is allowed (apps/web/lib/services/schedule-service.ts:566-583). A shared copy keeps the model field of the snapshot; the recipient's plan check applies when they save.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for every manage action (getUserScopedDb on each route). The public share page and GET /api/schedule-shares/[token] need no sign-in; adding a copy needs the recipient's own account. |
| Permissions | Owner only: every query filters by user_id. Share is refused when the routine belongs to a workspace that turned external sharing off (share/route.ts:45-49). A shared link only resolves while its owner account may run unattended work (schedule-share-service.ts:94-100). Workspace role rules for editing routines: none found in these files. |
| Subscription | Scheduled-task count is limited by plan at creation (assertScheduleQuota, schedule-service.ts:877-904; plan figures come from getPlanMaxScheduledTasks in packages/contracts/types/src/billing-catalog.ts:816, values not read). The internal Tauri desktop blocks resume on Free with an upgrade message (DesktopCloudSchedules.tsx:696, :1058). The server's pause/resume has no plan test (inferred). Plan names for the limits: unknown. |
| Limits and metering | Rate limit 'chat-conversation' per user on edit, delete, toggle and share routes; 'share-view' on the public read (route files). Share tokens are 24 URL-safe characters (cloud-contracts schedules.ts:326). Pause, resume, delete and share spend no credits. |
| Feature flags | Mobile: FEATURES.schedules (apps/mobile/app/(app)/schedules/index.tsx:179). Others: none found. |
| Model compatibility | Not model dependent; edit re-validates the model id against the catalog (schedule-service.ts:566-583). |
| Provider restrictions | None found in the code for these actions; scheduled runs themselves go through the managed service. |
| Local mode | Cloud routines are not available in Local mode: Mobile shows a Cloud gate and does not fetch (apps/mobile/app/(app)/schedules/index.tsx:181; apps/mobile/__tests__/ScheduleScreen.test.tsx:125); CLI refuses Local and own-key privacy modes (apps/cli/src/schedules.rs:230-234). Electron Desktop Local routines run on the device, need no Cloud sign-in for pause/resume/remove, and can be managed offline from Cloud; the model they use may still run in the cloud (LocalRoutinesSection.tsx:206-209; localRoutineService.ts:150-160). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Toggle in progress | Web switch has aria-busy and the card announces 'Schedule action in progress...'; Mobile switch is disabled while a run starts | apps/web/features/schedules/components/ScheduleCard.tsx:386, :543; apps/mobile/src/features/schedules/components/ScheduleCard.tsx:299 |
| Resume refused | Conflict message is shown on the card; routine stays paused. Reasons: terminal, run limit, credit cap, expired, no further occurrence, expiry before next run | apps/web/lib/services/schedule-service.ts:1244-1273; ScheduleCard.tsx:361-368 |
| Completed or expired routine | Edit and toggle are disabled; menu on Mobile shows only History and Delete | packages/contracts/cloud-contracts/src/schedules.ts:208-218; apps/mobile/__tests__/ScheduleCardControls.test.tsx:224 |
| Delete while running | Server conflict; Web shows the row error and closes the dialog | schedule-service.ts:1305; SchedulesPage.tsx:738-742 |
| Delete returns 404 | Web treats it as already deleted and removes the card; Mobile does the same | SchedulesPage.tsx:723-727; apps/mobile/src/features/schedules/store.ts:236-239 |
| Delete fails on Mobile | List is rolled back and an error is set | apps/mobile/src/features/schedules/store.ts:240-253 |
| Unsaved edits closed | Web asks 'Discard Unsaved Changes?' | SchedulesPage.tsx:1431-1435; apps/web/features/schedules/components/SchedulesPage.test.tsx:371 |
| Share link dead or revoked | API answers not found ('This shared schedule link is not available'); the public page 404s; the add flow toasts 'That shared schedule is no longer available.' | apps/web/app/api/schedule-shares/[token]/route.ts:17-19; SchedulesPage.tsx:821-823 |
| Share blocked | Validation or sharing-gate response; the dialog shows the error text | share/route.ts:45-62; SchedulesPage.tsx:759-770 |
| Offline or request failure | Web row error 'Schedule status could not be changed.'; Mobile sets a retry message. Offline queueing: not handled in the code | SchedulesPage.tsx:540; apps/mobile/src/features/schedules/store.ts:240-253 |
| Local routine suspended (sleep) | Section says 'Local runs are suspended until this computer wakes.' | LocalRoutinesSection.tsx:218-222 |
| Local routine cannot resume | Resume button is hidden for a one-time routine already past, an expired one, or one at its run limit; resume needs the folder grant | LocalRoutinesSection.tsx:231-237, :267; localRoutineEngine.ts:336-346 |
| Accessibility | Web switch label 'Pause <name>'/'Resume <name>'; Mobile exposes More actions as a VoiceOver action | ScheduleCard.tsx:385; apps/mobile/__tests__/ScheduleCardControls.test.tsx:195 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/schedule-service.test.ts`: Titles include: recomputes the next occurrence when enabling an owned paused schedule (576); does not enable a schedule whose next occurrence is at or after expiration (589); does not delete a task while one of its runs is still executing (750); will not enable a routine that has spent its cap (1435).
- `apps/web/features/schedules/components/SchedulesPage.test.tsx`: Edit/pause/resume/run now (588); delete needs confirmation and removes only after success (749); delete answered with 404 (777); menu order Run now, Share, Pause, Notification settings, Delete (987); creates and copies a share link (1014).
- `apps/web/features/schedules/components/ScheduleCard.test.tsx`: Card display including 'Shows Paused instead of chips when disabled' (150).
- `apps/web/app/api/schedules/[id]/share/__tests__/route.test.ts`: Share refused for workspaces with sharing off (144); 401 and CSRF (162, 172); 404 for another user's routine (183); refused by secret policy (192); shares the inspected snapshot (204); DELETE unshares (230).
- `apps/web/app/api/schedule-shares/[token]/__tests__/route.test.ts`: Rate limit first (58); 404 for unknown or revoked (68); returns a live share (77).
- `apps/web/__tests__/api/schedule-by-id.test.ts`: Toggle requires a boolean isActive (82); delete through an owner predicate (94).
- `apps/mobile/__tests__/ScheduleCardControls.test.tsx`: Menu lists every action with Delete last (170); Resume and why Run now is missing (178); approval-paused routine is not told to resume (187); Edit from menu (247); Delete hands to parent confirmation (256).
- `apps/mobile/__tests__/ScheduleScreen.test.tsx`: No Cloud fetch in Local mode (125); asks before deleting and names the loss (375).
- `apps/mobile/__tests__/schedule-service.test.ts`: Dedicated PATCH for activation (180); requires a confirmed deletion response (211).
- `apps/desktop/src/features/schedules/__tests__/DesktopCloudSchedules.test.tsx`: Lists and toggles through the Cloud adapter (230); Free stays disabled but cleanup stays (264).
- `apps/desktop/electron/__tests__/localRoutineEngine.test.ts`: Removal refused before the turn is known (222); stop not acknowledged keeps ownership (174).
- `apps/desktop/electron/__tests__/localRoutineService.test.ts`: Create saved only after native consent (81).
- `apps/extension-vscode/src/__tests__/schedules.test.ts`: Pause and resume through the hosted endpoint (230, 239); pause shown only on active rows (360); edit points to the web (301).
- `apps/extension/__tests__/schedule-action-controls.test.ts`: Chrome schedule action controls (titles not read in detail).

**Test scenarios**

- **Pause and resume on Web**
  1. Open /chat/schedules with an active routine.
  2. Toggle the card switch off, then on.
  - Expected: Card shows Paused and no next run, then an active status and a future next run; messages 'Schedule paused.' then 'Schedule resumed.'.
- **Resume refused at the credit cap**
  1. Use a routine whose credits used equal its cap and which is paused.
  2. Try to resume.
  - Expected: The card shows the cap message; the routine stays paused until the cap is raised in Edit and the routine is resumed.
- **Delete with confirmation and running guard**
  1. Choose Delete on a card.
  2. Cancel; then repeat and confirm.
  3. Repeat while a run shows 'Running now'.
  - Expected: Cancel changes nothing; confirm removes the card and its history; the running case shows a row error and the routine stays.
- **Share, open, copy, stop**
  1. Choose Share, Create link, Copy link.
  2. Open the link in a signed-out browser.
  3. Click 'Add to my schedules' after signing in.
  4. Back on the owner, choose Stop sharing and confirm.
  5. Reload the link.
  - Expected: Page shows name, timing and instructions only; form opens pre-filled with no project; after Stop sharing the link shows not found; the copy remains.
- **Workspace blocks sharing**
  1. Put a routine in a workspace with external sharing off.
  2. Choose Share, Create link.
  - Expected: An error response and no link.
- **CLI delete without a terminal**
  1. Run agi schedules delete <name> from a script without --yes.
  2. Run again with --yes.
  - Expected: First run prints that nothing was deleted and exits without deleting; second deletes and prints 'Deleted schedule <id>.'.
- **Electron Local routine Remove**
  1. Create a Local routine and let it start a run.
  2. Press Remove and confirm.
  - Expected: The run is stopped, then the routine disappears; if the stop cannot be confirmed the record is kept and an error is shown.

**Where to look when it fails**

- Server error classes ScheduleConflictError, ScheduleNotFoundError, ScheduleValidationError map to 409, 404, 400 responses (apps/web/app/api/schedules/[id]/route.ts:22-27).
- Tables scheduled_tasks (is_enabled, status, next_execution_at, paused_reason, last_error), scheduled_task_shares (revoked_at).
- Log line 'Scheduled tasks were not claimed: their owner is no longer an active member of the workspace' explains a routine that silently stopped (schedule-service.ts:1328-1335).
- Electron: console warnings prefixed [local-routines] (localRoutineService.ts:217-245).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/web/063-routines-schedules-and-triggers.md)
- Desktop: [70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md)
- Mobile: [70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md)
- CLI: [70-qa/test-plans/cli/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/cli/063-routines-schedules-and-triggers.md)
- VS Code: [70-qa/test-plans/vscode/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/vscode/063-routines-schedules-and-triggers.md)
- Chrome: [70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md)

## 10. Gaps and dependencies

- **Pause until a chosen date is not built.** Affects: All apps and users who want a holiday pause.. Evidence: Brief S63.25 lists missing on every app; no code found.. Work needed: Add a resume-at field, API support, and UI on each app.
- **Duplicate routine is not built.** Affects: All apps.. Evidence: Brief S63.28; no code found.. Work needed: Client action that opens create with copied fields.
- **A share link cannot be revoked after its routine is deleted: delete sets the share's task_id to null and only keeps the share, while unshare matches on task_id, and no other revoke route was found.** Affects: Web and Tauri desktop owners who delete a shared routine.. Evidence: apps/web/db/neon/0311_scheduled_task_shares.sql:15-17, :31; apps/web/lib/services/schedule-share-service.ts:74-84; searched apps/web for other revoked_at writes: none [inferred]. Work needed: Revoke shares on delete or add an owner-level share list with revoke; tell the person in the delete dialog.
- **The delete dialog says the delete is permanent, but offers no recovery; AGENTS section 9 requires a user's data to go to a recoverable place unless the user explicitly names the loss. The dialog does name it.** Affects: All apps.. Evidence: schedule-service.ts:1307-1311; SchedulesPage.tsx:1405-1408. Work needed: Decide whether routines count as user data that needs a trash step; if yes add Recently deleted.
- **The internal Tauri desktop delete uses window.confirm, not the shared confirm dialog, and does not mention event triggers.** Affects: Tauri desktop.. Evidence: apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:747. Work needed: Use useConfirmAction (already used for Stop sharing in the same file, line 727).
- **Share is Web and Tauri desktop only; the Electron Local routines, Mobile, CLI, VS Code and Chrome have no share.** Affects: Those apps.. Evidence: Brief S63.29 statuses; code search of those apps.. Work needed: Add share to each or document web-only.
- **Edit coverage is uneven: none on VS Code and Local routines; Chrome edits three fields; CLI cannot edit caps, notifications, retries or missed-run policy.** Affects: VS Code, Chrome, CLI, Electron Local users.. Evidence: scheduleActions.ts:233; schedulesSection.ts:1221-1225; apps/cli/src/schedules.rs:460-482; localRoutineService.ts:190-206. Work needed: Add the fields or open the web editor from those apps.
- **The brief's S63.26 and S63.27 statuses disagree with the code for CLI edit and Chrome edit (code has them).** Affects: Documentation accuracy.. Evidence: Brief says cli missing and chrome missing for edit; apps/cli/src/lib.rs:1552; schedulesSection.ts:940-953. Work needed: Update the brief rows.
- **Delete is allowed while a run waits for approval.** Affects: Web, Mobile, CLI, Chrome.. Evidence: schedule-service.ts:1297-1306 checks only running. Work needed: Decide if that is intended; the checkpoint is removed with the run by cascade.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- table:scheduled_tasks
- table:scheduled_task_runs
- table:scheduled_task_shares
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- SYS-agents-tools-and-automation

## Unknown

- Plan names and numbers behind getPlanMaxScheduledTasks were not read.
- Whether event-trigger rows are removed on routine delete (the web dialog says so; the foreign key was not opened).
- Exact device store file or name for Electron Local routines.
- What workspace roles may edit or delete another member's routine: not found in the files read.
- How Mobile shows a refused resume (the store sets a generic error; exact text not traced).
- Whether sign-in redirect keeps the share token when a signed-out recipient presses 'Add to my schedules' (shell code not read).
