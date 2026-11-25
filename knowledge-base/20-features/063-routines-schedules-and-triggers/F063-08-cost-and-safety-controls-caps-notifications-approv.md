---
id: "F063-08"
type: "feature"
title: "Cost and safety controls: caps, notifications, approvals"
aliases: ["Cost and safety controls", "Maximum Runs / maxExecutions", "Credit Cap / creditCap", "Routine notifications / notificationSettings", "Approval gate / awaiting_approval / Needs approval", "Required-approval behavior (S63.32)", "Budget controls (S63.31)", "Notification preferences (S63.30)", "credit_cap_reached", "approval_required"]
area: "63 Routines, schedules, and triggers"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S63.30", "S63.31", "S63.32"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "table:scheduled_tasks", "table:scheduled_task_runs", "table:managed_usage_requests", "api:POST /api/schedules/[id]/runs/[runId]/approval", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-connectors-plugins-and-skills", "F063-07", "F063-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F063-08 Cost and safety controls: caps, notifications, approvals

Keeps unattended Cloud runs safe and affordable. A routine can have a run limit and a credit cap, five notification switches, and a pause for approval: when a run reaches a step that needs a person it stops, the routine pauses, and the person approves or denies in run history. Caps exist on Web only; approvals work on every app.

Area: [63. Routines, schedules, and triggers](README.md). Requirement items: [S63.30](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6330), [S63.31](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6331), [S63.32](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6332).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Limits how many times and how much a Cloud routine may spend (Maximum Runs, Credit Cap), lets the owner choose which events notify them and on which channel, and stops a run at a risky tool step until a person decides. The Desktop app's Local routines have their own notification switches and approvals through the coding session.

**Why it exists.** Nobody watches an unattended run, so spend and risky actions need a hard edge. Brief items S63.30 to S63.32 require per-routine notification choice, budget caps and approval pauses (doc: knowledge-base/data/area-briefs/063-routines-schedules-and-triggers.md).

**Who uses it.** Owners of Cloud routines on a plan that allows them; Desktop users of Local routines; anyone asked to approve a step from Web, Mobile, CLI, VS Code, Chrome or the Tauri desktop.

**Problems it solves**

- A routine loops or costs more than expected: it pauses at its credit cap.
- A run wants to send data out or use a tool the owner marked 'ask': it waits instead of acting.
- The owner is away: push or email says approval is needed.
- Too many alerts: switch off success notices but keep failures.

**Use cases**

- Cap a daily research routine at a number of credits for the month of runs.
- Limit a one-off watch to 10 runs.
- Approve from the phone a tool step a run is waiting on.
- Run agi schedules approve <name> from a terminal after a notification.

## 2. User experience

**Where to find it**

- Web: schedule create/edit dialog. 'Execution Limits' section holds 'Maximum Runs' and 'Credit Cap'; the 'Routine notifications' group has five switches; 'Notification settings' in the card's More menu opens the same edit dialog (apps/web/features/schedules/components/ScheduleForm.tsx:696-723, :740-777; SchedulesPage.tsx:847-849).
- Web run history (card History button): approval card titled 'Waiting for your approval' with 'Approve' and 'Deny' (apps/web/features/schedules/components/ScheduleRunHistory.tsx:129-153; packages/contracts/types/src/tool-approval-policy.ts:30-33).
- Desktop (Electron): Local routines dialog has 'Notify on success', 'Notify on failure', 'Notify when approval is needed' and push and email choices (apps/web/features/schedules/components/LocalRoutinesSection.tsx:575-580); Cloud routines use the Web form. Tool approvals for a Local run happen in its coding session ('Open run' link) (LocalRoutinesSection.tsx:247-249).
- Desktop (internal Tauri): approval card in run history with Approve and Deny; the form has a 'Maximum executions (optional)' field only (apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1459-1473, :1802-1810).
- Mobile: run history row shows 'Needs approval' and Approve / Deny buttons (apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx:71, :77-146).
- CLI: agi schedules approve <id> and agi schedules deny <id>; runs prints how (apps/cli/src/lib.rs:1605-1627; apps/cli/src/schedules.rs:612-629).
- VS Code: pick a waiting run in 'Show Schedule Runs' to get a modal with Approve and Deny (apps/extension-vscode/src/features/schedules/scheduleActions.ts:158-195).
- Chrome: approval block under the row with Approve and Deny, status text 'Paused until you approve or deny this step' (apps/extension/src/features/side-panel/schedulesSection.ts:978-981, :1142; apps/extension/_locales/en/messages.json:670-690).

**Before you start**

- Cloud routine, signed in, a plan that allows scheduled tasks.
- Credit Cap counts credits settled on managed usage; it only has meaning for runs that spend managed credits.
- Approval needs a model and tools that can run a tool loop; otherwise the run cannot pause for approval (scheduled-agent-executor.ts:976-980 for resume).
- Push needs the Mobile app signed in (browser push is not covered) (apps/web/lib/services/schedule-notification-service.ts:179-185).

**Screens and controls**

- Maximum Runs: number 1 to 1,000,000, placeholder 'No limit...' (ScheduleForm.tsx:744-756).
- Credit Cap: whole credits 1 to 1,000,000, with the helper 'Pauses once runs use this many credits. A run already started finishes.' and 'It has used N so far.' (ScheduleForm.tsx:763-777; packages/contracts/cloud-contracts/src/schedules.ts:12).
- Card line 'Credits' shows used and 'of' cap; 'Runs' shows count and 'of' limit (ScheduleCard.tsx:307-323).
- Routine notifications switches: 'When completed', 'When failed or timed out', 'When approval is needed', 'Mobile push', 'Email', all on by default; text 'Push and email also follow your account notification settings.' (ScheduleForm.tsx:696-723; cloud-contracts schedules.ts:114-125).
- Approval card: tool call summary, name, input text, 'Expires <time>', Approve, Deny (ScheduleRunHistory.tsx:126-153).
- Paused notices on the card: credit cap and approval (ScheduleCard.tsx:336-352).
- Local routine notification switches and a native 'Allow this local routine?' dialog on create and on resume (localRoutineService.ts:134-165).

**Journey**

1. Set limits: open Create or Edit, expand 'Execution Limits', enter Maximum Runs and/or Credit Cap, set notification switches, save.
2. Wait. When the cap is reached the next due run is cancelled, the routine pauses with reason credit_cap_reached and the card says 'Paused: it used its N cap. Raise the cap in Edit to run it again.'
3. Raise the cap in Edit, then resume the routine.
4. Approval: a run reaches a step that needs approval; it stops with status needs approval, the routine pauses with reason approval_required, and a notice is queued.
5. Open Run History (or the CLI/VS Code/Chrome/Mobile equivalent), read the step, press Approve or Deny.
6. The same run resumes from its saved checkpoint, up to the 24 hour limit; the card refreshes and the message says 'Approved. The run finished.' or the status reached.
7. If nobody answers in 24 hours the run is cancelled with a message to resume the schedule; the owner resumes it from the card.

**What the person sees and gets**

- Web action message: 'Approved.' or 'Denied.' followed by 'The run finished.' / 'The run ended with status X.' / 'The run is waiting for approval on another step.' (SchedulesPage.tsx:700-708).
- Credit cap error text used on refused resume or run now: 'This routine reached its N cap after using M. Raise the cap to run it again.' (schedule-service.ts:555-557).
- Approval notice: in-app notification 'Scheduled task needs your approval', plus push and email per switches; developer webhook event task_run.needs_approval (schedule-notification-service.ts:113-121; apps/web/lib/jobs/job-handlers.ts:139-141).
- Expired approval text: 'Nobody approved or denied the step this run was waiting on within 24 hours, so the run stopped. Resume the schedule to run it again.' (schedule-service.ts:79; cloud-agent-run-service.ts:457).
- CLI prints the waiting step and the two commands (schedules.rs:612-629).

**Settings**

- Per-routine notificationSettings (success, failure, approval, push, email), stored with the routine (schedule-service.ts:423-424, :856).
- Account notification settings also gate push and email: mobilePushScheduleDone and emailScheduleDone preference keys (schedule-notification-service.ts:10-11, :65-83).
- Quiet hours apply to approval and failure notices (schedule-notification-service.ts:94-100; job-handlers.ts:111-129).
- Tool approval policy and per-connector tool permissions decide which steps ask (scheduled-agent-executor.ts:258-266).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Maximum Runs validated 1 to 1,000,000; Credit Cap validated as whole credits 1 to 1,000,000 (apps/web/lib/services/schedule-service.ts:722-738).
- Credit use is the sum of settled managed usage requests carrying the routine's id; a run's charges are tagged to its routine (schedule-service.ts:520-545; apps/web/lib/services/managed-usage-request-service.ts:619-624; apps/web/db/neon/0301_routine_credit_cap.sql).
- At run start, if the cap is reached the routine is paused (credit_cap_reached), the run slot is given back and the run is cancelled with the cap message; after a finished run that reaches the cap the routine pauses too; retries are not scheduled once the cap is reached (schedule-service.ts:2238-2253, :1714-1722, :1774-1778).
- Manual run and resume are refused at the cap (schedule-service.ts:1253-1255, :1585-1587).
- Approval pause: the executor returns a checkpoint, the run becomes awaiting_approval with request and 24 hour expiry, the routine is paused with approval_required, and a notification job is queued (schedule-service.ts:1874-1920, :1849-1872; apps/web/db/neon/0308_schedule_run_approval.sql).
- Approve or deny: POST /api/schedules/[id]/runs/[runId]/approval validates the decision and that the tool call ids match the pending ones, claims the run, resumes the tool loop from the checkpoint, and reactivates the routine if that was its only waiting run (apps/web/app/api/schedules/[id]/runs/[runId]/approval/route.ts:24-62; schedule-service.ts:1957-2043).
- Unattended gate: scheduled runs set unattended and let escalations pause, so a high-risk combination asks instead of being denied (scheduled-agent-executor.ts:619-620; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:138-160).
- Tools that would ask are withheld from the run (web search, code execution) rather than paused for, with a note in the output (scheduled-agent-executor.ts:263-333, :374-400).
- Expired approvals are cancelled by the sweep (schedule-service.ts:2424-2462, :2477-2480).
- Notifications honour per-routine switches and account preferences; cancelled runs send nothing (schedule-notification-service.ts:20-95, :147).
- Approve/Deny UI on Web, Tauri desktop, Mobile, CLI, VS Code, Chrome (see user_experience).
- Electron Local routines: per-routine notification flags decide whether an approval or finish notice is shown; email is refused for local routines; a native confirmation is required to create and resume (apps/desktop/electron/runtime/localRoutineEngine.ts:59-69, :675-703; localRoutineService.ts:134-165).

**Incomplete**

- Maximum Runs on the Tauri desktop form only; no credit cap, no notification switches on the Tauri form, Mobile, CLI, VS Code or Chrome (rg for creditCap, notificationSettings in apps/desktop/src/features/schedules and apps/mobile found test files only).
- Notification choices cannot be set on the CLI; Mobile cannot set them (brief S63.30 says cli missing; code confirms none on those apps).
- Local routines have a run limit (maxExecutions) but no credit cap (localRoutineEngine.ts:74-75).
- Expired-approval cancellation sends no notice and leaves the routine paused (schedule-service.ts:2441-2457; announceScheduleRun skips cancelled, :1827) [inferred as no notice].
- On Mobile the shown error text for a cancelled run is the generic 'This run was canceled.', so the cap message and 'Resume the schedule' hint are not shown (apps/mobile/src/features/schedules/service.ts:126-131).

**Present but disconnected or switched off**

- Tauri desktop schedules list is wired in the internal build only (DesktopShellV3.tsx:818); the Electron Desktop does not show it.

**Not available**

- Credit cap on Mobile, CLI, VS Code, Chrome, Tauri desktop forms.
- Per-routine notification choices on CLI, Mobile, VS Code, Chrome (create/edit forms).
- Cost cap in money terms for Local routines: not present.

## 4. Required behaviour

**Established requirements**

- S63.30: per routine, the user chooses how (or whether) they are notified about runs. Brief lists only CLI as missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.30)
- S63.31: per routine, the user caps cost, credits or number of runs. Done on Web and Desktop; missing on Mobile, CLI, Chrome. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.31)
- S63.32: when an unattended run needs approval it pauses, asks the user, and resumes once approved. Done on all apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.32)
- maxExecutions is 1 to 1,000,000; creditCap is a whole number of credits within a maximum. (source: apps/web/lib/services/schedule-service.ts:722-738)
- When the credit cap is reached the next run pauses the routine with reason credit_cap_reached; the user must raise the cap to resume. (source: apps/web/lib/services/schedule-service.ts:2140-2150 (brief: pauseForCreditCap))
- A run that needs approval stops in awaiting_approval, the routine pauses with approval_required, a notification is queued, approving resumes the same run from a saved checkpoint, denying lets it continue without that step. (source: apps/web/lib/services/schedule-service.ts:1874-1920 (brief S63.32))
- Notification and permission review are required parts of scheduled work. (source: doc: docs/product/requirements.md (section 20))
- A decision to add a separate notification switch for scheduled tasks to the Mobile app has been recorded. (source: doc: docs/decisions/2026-11-13-founder-decisions.md (line 21))
- Free usage screens show only Upgrade, never meters (owner decision); credits shown on the routine card are for paid routines. (source: doc: owner memory file free-usage-upgrade-only (not opened here; cited from the session memory index))

**Acceptance criteria**

1. Saving Maximum Runs 0, 1,000,001 or a fraction is refused with the stated range message.
2. Saving Credit Cap 0, a fraction or above 1,000,000 is refused with the stated range message.
3. With a cap of N credits and N or more used, the next due run does not start; the routine is paused with the cap notice; resume and Run now are refused with the cap message.
4. A run that reaches an ask-gated tool stops with status needs approval and the routine shows the approval notice; pressing Approve resumes the same run id; Deny resumes it without that step.
5. An approval older than 24 hours is cancelled and the card tells the owner to resume the schedule.
6. Turning 'When failed or timed out' off stops failure notices for that routine while success notices still arrive; turning 'Email' off stops the email even if the account allows it.
7. Cancelled, skipped and credit-capped runs send no completion notice.
8. Approving with a tool call id list that no longer matches the pending ones is refused with a conflict.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The 'Credit Cap' helper says a run already started finishes, so overshoot by one run is possible; the cap is checked only before a run starts and after it ends (schedule-service.ts:2238-2253, :1714) [inferred].
- Credit Cap only sums requests whose status is completed, so a run still in flight is not counted until it settles [inferred] (schedule-service.ts:520-545).
- Local routines cannot spend managed credits through this path; their model may be cloud but the cap logic is not applied [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Credit Cap and notification switches to Mobile, CLI, Chrome and VS Code, or show the web editor link where editing is not offered.
- [proposed] Send a notice when an approval expires, so the owner learns the routine is still paused.
- [proposed] Show the real cap or expiry message on Mobile instead of the generic cancelled text.
- [proposed] Record an approval-expiry audit event like the missed-run one.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | validateScheduleInput (caps, retries, notifications) | `apps/web/lib/services/schedule-service.ts` | Validates maxExecutions, creditCap and notification settings (lines 700-860) |
| service | credit cap helpers and pauseForCreditCap | `apps/web/lib/services/schedule-service.ts` | Credits used SQL, cap test, cap message, pause (lines 520-557, 2140-2150, 2238-2253) |
| service | finalizeScheduleRun | `apps/web/lib/services/schedule-service.ts` | Pauses after a run reaches the cap; stops retries at cap (lines 1653-1810) |
| service | awaitScheduleRunApproval / claimScheduleRunApproval | `apps/web/lib/services/schedule-service.ts` | Park a run for approval; claim it back with a decision (lines 1874-2043) |
| job | expireScheduleRunApprovals | `apps/web/lib/services/schedule-service.ts` | Cancels approvals older than the limit (lines 2424-2462) |
| endpoint | POST /api/schedules/[id]/runs/[runId]/approval | `apps/web/app/api/schedules/[id]/runs/[runId]/approval/route.ts` | Resolve an approval and resume the run |
| service | executeScheduledAgent and runScheduledToolLoop | `apps/web/lib/services/scheduled-agent-executor.ts` | Runs the tool loop unattended, builds checkpoint, resumes (lines 598-662, 866-1187) |
| config | tool-call gate table | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | Rank table deciding allow, ask, deny; escalations pause on unattended runs |
| service | schedule-notification-service | `apps/web/lib/services/schedule-notification-service.ts` | Combines per-routine and account notification choices; in-app, push, email |
| job | notifications.schedule-completed / email.schedule-completed | `apps/web/lib/jobs/job-handlers.ts` | Delivery jobs including developer webhook events (lines 98-215) |
| schema | ManagedCloudScheduleNotificationSettingsSchema and approval schemas | `packages/contracts/cloud-contracts/src/schedules.ts` | Five notification flags, run approval request, max credit cap, tool call limit |
| table | scheduled_tasks (credit_cap_microusd, paused_reason, metadata.notificationSettings) | `apps/web/db/neon/0301_routine_credit_cap.sql` | Cap and pause reason storage |
| table | scheduled_task_runs (approval_* columns) | `apps/web/db/neon/0308_schedule_run_approval.sql` | Checkpoint, request, expiry |
| table | managed_usage_requests | `apps/web/lib/services/managed-usage-request-service.ts` | Ledger rows tagged with scheduled_task_id (line 619) |
| component | ScheduleForm (Execution Limits, Routine notifications) | `apps/web/features/schedules/components/ScheduleForm.tsx` | Web inputs |
| component | ScheduleRunHistory / RunRow with ApprovalCard | `apps/web/features/schedules/components/ScheduleRunHistory.tsx` | Approve and Deny in the Web run list |
| component | LocalRoutinesSection | `apps/web/features/schedules/components/LocalRoutinesSection.tsx` | Local routine notification switches |
| service | LocalRoutineEngine lifecycle notices | `apps/desktop/electron/runtime/localRoutineEngine.ts` | awaiting_input state and notify flags (lines 675-703) |
| component | Mobile PendingApproval | `apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx` | Approve/Deny on the phone |
| command | agi schedules approve/deny | `apps/cli/src/lib.rs` | Handlers (4521-4550) and resolve_schedule_approval (4693-4724) |
| component | VS Code approval modal | `apps/extension-vscode/src/features/schedules/scheduleActions.ts` | resolveScheduleApprovalInteractively (158-195) |
| component | Chrome buildApproval | `apps/extension/src/features/side-panel/schedulesSection.ts` | Approval block in the side panel |
| job | cron run-schedules | `apps/web/app/api/cron/run-schedules/route.ts` | Sweep that expires approvals and runs due routines; vercel.json:50-51 every 15 minutes |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Owner saves caps and notification choices; the server validates and stores them (caps as columns, notification flags in the routine's metadata). | our servers | apps/web/lib/services/schedule-service.ts:700-860, :1186-1230 |
| The sweep (cron every 15 minutes) first cancels expired approvals, recovers expired leases, then claims due routines owned by accounts that may run unattended. | our servers | apps/web/app/api/cron/run-schedules/route.ts; apps/web/lib/services/schedule-service.ts:2477-2492; vercel.json:50-51 |
| Before running, the claim checks the credit cap; if reached it pauses the routine, returns the run slot and cancels the run. | our servers | schedule-service.ts:2238-2253 |
| The executor refuses secret-blocked prompts and accounts without managed compute access (run cancelled with a reason), picks a model route, builds the tool plan (tools that would ask are withheld or kept ask-gated), reserves managed usage, and runs the tool loop with unattended set. | our servers | apps/web/lib/services/scheduled-agent-executor.ts:866-1100, :619-620 |
| The model provider is called by our servers through the managed route; usage is settled into managed_usage_requests tagged with the routine id, which feeds the cap. | outside service | scheduled-agent-executor.ts:1056-1110; managed-usage-request-service.ts:619-624 |
| If a tool call needs approval the loop returns a checkpoint; the service stores it with a 24 hour expiry, sets status awaiting_approval, pauses the routine, and queues a notification job. | our servers | schedule-service.ts:1874-1920, :1849-1872 |
| The notification job reads per-routine and account preferences, records an in-app notification, queues email (respecting quiet hours), sends mobile push, and queues a developer webhook event. | our servers | apps/web/lib/jobs/job-handlers.ts:98-150; apps/web/lib/services/schedule-notification-service.ts:139-195 |
| The person presses Approve or Deny in an app; the app posts the decision with the pending tool call ids; the server claims the run and resumes the loop in the request (60 second limit, 40 second run budget). | device and our servers | apps/web/app/api/schedules/[id]/runs/[runId]/approval/route.ts:14, :39-56 |
| Electron Local routines: the on-device engine ticks each second, starts a coding session at the due time, and marks the run awaiting_input when the session asks for approval; the person approves inside that session. Desktop notices follow the routine's flags. | device | apps/desktop/electron/runtime/localRoutineService.ts:226-240; localRoutineEngine.ts:480-537, :675-703 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Caps and notification flags | scheduled_tasks.credit_cap_microusd and max_executions; metadata.notificationSettings | Via the API to all apps | Deleted with the routine |
| Credits used | managed_usage_requests rows with scheduled_task_id | Computed on read (creditsUsed in the API) | Ledger rows keep after routine delete with scheduled_task_id set null (0301 migration foreign key) |
| Approval checkpoint (messages, pending tool calls, route) | scheduled_task_runs.approval_checkpoint, approval_request, expiry columns | Pending approval is returned in the run list | Cleared on resume or on expiry (schedule-service.ts:2000-2005, :2448-2455) |
| Notification record | in-app notification table via recordNotification (table name not opened) | Shown across signed-in apps | unknown |
| Local routine notification flags and run state | Electron device store (name unknown) | No | Removed with the routine |

**Models and providers.** A Cloud routine uses 'automatic selection' or a catalog model eligible for the plan; the route is chosen server-side (selectScheduledRoute) and a run that resumes after approval must use the same route and a model that can still call tools, otherwise it fails with an explanatory error (scheduled-agent-executor.ts:817-822, :936-980). Provider folder names for routes: unknown, not traced. The credit cap converts spend with the shared credit conversion (microusdFromCredits) so it follows the model's priced usage, not a model name.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for every Cloud action; the approval route requires sign-in, CSRF and the 'llm-completion' rate limit. |
| Permissions | Owner only. Tool permission levels (always allow, ask, deny) and the account's tool approval policy decide which steps ask; a saved deny wins (tool-call-gate.ts:68-76). |
| Subscription | Free accounts: scheduled runs are cancelled by managed-compute access policy with a reason, and the Tauri desktop UI disables scheduling (scheduled-agent-executor.ts:889-915; DesktopCloudSchedules.tsx:1058). The cap itself has no plan test in the code read. Number of routines limited by plan (schedule-service.ts:877-904). |
| Limits and metering | Maximum Runs up to 1,000,000; Credit Cap up to 1,000,000 credits; approval lifetime 24 hours (cloud-agent-run-service.ts:457); at most 32 tool calls in one approval (cloud-contracts schedules.ts:217); checked cost is the settled cost of the routine's managed usage requests. |
| Feature flags | AGI_DB_LOW_POWER environment setting changes the sweep rhythm (apps/web/lib/server/cron-low-power.ts:6-21). Others: none found. |
| Model compatibility | A model that cannot call tools gets no tools in a scheduled run (scheduled-agent-executor.ts:247-248), so no approval stops occur; resume needs a tool-capable route. |
| Provider restrictions | A route that keeps inputs out of training is required when the run reads Google user data or the owner opted out of training; otherwise the run errors (scheduled-agent-executor.ts:936-961, :962-972). |
| Local mode | Cloud caps and Cloud approvals do not exist in Local mode on Mobile and CLI (Cloud gate; NotManaged). Electron Local routines have their own notification flags and approvals inside the on-device coding session, no credit cap, and email is refused (localRoutineEngine.ts:66-69). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Cap reached before a run | Run cancelled with the cap message, routine paused, run slot returned | schedule-service.ts:2238-2253 |
| Cap raised on a paused routine | Pause reason cleared; routine stays paused until resumed | schedule-service.ts:1168-1181; test title schedule-service.test.ts:1700 [inferred] |
| Approval pending | Run status awaiting_approval; routine paused with approval_required; resumes automatically (reactivated) when the only waiting run is answered | schedule-service.ts:1906-1917, :2008-2026 |
| Two waiting runs | Routine stays paused until the other waiting run is answered | schedule-service.ts:2016-2022 |
| Approval ids changed | Conflict: 'The step waiting for approval has changed. Reload it and decide again.' | schedule-service.ts:1989-1996 |
| Approval expired | Conflict with the expired message when answering late; the sweep cancels the run | schedule-service.ts:1983-1986, :2424-2462 |
| Resume after approval, model gone | Error: 'The model this run started with is no longer available, so it cannot resume' | scheduled-agent-executor.ts:817-822 |
| Notification delivery fails | Logged as a warning; the run result is unaffected | schedule-service.ts:1841-1846, :1867-1871 |
| Account preferences unreadable | Notification fails closed (nothing sent) | apps/web/lib/services/__tests__/schedule-notification-service.test.ts:127 (title) |
| Offline approver | Approval posts fail with an error and the history reloads; offline queueing: not handled in the code | SchedulesPage.tsx:709-712 |
| Local routine approval pending | Awake lock released while waiting; notice sent only if push and approval flags are on | localRoutineEngine.ts:675-681 |
| Accessibility | Approval buttons labelled 'Approve the step this run is waiting on' on Mobile; VS Code uses a modal | ScheduleRunHistory.tsx (mobile):103-105; scheduleActions.ts:166-173 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/schedule-service.test.ts`: Titles: states a routine cap and what it has spent (1349); refuses a cap not a whole number in range (1369); stores the cap in microUSD (1387); will not enable a routine over cap (1435); refuses a manual run over cap (1457); pauses a routine whose run spent the rest of its cap (1472); keeps the schedule resumable when renamed while waiting for approval (1666); lifts the pause when re-enabled in the same edit (1700).
- `apps/web/app/api/schedules/[id]/runs/[runId]/approval/__tests__/route.test.ts`: 401, rate limit, CSRF, validation, claims the approval and resumes the run (titles 126-182).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.test.ts`: Gate table over tool classes and policies (223); denies instead of asks on unattended runs (411); escalation never falls through to allow (422).
- `apps/web/lib/services/__tests__/schedule-notification-service.test.ts`: Per-user push and email preferences, fail-closed, no notice for a user-cancelled run (titles 55-186).
- `apps/web/lib/services/schedule-service.policies.test.ts`: No announcement when another worker persisted cancelled or awaiting_approval (558); policy refusal without retry or notice (532).
- `apps/web/features/schedules/components/SchedulesPage.test.tsx`: Edits the routine notification policy from its own menu (556).
- `apps/web/features/schedules/components/LocalRoutinesSection.test.tsx`: Local routine section (titles not read).
- `apps/desktop/electron/__tests__/localRoutineEngine.test.ts`: Per-routine notification consent and rejected email (661); deferred approval notice only while unanswered (352); releases awake state while approvals remain (618).
- `apps/mobile/__tests__/ScheduleRunsScreen.test.tsx`: Mobile runs screen (titles not read).
- `apps/extension-vscode/src/__tests__/schedules.test.ts`: Schedule actions in VS Code; approval modal test not found by title.

**Test scenarios**

- **Credit cap pauses the routine**
  1. Create a routine with Credit Cap 1.
  2. Let runs spend at least 1 credit (or use a test account).
  3. Wait for the next sweep or press Run now.
  - Expected: Card shows the cap notice; next run is cancelled with the cap message; resume and Run now are refused until the cap is raised.
- **Maximum Runs**
  1. Create a routine with Maximum Runs 2 on a short interval.
  2. Wait for two runs.
  - Expected: Third occurrence does not run; the routine becomes completed and disabled.
- **Approve a waiting step**
  1. Give a routine a prompt that uses a tool set to Ask in connector permissions.
  2. Let it run; open its Run History.
  3. Press Approve.
  - Expected: Run shows needs approval with the tool summary and 'Expires <time>'; after Approve the same run continues and the routine is active again.
- **Deny a waiting step**
  1. Repeat the setup.
  2. Press Deny.
  - Expected: Run continues without that step and ends with a status; routine reactivates.
- **Approval left unanswered**
  1. Leave an approval for more than 24 hours (or set the expiry earlier in a test database).
  2. Run the sweep.
  - Expected: Run is cancelled with the 'Nobody approved or denied' message; routine stays paused; resume works.
- **Notification switches**
  1. Turn off 'When completed' and keep 'When failed or timed out'.
  2. Let a run succeed and another fail.
  - Expected: No notice for the success; a notice for the failure (push only if the Mobile app is signed in and account push is on).

**Where to look when it fails**

- Logs: 'Scheduled runs whose approval request lapsed were stopped' (schedule-service.ts:2487); 'Schedule approval notification was not queued'; 'Schedule completion notification was not queued'.
- Tables: scheduled_tasks.paused_reason, scheduled_task_runs.status/approval_*, managed_usage_requests.scheduled_task_id.
- Audit: none for caps or approvals found.
- Electron: [local-routines] console warnings.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/web/063-routines-schedules-and-triggers.md)
- Desktop: [70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md)
- Mobile: [70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md)
- CLI: [70-qa/test-plans/cli/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/cli/063-routines-schedules-and-triggers.md)
- VS Code: [70-qa/test-plans/vscode/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/vscode/063-routines-schedules-and-triggers.md)
- Chrome: [70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md)

## 10. Gaps and dependencies

- **Credit Cap exists on the Web form only.** Affects: Mobile, CLI, VS Code, Chrome, Tauri desktop and Electron Local routines.. Evidence: ScheduleForm.tsx:763; no creditCap in apps/desktop/src/features/schedules or mobile source. Work needed: Add the field or a link to the web editor; add a cap to Local routines.
- **The brief says Desktop has caps; the internal Tauri form has only Maximum executions, and the Electron Desktop shows the Web form.** Affects: Desktop documentation and the Tauri build.. Evidence: DesktopCloudSchedules.tsx:1802-1810 (no cap field). Work needed: Correct the brief and decide which desktop code is the product.
- **Per-routine notification choices cannot be set on CLI, Mobile, VS Code, Chrome or the Tauri form.** Affects: Those apps.. Evidence: Brief S63.30 (cli missing); no notificationSettings code in those apps. Work needed: Add controls or document web-only.
- **An expired approval notifies nobody and leaves the routine paused.** Affects: All Cloud routine owners who miss the notice.. Evidence: schedule-service.ts:1827 (cancelled not announced), :2441-2457. Work needed: Queue a notice on expiry.
- **Mobile hides the real cancel reason (cap or expiry text).** Affects: Mobile users.. Evidence: apps/mobile/src/features/schedules/service.ts:126-131. Work needed: Show the stored message for cancelled runs.
- **The cap is only enforced between runs, so one run can overshoot.** Affects: Owners with expensive prompts.. Evidence: ScheduleForm.tsx:772 helper text; schedule-service.ts:2238. Work needed: Optional: reserve against the remaining cap before a run.
- **Tools that would ask are withheld (web search, code execution), not paused for, so the run may complete without them.** Affects: Routines that rely on those tools under an Ask policy.. Evidence: scheduled-agent-executor.ts:263-333, :374-400. Work needed: Decide whether to pause for approval instead; the output note is the only signal.
- **Local routines have no credit cap.** Affects: Desktop Local routine owners using paid models via the cloud.. Evidence: localRoutineEngine.ts:74-75. Work needed: Define how a cap applies to device-run sessions.

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
- table:managed_usage_requests
- api:POST /api/schedules/[id]/runs/[runId]/approval
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-connectors-plugins-and-skills
- F063-07
- F063-09

## Unknown

- Name of the table behind recordNotification and its retention.
- How an approval for a tool in a Local (Electron) routine is surfaced and answered beyond opening its coding session (session code not read).
- Whether the account 'Mobile push' and 'Email' settings are shown to the user on every app (settings screens not read).
- What error reserveManagedUsageRequest raises when a plan allowance is exhausted (only the artifact-funding branch was read).
- Exact plan names that can set a Credit Cap: no plan test found in the cap code.
- Device store name for Local routines.
