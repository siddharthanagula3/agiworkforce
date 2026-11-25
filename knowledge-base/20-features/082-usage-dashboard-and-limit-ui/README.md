---
id: "AREA-082"
type: "area"
title: "Usage dashboard and limit UI"
features: ["F082-01", "F082-02", "F082-03", "F082-04", "F082-05", "F082-06", "F082-07", "F082-08", "F082-09", "F082-10", "F082-11", "F082-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 82. Usage dashboard and limit UI

This area shows a person how much of their plan they have used, when each limit resets, and how many credits they have left. When a limit is reached, it explains which limit was hit and offers a way forward: wait for the reset, buy extra usage, change model, or upgrade. It matters because a user who cannot see their limits either runs out without warning or cannot tell why a request was refused.

**Who uses it.** Every signed-in user sees their own usage on every app, from the server's account data. Free-plan users see the upgrade path and no meters, and paid-plan users can also buy credits and turn on auto-reload (apps/web/app/api/billing/top-up/route.ts:160-163 requires an active paid plan with a payment source). Workspace owners and admins set a monthly spend cap (apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx). Developers read the same numbers through the API with the usage:read key scope (apps/web/app/api/usage/limits/route.ts:59).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F082-01](F082-01-plan-and-billing-period.md) | Plan and billing period | built | built | built | built | built | built |
| [F082-02](F082-02-usage-meters-and-reset-times.md) | Usage meters and reset times | built | built | built | built | built | no |
| [F082-03](F082-03-usage-by-model-feature-work-and-project.md) | Usage by model, feature, work and project | built | built | partly | built | built | no |
| [F082-04](F082-04-usage-by-task-and-by-device-or-surface.md) | Usage by task and by device or surface | partly | partly | partly | built | built | n/a |
| [F082-05](F082-05-voice-image-video-research-storage-and-running-job.md) | Voice, image, video, research, storage and running jobs | built | built | built | n/a | n/a | n/a |
| [F082-06](F082-06-credit-balances-included-purchased-bonus-and-expir.md) | Credit balances: included, purchased, bonus and expiry | built | built | built | built | built | no |
| [F082-07](F082-07-usage-history-export-and-discrepancy-report.md) | Usage history, export and discrepancy report | built | built | built | n/a | n/a | n/a |
| [F082-08](F082-08-task-cost-estimate-and-actual-cost.md) | Task cost estimate and actual cost | built | built | built | built | built | n/a |
| [F082-09](F082-09-limit-warnings-and-blocked-state.md) | Limit warnings and blocked state | built | built | built | built | built | built |
| [F082-10](F082-10-buying-extra-usage-and-auto-reload.md) | Buying extra usage and auto-reload | built | built | n/a | n/a | n/a | n/a |
| [F082-11](F082-11-workspace-spending-cap.md) | Workspace spending cap | built | built | n/a | n/a | n/a | n/a |
| [F082-12](F082-12-resume-after-reset-preference.md) | Resume-after-reset preference | built | partly | built | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md).

## How this area works in the code

1. **1. The screen asks for the summary.** The web usage page and other shared views call one hook. Its state lives at module level, so the four copies on a chat route share one read and one timer. The hook fetches /api/usage and refreshes every 5 minutes while the app is active. (`apps/web/lib/hooks/useManagedUsageSummary.ts:44-55`, `apps/web/lib/hooks/useManagedUsageSummary.ts:67-89`, `apps/web/lib/hooks/useManagedUsageSummary.ts:22`)
2. **2. The summary route checks the caller.** The route authenticates the user through the user-scoped database. An API key needs the usage:read scope. Failure to authenticate returns an unauthorized error. (`apps/web/app/api/usage/route.ts:27-31`, `apps/web/app/api/usage/limits/route.ts:56-65`)
3. **3. The summary is assembled from several reads.** The service reads the credit balance, the entitlement (plan), spendable credits and prepaid balances in parallel. Free plans skip promotions and rolling windows. Rolling windows are read for the session (5 hour), weekly and flagship weekly limits. (`apps/web/lib/services/managed-usage-summary-service.ts:68-89`, `apps/web/lib/services/managed-usage-summary-service.ts:91-136`, `apps/web/lib/services/managed-usage-summary-service.ts:118-129`)
4. **4. Reset times and percentages are computed.** Each window gets a percentage used and a reset moment. Plan allowance values are shown as credit windows (monthly, weekly, five hour, flagship weekly, purchased, bonus, purchase expiry). (`apps/web/lib/services/managed-usage-summary-service.ts:146-156`, `apps/web/lib/services/managed-usage-summary-service.ts:158-209`, `apps/web/lib/services/managed-usage-summary-service.ts:211-240`)
5. **5. The limits route adds allowances, jobs and storage.** A second route returns the per-unit allowances (voice, video, computer-use), image count, running responses, storage meter and the voice-minute credit value. Its reads run in parallel and the running count can fail to null. (`apps/web/app/api/usage/limits/route.ts:67-101`, `apps/web/app/api/usage/limits/route.ts:44-54`)
6. **6. History and export are built from the usage ledger.** The history route takes granularity, workload and a time window, then reads grouped usage. The export route reads the same records and returns a CSV attachment. (`apps/web/app/api/usage/history/route.ts:29-61`, `apps/web/lib/services/account-usage-history-service.ts:197-250`, `apps/web/app/api/usage/export/route.ts:70-88`)
7. **7. A request is checked before it runs.** Before a managed request, the server checks the organisation spend cap (block mode only refuses) and reserves an idempotency key. A refused request returns a code, a message, the reset time and an alternative model, plus a recovery action. (`apps/web/lib/services/managed-usage-request-service.ts:338-400`, `apps/web/lib/services/spend-limit-service.ts:161-199`, `apps/web/lib/services/managed-usage-request-service.ts:402-429`, `apps/web/lib/services/managed-usage-request-service.ts:86-124`)
8. **8. The client shows the warning or the blocked card.** Web shows the paywall card inside the chat. Mobile shows the usage limit banner and bottom sheet. The CLI prints a message. Each app turns the returned code into its own text. (`apps/web/features/chat/components/InlinePaywallCard.tsx:236-246`, `apps/mobile/src/features/chat/components/UsageLimitBanner.tsx:142-160`, `apps/cli/src/errors.rs:373`)
9. **9. Buying credits and auto-reload.** A top-up creates a payment through the payment processor for a paid plan. Auto-reload settings are saved with a consent version, and a reload runs when the balance falls below the threshold. (`apps/web/app/api/billing/top-up/route.ts:160-170`, `apps/web/lib/services/auto-reload-service.ts:159-166`, `apps/web/lib/services/auto-reload-service.ts:411`, `apps/web/lib/services/auto-reload-service.ts:761`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/settings/sections/UsageSection.tsx` | Web usage page: meters, status line, credit cards, history, export and discrepancy form. |
| `apps/web/lib/hooks/useManagedUsageSummary.ts` | Shared client read of /api/usage with a 5 minute refresh and stale marking. |
| `apps/web/lib/services/managed-usage-summary-service.ts` | Builds the usage summary: plan, windows, reset times, credit balances and expiry. |
| `apps/web/app/api/usage/limits/route.ts` | Returns allowances, image count, running jobs, storage and voice minute value. |
| `apps/web/lib/services/managed-usage-request-service.ts` | Decides the error code, reset time, alternative model and recovery action for a blocked request. |
| `apps/web/lib/services/spend-limit-service.ts` | Owner spend cap decision: off, notify or block, cached for 60 seconds. |
| `apps/web/lib/services/auto-reload-service.ts` | Auto-reload settings, consent, top-up payments and failure recording. |
| `apps/web/lib/server/billing-waitlist-access.ts` | Upgrade access gate: a global switch or a beta redemption row. |
| `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Mobile cloud usage screen: meters, allowances, storage, history, overage and the limits sheet. |
| `apps/mobile/src/features/chat/components/UsageLimitBanner.tsx` | Mobile limit warning banner with the reset reminder action. |
| `apps/cli/src/usage_summary.rs` | CLI usage parser and text renderer for the account usage and history responses. |

## What is stored

- Credit balances, rolling usage windows and usage ledger rows (read by the summary and history services; table names not read): Server database, read through the user-scoped database (apps/web/lib/services/managed-usage-summary-service.ts:72-89)
- Bonus credits with a 90 day expiry, and purchased credits with expiry dates: Server database via getPrepaidCreditBalances (apps/web/lib/services/bonus-credit-service.ts:7, 164)
- Auto-reload settings, consent version and last failure reason: Server database (apps/web/lib/services/auto-reload-service.ts:357, 411, 761)
- Billing waitlist access: a beta redemption row per user: Server database table beta_redemptions (apps/web/db/neon/0011_waitlist.sql:30)
- Managed request reservations keyed by idempotency key: Server database (apps/web/lib/services/managed-usage-request-service.ts:238, 738)
- Spend decision cache, 60 seconds per organisation: In-memory on the server process (apps/web/lib/services/spend-limit-service.ts, SPEND_CACHE_TTL_MS)
- Usage summary shown on the web page and in the shared hook: Browser memory only, not written to storage (apps/web/lib/hooks/useManagedUsageSummary.ts:44-55)
- CSV export and the usage limit response: Generated per request and sent with no-store caching; not saved (apps/web/app/api/usage/export/route.ts:81-88)
- Discrepancy report: a support ticket with the usage record: Support ticket system (apps/web/app/api/usage/discrepancy/route.ts:182-195)
- Spend cap audit event when a request is refused: Audit log via recordAuditEvent (apps/web/lib/services/managed-usage-request-service.ts:381-397)
- Reset reminder preference and the scheduled reminder: User preference read by usageResetReminderEnabled (apps/web/lib/workflows/usage-reset-reminder-preference.ts:5); the workflow step is apps/web/lib/workflows/steps/send-usage-reset-reminder.ts

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **STRIPE_CHECKOUT_ENABLED and the payment secret key**: When off, or the secret key is missing, top-ups and auto-reload do not run. (apps/web/lib/services/auto-reload-service.ts:159-166; also apps/web/app/api/checkout/route.ts:58; declared in apps/web/lib/validate-env.ts:1213)
- **AGI_BILLING_WAITLIST_OPEN**: When set to 1, paid upgrades are open to everyone and the access-code gate is skipped. A run-time switch (readBillingUpgradesOpen) can also open them. (apps/web/lib/server/billing-waitlist-access.ts:28-30 and 38-40)
- **Spend limit mode (off, notify, block)**: Only block refuses managed requests over the cap. The mode is set by the owner in the workspace console. (apps/web/lib/services/spend-limit-service.ts:150-154 and 183; set in apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx)
- **Free-plan check**: Free plans skip promotions and rolling windows and use the free-trial reading. The UI hides the contract-priced and free details. (apps/web/lib/services/managed-usage-summary-service.ts:91-98; apps/web/features/settings/sections/UsageSection.tsx:1228)
- **Free voice allowance**: Sets the voice-minute count shown on a free plan. (apps/web/app/api/usage/limits/route.ts:79-96 (freeVoiceAllowanceSeconds))
- **Usage reset reminder preference**: When off for a user, the reset reminder is not sent. (apps/web/lib/workflows/usage-reset-reminder-preference.ts:5; checked at apps/web/lib/workflows/steps/send-usage-reset-reminder.ts:20)
- **Overage (use credits past plan limits)**: When enabled, requests past the plan limit may be paid from credits. Read from spendable credits. (apps/web/lib/services/managed-usage-summary-service.ts:196, 236; apps/web/lib/services/managed-usage-request-service.ts:715-717)
- **Rate limit buckets**: Each usage route has a rate limit that can be changed in configuration. (apps/web/app/api/usage/limits/route.ts:110 (credits-balance); apps/web/app/api/usage/reset-reminder/route.ts:66 (usage-reset-reminder); apps/web/app/api/usage/limit-resets/route.ts:44 (usage-limit-reset-apply))
- **CLI usage mode**: Chooses how the CLI shows usage (text or other modes). (apps/cli/src/usage_summary.rs:343 (usage_mode))

## Shared between apps

The web usage routes and services under apps/web (summary, limits, history, export, discrepancy, estimate, reset reminder) are used by the web app. The desktop shows the hosted web app, so it uses the same routes and page (per AGENTS.md section 5). The shared contract types (parseManagedUsageSummaryResponse, AccountUsageLimitsResponse, ManagedUsageSummaryResponse) come from @agiworkforce/types under packages/contracts. The mobile app calls the same endpoints through its own services/usage.ts (fetchUsageSnapshot, fetchUsageHistory, fetchUsageAllowances, applyLimitReset). The CLI parses the same JSON in apps/cli/src/usage_summary.rs (parse_account_usage, parse_usage_history). The VS Code extension reads /api/usage and /api/usage/history (apps/extension-vscode/src/utils/api.ts:1545, 1555). Separate per app: all rendering code (web components, mobile screens and banners, CLI text, VS Code webview, Chrome side panel), the mobile usage store, and the mobile reminder service.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says the estimate endpoint backs the task estimate on web, desktop and API. No app caller of /api/usage/estimate was found in the web app. The composer has no estimate for chat turns. The only pre-run estimate is the browser-side research estimate. (apps/web/app/api/usage/estimate/route.ts:60-117 (route exists); apps/web/features/chat/components/research/ResearchActivity.tsx:280-292 (client estimate); the brief cites apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4936, which shows no estimate code)
- Brief says resume-after-reset is missing on web, desktop and mobile. Mobile has a Notify me when it resets action, and the server has a reset reminder route with no web UI caller found. The action is a notification, not an automatic resume. (apps/mobile/src/features/chat/components/UsageLimitBanner.tsx:66; apps/web/app/api/usage/reset-reminder/route.ts:18-22)
- Upgrade-waitlist gate: first-time buyers without a beta redemption row are refused for upgrades. The brief says this blocks buyers on CLI, VS Code and Chrome. I did not confirm the gate on the top-up path. Top-up checks only the plan and payment source. (apps/web/lib/server/billing-waitlist-access.ts:42-52; apps/web/app/api/billing/top-up/route.ts:160-163)
- Spend cap fails open. If the spend state cannot be read, the request is allowed. This is deliberate, but it means the cap is not a hard stop when the read fails. (apps/web/lib/services/spend-limit-service.ts:175-179)
- Spend cap is eventual. Decisions are cached for 60 seconds, so a workspace can overshoot its cap by about one window of spend. The console states this. (apps/web/lib/services/spend-limit-service.ts:53-60 (comment on SPEND_CACHE_TTL_MS))
- CLI extra-usage command only opens the pricing page and does not offer a purchase. (apps/cli/src/tui/tui_app.rs:6698-6700; apps/cli/src/claude_parity.rs:219)
- The mobile usage store and the project breakdown are missing. S82.19 is marked missing on mobile, which matches the code. (apps/mobile/src/features/settings/cloud-usage/index.tsx (no project breakdown found))
- Brief line references are stale in places. For example, the brief cites ChatComposerNew.tsx:4936 for the estimate. The line does not show it. (Brief at ~/Desktop/agiworkforce-QA/tools/area-briefs/082-usage-dashboard-and-limit-ui.md (S82.22))

## Not established

- Desktop, Chrome (apps/extension) and VS Code (apps/extension-vscode) UI files were not opened beyond the lines the brief names and a few grep hits. Their behaviour is taken from the brief's status lines.
- Database table names for credit balances, rolling usage and the usage ledger were not read (only the service calls).
- Whether the CSV export is cut at USAGE_EXPORT_ROW_LIMIT (10,000) was not checked (apps/web/lib/services/account-usage-history-service.ts:37).
- Whether the top-up path checks the waitlist gate: only lines 160-170 of apps/web/app/api/billing/top-up/route.ts were read.
- The full mobile cloud usage screen (apps/mobile/src/features/settings/cloud-usage/index.tsx) was only searched, not read end to end.
- Exact contents of apps/web/lib/billing/usage-credits and the rolling-usage helpers were not read.
- Whether any web UI calls /api/usage/reset-reminder was not established beyond the search of apps/web/features and apps/web/app.
- Device or surface breakdown (S82.21): none found, so it is recorded as missing from the brief.
- Whether the workspace spend cap UI (WorkspaceSpendLimit.tsx) saves the mode through a confirmation dialog: useConfirmAction is imported at line 4, but the save path was not read.
- No builds, tests or servers were run, as instructed. Read only.
