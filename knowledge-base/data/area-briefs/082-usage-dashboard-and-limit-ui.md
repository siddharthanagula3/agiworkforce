# Area 82. Usage dashboard and limit UI

33 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S82.01 Current plan.
- Should: Every signed-in surface shows the account's current plan, read from the server.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/app/api/me/route.ts:139; apps/cli/src/usage_summary.rs:232; apps/cli/src/usage_summary.rs:146; apps/cli/src/lib.rs:4048; apps/extension-vscode/src/utils/api.ts:801; apps/extension/src/side_panel.ts:8325; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:177; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:102

## S82.02 Billing period.
- Should: Users can see the current billing period: when it renews or ends.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/settings/sections/BillingSection.tsx:757; apps/web/features/settings/sections/UsageSection.tsx:575; apps/web/features/settings/sections/UsageSection.tsx:121; apps/web/lib/hooks/useManagedUsageSummary.ts:64; apps/mobile/src/features/settings/cloud-billing/index.tsx:318; apps/mobile/src/features/settings/cloud-usage/index.tsx:418; apps/mobile/src/features/billing/store.ts:67; apps/cli/src/usage_summary.rs:232

## S82.03 Overall usage meter.
- Should: An overall usage meter shows how much of the plan allowance is used.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/settings/sections/UsageSection.tsx:542; apps/web/lib/hooks/useManagedUsageSummary.ts:64; apps/web/lib/services/managed-usage-summary-service.ts:123; apps/mobile/src/features/settings/cloud-usage/index.tsx:418; apps/mobile/src/features/settings/cloud-usage/index.tsx:100; apps/mobile/services/usage.ts:45; apps/cli/src/usage_summary.rs:232; apps/cli/src/usage_summary.rs:295

## S82.04 Per-model usage.
- Should: Users can see usage broken down by model (at least the flagship-model cap and per-model spend).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/settings/sections/UsageSection.tsx:370; apps/web/features/settings/sections/UsageSection.tsx:564; apps/web/features/settings/sections/UsageSection.tsx:216; apps/web/lib/services/account-usage-history-service.ts:104; apps/mobile/src/features/settings/cloud-usage/index.tsx:536; apps/mobile/app/(app)/settings/cloud-usage.tsx:1; apps/cli/src/usage_summary.rs:740; apps/extension-vscode/src/data/usagePresentation.ts:123

## S82.05 Per-feature usage.
- Should: Users can see usage broken down by feature/product area (chat, work, research, code, browser).
- Status: web done, desktop done, mobile done, api done
- Code: apps/web/features/settings/sections/UsageSection.tsx:370; apps/web/features/settings/sections/UsageSection.tsx:216; apps/web/lib/services/account-usage-history-service.ts:85; apps/mobile/src/features/settings/cloud-usage/index.tsx:531; apps/mobile/app/(app)/settings/cloud-usage.tsx:1; apps/web/app/api/usage/history/route.ts:24

## S82.06 Voice usage.
- Should: Users can see their voice usage (minutes used against any voice allowance).
- Status: web done, desktop done, mobile done, api done
- Code: apps/web/app/api/usage/limits/route.ts:80; apps/web/features/settings/sections/UsageSection.tsx:107; apps/mobile/src/features/settings/cloud-usage/index.tsx:348; apps/mobile/app/(app)/settings/cloud-usage.tsx:1

## S82.07 Image usage.
- Should: Users can see their image-generation usage.
- Status: web done, desktop done, mobile done, api done
- Code: apps/web/app/api/usage/limits/route.ts:80; apps/web/features/settings/sections/UsageSection.tsx:257; apps/mobile/src/features/settings/cloud-usage/index.tsx:387; apps/mobile/app/(app)/settings/cloud-usage.tsx:1

## S82.08 Video usage.
- Should: Users can see their video-generation usage (seconds used against the allowance).
- Status: web done, desktop done, mobile done, api done
- Code: apps/web/app/api/usage/limits/route.ts:80; apps/web/features/settings/sections/UsageSection.tsx:108; apps/mobile/src/features/settings/cloud-usage/index.tsx:348; apps/mobile/app/(app)/settings/cloud-usage.tsx:1

## S82.09 Research usage.
- Should: Users can see how much of their usage went to research (Deep Research).
- Status: web done, desktop done, mobile done, api done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4303; apps/web/lib/services/account-usage-history-service.ts:77; apps/mobile/src/features/settings/cloud-usage/index.tsx:531; apps/mobile/app/(app)/settings/cloud-usage.tsx:1

## S82.10 Coding/work usage.
- Should: Users can see how much of their usage went to coding and agentic work.
- Status: web done, desktop done, mobile done, cli done, vscode done, api done
- Code: apps/web/features/settings/sections/UsageSection.tsx:370; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:591; apps/web/features/settings/sections/UsageSection.tsx:216; apps/web/lib/services/account-usage-history-service.ts:85; apps/mobile/src/features/settings/cloud-usage/index.tsx:531; apps/mobile/app/(app)/settings/cloud-usage.tsx:1; apps/cli/src/usage_summary.rs:727; apps/extension-vscode/src/data/usagePresentation.ts:120

## S82.11 Storage usage.
- Should: Users can see storage used against their plan storage limit.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227; apps/mobile/src/features/settings/cloud-usage/index.tsx:403; apps/mobile/app/(app)/settings/cloud-usage.tsx:1

## S82.12 Active-job count.
- Should: Users can see how many jobs/responses are running now, ideally against their plan's concurrent limit.
- Status: web done, desktop done, mobile done
- Code: apps/web/lib/rate-limit.ts:1303; apps/web/features/settings/sections/UsageSection.tsx:474; apps/mobile/src/features/settings/cloud-usage/index.tsx:393; apps/mobile/app/(app)/settings/cloud-usage.tsx:1

## S82.13 Remaining credits.
- Should: Users can see how many credits remain (plan windows and purchased balance).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/settings/sections/UsageSection.tsx:121; apps/web/features/settings/sections/UsageSection.tsx:498; apps/web/lib/hooks/useManagedUsageSummary.ts:64; apps/web/lib/services/managed-usage-summary-service.ts:30; apps/mobile/src/features/settings/cloud-usage/index.tsx:334; apps/mobile/app/(app)/settings/cloud-usage.tsx:1; apps/cli/src/usage_summary.rs:295; apps/cli/src/usage_summary.rs:317

## S82.14 Purchased versus included credits.
- Should: Users can tell purchased credits apart from the plan's included allowance.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/settings/sections/UsageSection.tsx:498; apps/web/features/settings/sections/UsageSection.tsx:419; apps/web/features/settings/sections/BillingSection.tsx:1154; apps/web/lib/hooks/useManagedUsageSummary.ts:64; apps/web/lib/services/managed-usage-summary-service.ts:30; apps/mobile/src/features/settings/cloud-usage/index.tsx:343; apps/mobile/app/(app)/settings/cloud-usage.tsx:1; apps/cli/src/usage_summary.rs:317

## S82.15 Promotional credits.
- Should: Users can see promotional/bonus credits they were given, how much remains and when they lapse.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/settings/sections/UsageSection.tsx:398; apps/web/lib/services/bonus-credit-service.ts:70; apps/mobile/src/features/settings/cloud-usage/index.tsx:342; apps/mobile/app/(app)/settings/cloud-usage.tsx:1

## S82.16 Credit-expiry information.
- Should: Users can see when each kind of credit expires (plan allowance reset, purchased balance lifetime, bonus lapse).
- Status: web done, desktop done, mobile done
- Code: apps/web/features/settings/sections/UsageSection.tsx:398; apps/web/features/settings/sections/UsageSection.tsx:416; apps/web/lib/services/managed-usage-summary-service.ts:155; apps/mobile/src/features/settings/cloud-usage/index.tsx:306; apps/mobile/app/(app)/settings/cloud-usage.tsx:1

## S82.17 Reset countdown.
- Should: Each usage window shows how long until it resets.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/settings/sections/UsageSection.tsx:121; apps/web/features/settings/sections/UsageSection.tsx:542; apps/web/lib/hooks/useManagedUsageSummary.ts:64; apps/mobile/src/features/settings/cloud-usage/index.tsx:300; apps/mobile/services/usage.ts:45; apps/cli/src/usage_summary.rs:338; apps/cli/src/usage_summary.rs:295; apps/cli/src/usage_summary.rs:146

## S82.18 Daily/weekly/monthly history.
- Should: Users can review usage history by day, week and month.
- Status: web done, desktop done, mobile done, api done
- Code: apps/web/features/settings/sections/UsageSection.tsx:89; apps/web/features/settings/sections/UsageSection.tsx:729; apps/mobile/src/features/settings/cloud-usage/index.tsx:121; apps/mobile/app/(app)/settings/cloud-usage.tsx:1; apps/web/app/api/usage/history/route.ts:24; apps/web/lib/services/account-usage-history-service.ts:95

## S82.19 Usage by Project.
- Should: Users can see usage broken down by project.
- Status: web done, desktop done, mobile missing, api done
- Code: apps/web/lib/services/account-usage-history-service.ts:175; apps/web/features/settings/sections/UsageSection.tsx:220; apps/web/public/openapi.json:974

## S82.20 Usage by task.
- Should: Users can see usage per task (agent run / work session).
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:591; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:281; apps/web/lib/services/cloud-agent-run-service.ts:518; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:179; apps/mobile/src/features/tasks/service.ts:29

## S82.21 Usage by device or surface where useful.
- Should: Where useful, users can see usage broken down by device or surface (web, desktop, mobile, CLI, IDE, extension).
- Status: web missing, desktop missing, mobile missing, api missing

## S82.22 Estimated task cost.
- Should: Before or while a task runs, the user sees an estimate of what it will cost.
- Status: web done, desktop done, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4936; apps/web/features/chat/components/research/ResearchActivity.tsx:231; apps/web/app/api/usage/estimate/route.ts:111

## S82.23 Actual task cost.
- Should: After a task finishes, the user sees what it actually cost.
- Status: web done, desktop done, mobile done, cli done, vscode done, api done
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:591; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:281; apps/web/lib/services/cloud-agent-run-service.ts:518; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:181; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:185; apps/cli/src/usage_summary.rs:347; apps/cli/src/output.rs:606; apps/extension-vscode/src/data/tokenCounter.ts:261

## S82.24 Budget warning.
- Should: Users are warned before they hit a usage limit.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:1396; apps/mobile/app/(app)/chat/[id].tsx:1836; apps/mobile/src/features/chat/components/UsageLimitBanner.tsx:20; apps/cli/src/models/streaming.rs:111; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3083; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:532; apps/extension-vscode/src/utils/api.ts:837; apps/extension/src/side_panel.ts:549

## S82.25 Budget-reached state.
- Should: When a limit is reached the user sees a clear blocked state explaining which limit and what they can do.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/InlinePaywallCard.tsx:386; apps/web/lib/services/managed-usage-request-service.ts:392; apps/mobile/app/(app)/chat/[id].tsx:1606; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:77; apps/mobile/app/(app)/chat/[id].tsx:400; apps/cli/src/errors.rs:373; crates/agiworkforce-llm/src/error.rs:362; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3080

## S82.26 Alternative eligible model suggestion.
- Should: When a limit or plan blocks the chosen model, the user is offered an eligible alternative model.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:664; apps/web/features/chat/pages/WebChatPage.tsx:1660; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:287; apps/mobile/app/(app)/chat/[id].tsx:2014; apps/cli/src/models/provider_dispatch.rs:285; apps/cli/src/errors.rs:602; apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:146; apps/extension/src/side_panel.ts:8808

## S82.27 Wait-until-reset option.
- Should: At a limit, the user is offered waiting until the reset, with the reset time, as an alternative to paying.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/InlinePaywallCard.tsx:435; apps/web/features/chat/components/InlinePaywallCard.tsx:321; packages/contracts/types/src/billing-catalog.ts:515; apps/mobile/app/(app)/chat/[id].tsx:2012; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:251; apps/cli/src/usage_summary.rs:174; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3080; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:532

## S82.28 Resume-after-reset preference.
- Should: Users can choose to have blocked work resume automatically (or be notified) once their limit resets.
- Status: web missing, desktop missing, mobile missing

## S82.29 Extra-usage purchase.
- Should: Users can buy extra usage (credits) when they run out, from where they hit the limit.
- Status: web done, desktop done
- Code: apps/web/features/chat/lib/quotaPaywallSlot.ts:61; apps/web/features/chat/components/InlinePaywallCard.tsx:241; apps/web/app/api/billing/top-up/route.ts:164; apps/web/features/settings/sections/BillingSection.tsx:942; apps/cli/src/tui/tui_app.rs:4063; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:519; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1088; apps/extension/src/side_panel.ts:8436
- Unfinished: cli: /extra-usage only prints the web pricing link; credits are bought on web. Also the upgrade-waitlist gate (hasBillingWaitlistAccess: a beta_redemptions row) blocks first-time buyers. | vscode: 'Add credits' opens web billing; no in-extension purchase. Also the upgrade-waitlist gate (hasBillingWaitlistAccess: a beta_redemptions row) blocks first-time buyers. | chrome: At a limit Chrome opens web usage/billing pages; no purchase in the panel. Also the upgrade-waitlist gate (hasBillingWaitlistAccess: a beta_redemptions row) blocks first-time buyers.

## S82.30 Auto-reload settings.
- Should: Users can turn on automatic credit reload (top up when the balance falls below a threshold) and configure it.
- Status: web done, desktop done
- Code: apps/web/features/settings/sections/BillingSection.tsx:900; apps/web/features/billing/components/AutoReloadPanel.tsx:184; apps/web/app/api/billing/auto-reload/route.ts:116; apps/web/lib/services/auto-reload-service.ts:1142

## S82.31 Spending cap.
- Should: An owner can set a spending cap that stops managed usage once reached.
- Status: web done, desktop done
- Code: apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:165; apps/web/lib/services/spend-limit-service.ts:175; apps/web/lib/services/managed-usage-request-service.ts:347

## S82.32 Download usage report.
- Should: Users can download a usage report (e.g. CSV).
- Status: web done, desktop done, api done
- Code: apps/web/app/api/usage/export/route.ts:91; apps/web/features/settings/sections/UsageSection.tsx:824; apps/web/app/api/usage/history/route.ts:24; apps/web/lib/services/account-usage-history-service.ts:95

## S82.33 Billing discrepancy report.
- Should: Users can report a billing or usage discrepancy and have it tracked.
- Status: web done, desktop done
- Code: apps/web/app/api/usage/discrepancy/route.ts:201; apps/web/features/settings/sections/UsageSection.tsx:592
