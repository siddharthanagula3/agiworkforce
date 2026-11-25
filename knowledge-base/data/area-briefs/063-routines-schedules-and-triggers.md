# Area 63. Routines, schedules, and triggers

35 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S63.01 Routine gallery.
- Should: A browsable gallery of ready-made routines the user can start from at any time.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/schedules/components/SchedulesPage.tsx:845; apps/web/features/schedules/components/SchedulesPage.tsx:952; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:907; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:931; apps/mobile/app/(app)/schedules/index.tsx:366; apps/mobile/app/(app)/schedules/index.tsx:474

## S63.02 Create routine from a prompt.
- Should: The user writes a prompt (instructions or a plain-language request) and a saved routine is created from it.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/schedules/components/SchedulesPage.tsx:684; apps/web/features/schedules/components/ScheduleForm.tsx:163; apps/web/features/schedules/components/SchedulesPage.tsx:389; apps/web/app/api/schedules/route.ts:107; apps/mobile/app/(app)/schedules/index.tsx:209; apps/mobile/src/features/schedules/components/QuickSchedule.tsx:71; apps/mobile/app/(app)/schedules/create.tsx:83; apps/mobile/src/features/schedules/service.ts:119

## S63.03 Create routine from a completed task.
- Should: From a finished task or chat turn, one action turns that work into a saved routine.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:4050; apps/web/features/schedules/components/SchedulesPage.tsx:800; apps/cli/src/claude_parity.rs:256; apps/cli/src/claude_parity.rs:777

## S63.04 Routine name and description.
- Should: A routine has a user-set name and an optional description, both editable.
- Status: web done, desktop done, cli done, chrome done
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:128; apps/web/features/schedules/components/ScheduleForm.tsx:144; apps/web/features/schedules/components/SchedulesPage.tsx:389; apps/web/app/api/schedules/route.ts:107; apps/cli/src/schedules.rs:419; apps/cli/src/lib.rs:2325; apps/extension/src/features/side-panel/schedulesSection.ts:487; apps/extension/src/features/side-panel/schedulesSection.ts:579

## S63.05 Prompt editor.
- Should: A multi-line editor to write and later edit the routine's instructions.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:165; apps/web/features/schedules/components/ScheduleForm.tsx:170; apps/web/features/schedules/components/SchedulesPage.tsx:388; apps/web/app/api/schedules/[id]/route.ts:73; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:194; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:200; apps/mobile/app/(app)/schedules/create.tsx:81; apps/mobile/src/features/schedules/service.ts:136

## S63.06 Source selection.
- Should: The user chooses which sources (project files, instructions, docs, web) a routine run may read.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/schedules/components/ScheduleAccessFields.tsx:48; apps/web/features/schedules/components/ScheduleForm.tsx:601; apps/web/lib/services/scheduled-agent-executor.ts:776; apps/desktop/electron/config.ts:39; packages/contracts/types/src/product-routes.ts:20; apps/web/app/chat/schedules/page.tsx:15

## S63.07 Repository selection.
- Should: The user picks a code repository the routine runs against (checked out for the run).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S63.08 Connector selection.
- Should: Per routine, the user chooses which connectors/tools the run may use.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/schedules/components/ScheduleAccessFields.tsx:48; apps/web/lib/services/scheduled-agent-executor.ts:307; apps/desktop/electron/config.ts:39; packages/contracts/types/src/product-routes.ts:20; apps/web/app/chat/schedules/page.tsx:15

## S63.09 Agent selection.
- Should: The user picks which agent (custom agent/persona) runs the routine.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:252; apps/web/lib/services/schedule-service.ts:1006

## S63.10 Model/effort selection.
- Should: Per routine, the user picks the model and the reasoning effort the run uses.
- Status: chrome missing

## S63.11 One-time schedule.
- Should: A routine can be set to run once at a chosen future date and time.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:221; apps/web/features/schedules/components/ScheduleForm.tsx:240; apps/web/lib/services/schedule-service.ts:532; apps/web/app/api/schedules/route.ts:107; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:139; apps/mobile/src/features/schedules/policy.ts:4; apps/mobile/src/features/schedules/service.ts:119

## S63.12 Recurring schedule.
- Should: A routine can repeat on a cadence (daily/weekly/monthly or similar) and fires on each occurrence.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:223; apps/web/lib/services/schedule-service.ts:541; apps/web/app/api/cron/run-schedules/route.ts:43; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:240; apps/mobile/src/features/schedules/policy.ts:6; apps/mobile/src/features/schedules/service.ts:119; apps/cli/src/lib.rs:1109; apps/cli/src/lib.rs:2167

## S63.13 Timezone control.
- Should: The user sets the time zone a routine's times are interpreted in.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:428; apps/web/lib/services/schedule-service.ts:463; apps/web/app/api/schedules/route.ts:107; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:264; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:142; apps/mobile/src/features/schedules/service.ts:119; apps/cli/src/lib.rs:1115; apps/cli/src/lib.rs:2157

## S63.14 Advanced recurrence.
- Should: Beyond simple daily/weekly, a routine accepts advanced recurrence (cron, intervals, iCalendar rules, run windows).
- Status: web done, desktop done, cli done, chrome missing
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:226; apps/web/features/schedules/components/ScheduleForm.tsx:227; apps/web/lib/services/schedule-service.ts:520; apps/web/app/api/schedules/route.ts:107; apps/cli/src/lib.rs:1109; apps/cli/src/schedules.rs:87

## S63.15 Event-trigger selection.
- Should: A routine can be set to run when an external event happens (GitHub, Slack, Gmail, Calendar, webhook) and it runs when the event arrives.
- Status: web done, desktop done, mobile missing, cli done, chrome missing
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:228; apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:239; apps/web/lib/triggers/trigger-fire.ts:135; apps/web/lib/services/scheduled-agent-executor.ts:593; apps/cli/src/daemon.rs:1006; apps/cli/src/lib.rs:5596; apps/cli/src/daemon.rs:46

## S63.16 Event filters.
- Should: Event triggers can be narrowed (event types, account, field conditions, repeat suppression) so only matching events start the routine.
- Status: web done, desktop done, mobile missing, cli done, chrome missing
- Code: apps/web/features/schedules/components/TriggerConditionsEditor.tsx:168; apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:423; apps/desktop/electron/config.ts:39; packages/contracts/types/src/product-routes.ts:20; apps/cli/src/features/hooks/hooks.rs:487; apps/cli/src/features/hooks/hooks.rs:505; apps/cli/src/features/hooks/hooks.rs:514; apps/cli/src/daemon.rs:734

## S63.17 Webhook trigger.
- Should: A routine gets a webhook URL (with a secret); a signed POST to it starts a run.
- Status: web done, desktop done, mobile missing, chrome missing, api done
- Code: apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:69; apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:252; apps/web/app/api/webhooks/connectors/[triggerId]/route.ts:46; apps/web/lib/services/scheduled-agent-executor.ts:593; apps/web/lib/triggers/trigger-fire.ts:135; packages/platform/context-engine/src/manifest-store.ts:57

## S63.18 API trigger.
- Should: A documented, token-authenticated API call starts a routine run.
- Status: api done
- Code: apps/web/public/openapi.json:4396; apps/web/public/openapi.json:4080; apps/web/app/api/schedules/[id]/runs/route.ts:69

## S63.19 Manual run.
- Should: A "Run now" control starts the routine immediately and the run completes with a result.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/features/schedules/components/ScheduleCard.tsx:344; apps/web/features/schedules/components/SchedulesPage.tsx:491; apps/web/app/api/schedules/[id]/runs/route.ts:94; apps/web/lib/services/scheduled-agent-executor.ts:593; packages/platform/context-engine/src/manifest-store.ts:57; apps/mobile/src/features/schedules/components/ScheduleCard.tsx:278; apps/mobile/src/features/schedules/components/ScheduleCard.tsx:182; apps/extension-vscode/src/core/commandSetup.ts:2230

## S63.20 Next-run display.
- Should: Each routine shows when it will next run.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/schedules/components/ScheduleCard.tsx:209; apps/web/features/schedules/components/ScheduleCard.tsx:235; apps/web/app/api/schedules/route.ts:72; apps/mobile/src/features/schedules/components/ScheduleCard.tsx:218; apps/mobile/src/features/schedules/service.ts:107; apps/cli/src/schedules.rs:340; apps/cli/src/lib.rs:2139; apps/extension-vscode/src/features/schedules/schedulePresentation.ts:78

## S63.21 Last-run display.
- Should: Each routine shows when it last ran and whether that run failed.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/schedules/components/ScheduleCard.tsx:243; apps/web/features/schedules/components/ScheduleCard.tsx:263; apps/web/app/api/schedules/route.ts:72; apps/mobile/src/features/schedules/components/ScheduleCard.tsx:238; apps/cli/src/schedules.rs:347; apps/cli/src/lib.rs:2139; apps/extension-vscode/src/features/schedules/schedulePresentation.ts:90; apps/extension-vscode/src/features/schedules/schedulesTree.ts:35

## S63.22 Run-history list.
- Should: A list of a routine's past runs with status and time.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/schedules/components/ScheduleCard.tsx:288; apps/web/features/schedules/components/ScheduleRunHistory.tsx:65; apps/web/features/schedules/components/SchedulesPage.tsx:432; apps/web/app/api/schedules/[id]/runs/route.ts:58; apps/mobile/src/features/schedules/components/ScheduleCard.tsx:252; apps/mobile/src/features/schedules/store.ts:220; apps/mobile/src/features/schedules/service.ts:165; apps/cli/src/lib.rs:1140

## S63.23 Per-run results.
- Should: Opening a run shows what that run produced (its output text), not just its status.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/schedules/components/ScheduleRunHistory.tsx:54; apps/web/features/schedules/components/SchedulesPage.tsx:1086; apps/web/app/api/schedules/[id]/runs/route.ts:58; apps/web/lib/services/scheduled-agent-executor.ts:593; apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx:197; apps/cli/src/schedules.rs:448; apps/extension-vscode/src/features/schedules/scheduleActions.ts:72; apps/extension-vscode/src/features/schedules/scheduleActions.ts:226

## S63.24 Enable/disable.
- Should: A routine can be paused and resumed without deleting it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/schedules/components/ScheduleCard.tsx:279; apps/web/features/schedules/components/SchedulesPage.tsx:410; apps/web/app/api/schedules/[id]/route.ts:108; apps/mobile/src/features/schedules/components/ScheduleCard.tsx:189; apps/mobile/src/features/schedules/store.ts:190; apps/mobile/src/features/schedules/service.ts:152; apps/cli/src/schedules.rs:306; apps/cli/src/lib.rs:2362

## S63.25 Pause until date.
- Should: The user pauses a routine until a chosen date, after which it resumes by itself.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S63.26 Edit schedule.
- Should: An existing routine's timing and settings can be edited and saved.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/schedules/components/ScheduleCard.tsx:300; apps/web/features/schedules/components/SchedulesPage.tsx:388; apps/web/app/api/schedules/[id]/route.ts:73; apps/mobile/app/(app)/schedules/index.tsx:123; apps/mobile/app/(app)/schedules/create.tsx:81; apps/mobile/src/features/schedules/service.ts:136

## S63.27 Delete routine.
- Should: A routine can be deleted, after a confirmation, and stops running.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/schedules/components/ScheduleCard.tsx:395; apps/web/features/schedules/components/SchedulesPage.tsx:992; apps/web/features/schedules/components/SchedulesPage.tsx:530; apps/web/app/api/schedules/[id]/route.ts:89; apps/mobile/app/(app)/schedules/index.tsx:144; apps/mobile/src/features/schedules/store.ts:159; apps/mobile/src/features/schedules/service.ts:147; apps/cli/src/lib.rs:1130

## S63.28 Duplicate routine.
- Should: One action copies an existing routine into a new editable routine.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S63.29 Share routine template.
- Should: A routine (or its template) can be shared so another person can create their own copy.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/app/api/schedules/[id]/share/route.ts:40; apps/web/lib/services/schedule-share-service.ts:52; apps/web/features/schedules/components/SchedulesPage.tsx:653; apps/web/features/schedules/components/SharedSchedulePreview.tsx:52; apps/web/features/schedules/components/SchedulesPage.tsx:703; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:688; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1178

## S63.30 Notification preferences.
- Should: Per routine, the user chooses how (or whether) they are notified about its runs.
- Status: cli missing

## S63.31 Budget controls.
- Should: Per routine, the user caps what it may spend (cost, credits, or number of runs).
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:629; apps/web/lib/services/schedule-service.ts:1301

## S63.32 Required-approval behavior.
- Should: When an unattended run needs approval for an action, it pauses and asks the user, and resumes once approved.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/lib/services/scheduled-agent-executor.ts:548; apps/web/lib/services/scheduled-agent-executor.ts:569; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:151

## S63.33 Missed-run explanation.
- Should: When a scheduled occurrence is missed or skipped, the run history says so and why.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/schedules/components/ScheduleRunHistory.tsx:166; apps/web/lib/services/schedule-service.ts:1892; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1312; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1381; apps/mobile/src/features/schedules/service.ts:127; apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx:198; apps/cli/src/schedules.rs:448; apps/extension-vscode/src/features/schedules/schedulePresentation.ts:132

## S63.34 Deferred execution after allowance reset.
- Should: A run that hits the usage allowance is held and runs automatically once the allowance resets.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S63.35 Connection-expiry repair flow.
- Should: When a connector a routine depends on expires, the user is told on the routine and led to reconnect it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
