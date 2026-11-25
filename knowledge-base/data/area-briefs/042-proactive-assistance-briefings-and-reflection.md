# Area 42. Proactive assistance, briefings, and reflection

25 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S42.01 Daily briefing setup.
- Should: The user sets up a recurring daily briefing that is generated and delivered to them.
- Status: web done, desktop done, mobile done, chrome done
- Code: packages/contracts/cloud-contracts/src/schedules.ts:722; apps/web/lib/services/scheduled-agent-executor.ts:738; apps/mobile/src/features/schedules/templates.ts:22; apps/extension/src/features/side-panel/schedulesSection.ts:408; apps/extension/src/features/side-panel/schedulesSection.ts:479; apps/extension/src/features/cloud-bridge/schedulesClient.ts:113

## S42.02 Briefing topics.
- Should: The user chooses the topics the briefing covers.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.03 Selected connected sources.
- Should: The user picks which connected sources (mail, calendar, apps) the briefing reads.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.04 Delivery time and timezone.
- Should: The user sets the delivery time and timezone of the briefing.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:428; apps/web/features/schedules/components/ScheduleCard.tsx:231; apps/web/features/schedules/components/SchedulesPage.tsx:321; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:264; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:54; apps/mobile/src/features/schedules/service.ts:150; apps/cli/src/lib.rs:1115; apps/cli/src/schedules.rs:238

## S42.05 Briefing home.
- Should: A briefing home shows today's briefing.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.06 Briefing cards.
- Should: The briefing is laid out as cards per item.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.07 Calendar overview.
- Should: The briefing includes an overview of today's calendar.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.08 Email or work summary.
- Should: The briefing includes an email or work summary.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.09 Suggested next actions.
- Should: The briefing suggests next actions.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.10 Follow-up questions on a briefing item.
- Should: The user can ask a follow-up question about a briefing item.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome done
- Code: apps/extension/src/background.ts:1951; apps/extension/src/background.ts:1288

## S42.11 Listen-to-briefing mode.
- Should: The user can listen to the briefing read aloud.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.12 Mark helpful/not helpful.
- Should: The user can mark a briefing helpful or not helpful.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.13 Dismiss topic.
- Should: The user can dismiss a topic from future briefings.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.14 Add topic.
- Should: The user can add a topic to future briefings.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.15 Pause briefings.
- Should: The user can pause and resume briefings.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/schedules/components/ScheduleCard.tsx:281; apps/web/features/schedules/components/SchedulesPage.tsx:410; apps/mobile/app/(app)/schedules/index.tsx:135; apps/mobile/src/features/schedules/service.ts:150; apps/cli/src/schedules.rs:306; apps/cli/src/lib.rs:2362; apps/extension-vscode/src/core/commandSetup.ts:2220; apps/extension-vscode/src/features/schedules/scheduleActions.ts:82

## S42.16 Quiet hours.
- Should: During quiet hours the product holds proactive notifications and nudges.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/services/push-notification-service.ts:190; apps/web/lib/services/quiet-hours-service.ts:35; apps/web/lib/jobs/job-handlers.ts:93

## S42.17 Work-completion notifications.
- Should: The user is notified when background work (a scheduled run or agent task) completes.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/features/settings/sections/NotificationsSection.tsx:36; apps/web/lib/services/schedule-notification-service.ts:56; apps/web/lib/services/agent-notification-service.ts:124; apps/mobile/stores/notificationPrefsStore.ts:50; apps/mobile/services/notifications.ts:48; apps/web/lib/services/schedule-notification-service.ts:89; apps/cli/src/tui/tui_app.rs:5894; apps/cli/src/config.rs:1138

## S42.18 Important-change alerts.
- Should: The product alerts the user to important changes in things they follow.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.19 Personal usage reflection.
- Should: The user can see a reflection on how they use the product.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:209; apps/web/features/settings/sections/ReflectSection.tsx:65; apps/web/app/api/reflect/route.ts:32; apps/mobile/app/(app)/settings/reflect.tsx:56; apps/mobile/src/features/reflect/service.ts:39

## S42.20 Periodic recap.
- Should: The product produces a recap for a recurring period (week/month) and delivers it.
- Status: not applicable anywhere

## S42.21 Annual recap.
- Should: The user can see a recap of their past year.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/ReflectSection.tsx:19; apps/web/features/settings/sections/ReflectSection.tsx:65; apps/web/app/api/reflect/route.ts:32; apps/mobile/src/features/reflect/service.ts:17; apps/mobile/app/(app)/settings/reflect.tsx:56; apps/mobile/src/features/reflect/service.ts:39

## S42.22 Break reminders.
- Should: The product reminds the user to take a break after a chosen amount of use.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/TimeFocusSection.tsx:168; apps/web/features/time-focus/TimeFocusReminder.tsx:182; apps/web/features/chat/pages/WebChatPage.tsx:5889; apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx:59; apps/mobile/app/(app)/(tabs)/_layout.tsx:7

## S42.23 Time-and-focus settings.
- Should: A Time & focus settings page holds break reminders and quiet hours.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:210; apps/web/features/settings/sections/TimeFocusSection.tsx:102; apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx:37; apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx:70; apps/web/lib/services/push-notification-service.ts:190

## S42.24 Clear end-of-digest state.
- Should: A digest ends with a clear "all caught up" state.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S42.25 Proactive-feature history and saved editions.
- Should: Past briefings and proactive outputs are kept as a browsable history.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/lib/services/schedule-service.ts:1321; apps/web/app/api/schedules/runs/route.ts:30; apps/web/features/schedules/components/RecentScheduleResults.tsx:55; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:519; apps/mobile/src/features/schedules/components/ScheduleCard.tsx:329; apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx:209
