---
id: "GAPS-AREA-082"
type: "gap-list"
title: "Gaps: Usage dashboard and limit UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 82. Usage dashboard and limit UI

107 open gaps that touch this area. Area page: [20-features/082-usage-dashboard-and-limit-ui](../../20-features/082-usage-dashboard-and-limit-ui/README.md).

## CMP-C16

**Keep waiting and resume the task after a usage limit resets**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F082-12](../../20-features/082-usage-dashboard-and-limit-ui/F082-12-resume-after-reset-preference.md)
- Detail: A turn that hits the limit stops with the reset time; the user must send the message again.
- Evidence: apps/cli/src/errors.rs:216; searched: auto_continue in apps/cli/src

## CMP-C17

**Last-known usage shown when the usage service is down**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: If the account lookup fails, /usage shows Unavailable with the reason and no earlier figures.
- Evidence: apps/cli/src/usage_summary.rs:557

## CMP-C20

**Press f in /usage to apply usage-saving recommendations**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: /usage lists usage but offers no key to apply savings suggestions.
- Evidence: apps/cli/src/usage_summary.rs; apps/cli/src/repl/slash_commands.rs (searched: recommend)

## CMP-C24

**Spend-limit warnings at 75% and 95% of a cap**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Detail: No warning appears as a personal or admin cap is approached; the limit message appears only when it is hit.
- Evidence: searched: 75, 95, warning threshold in apps/cli/src/cost_ledger.rs, usage_summary.rs, errors.rs

## CMP-C25

**Status line shows plan rate-limit usage and reset time**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: The status line has no field for plan window usage or reset time; those appear only in /usage.
- Evidence: apps/cli/src/tui/widgets/statusline_setup.rs:28

## CMP-C26

**Usage report over recent sessions (/insights)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: /insights only prints a hint to read the session's JSON events; there is no report.
- Evidence: apps/cli/src/claude_parity.rs:1632

## CMP-C27

**Wait for the limit reset and continue automatically**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F082-12](../../20-features/082-usage-dashboard-and-limit-ui/F082-12-resume-after-reset-preference.md)
- Detail: When a limit is hit the CLI says when it resets and stops; it does not wait and resume the task.
- Evidence: apps/cli/src/errors.rs:657-694 (message only)

## CMP-CP11

**Status line shows session cost and context window usage**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: Has no session duration and no user script that receives the data The status line toggles model, tokens, cost, branch, mode and context, but has no session duration and no user script that receives the data.
- Evidence: apps/cli/src/tui/widgets/statusline_setup.rs:7-12,28

## CMP-CP13

**Usage broken down by skill, subagent, plugin and MCP server**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: It does not split by skill, subagent, plugin or MCP server /usage shows session tokens by model and account history by workload; it does not split by skill, subagent, plugin or MCP server.
- Evidence: apps/cli/src/tui/widgets/screen_renderers.rs:738; apps/cli/src/usage_summary.rs:150

## CMP-D3

**Per-chat credit use and top consuming chats**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F082-04](../../20-features/082-usage-dashboard-and-limit-ui/F082-04-usage-by-task-and-by-device-or-surface.md), [F082-08](../../20-features/082-usage-dashboard-and-limit-ui/F082-08-task-cost-estimate-and-actual-cost.md)
- Detail: Usage shows no per-chat cost or heavy-chat ranking.
- Evidence: searched: perChat, top consuming, byConversation in apps/web/features/settings

## CMP-DP5

**Admin spend limits with alerts**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: No per-user or per-group caps A workspace monthly cap with alert threshold and notify or block mode exists; no per-user or per-group caps.
- Evidence: apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx

## CMP-DP7

**Usage history charts by surface, model and speed**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F082-01](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md), [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md), [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md), [F082-07](../../20-features/082-usage-dashboard-and-limit-ui/F082-07-usage-history-export-and-discrepancy-report.md)
- Detail: No split by surface, speed or token type Usage shows history by model with day, week or month steps; no split by surface, speed or token type.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:120

## CMP-VP3

**Plan usage and limits shown in the editor for paid plans**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F081-03](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md), [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: No usage bars in the chat panel itself Account & Usage is a pick list with credit-window rows for paid plans; no usage bars in the chat panel itself.
- Evidence: apps/extension-vscode/src/core/commandSetup.ts:2149-2260; searched: usageBar, usage bar in src/features/sidebar-webview

## CMP-VP4

**Usage broken down by skill, subagent, plugin and MCP server**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: There is no split by skill, plugin or MCP server and no fix suggestions Usage shows credit windows and history by workload, model and day or week; there is no split by skill, plugin or MCP server and no fix suggestions.
- Evidence: apps/extension-vscode/src/data/usagePresentation.ts:115-139

## CMP-W23

**Per-member, group and seat-type monthly spend limits**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Only one workspace cap and one personal cap exist; no group, role or member limits with overrides.
- Evidence: searched: memberCap, perMember, group budget, usage limit in apps/web/lib/services, app/api/settings/organization/groups, roles

## CMP-W35

**Counter of deep research runs left**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md), [F082-05](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)
- Detail: Research draws on the shared plan usage and only a quota warning header is sent; no remaining-runs counter is shown.
- Evidence: apps/web/app/api/llm/v1/chat/completions/route.ts:677,775 (X-Quota-Warning); searched apps/web (app, features, lib, shared) and packages (ui, contracts, client), tests excluded: research remaining, research quota

## CMP-W49

**Per-user usage limits with group and individual overrides**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Workspace has one monthly spend cap with enforcement and alert threshold; no per-member or per-group limits.
- Evidence: apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:82

## CMP-W55

**Unlimited everyday chat on a base model**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md), [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Detail: Free chat runs on a daily quota and no plan advertises unlimited base-model chat.
- Evidence: apps/web/lib/free-quota-authorization.ts; searched: unlimited, instant in apps/web/lib/billing

## CMP-WP19

**Credit expiry rules**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md), [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md), [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Detail: Purchased credits show 'No expiry date recorded' when none is set Bonus credits show an expiry date; purchased credits show 'No expiry date recorded' when none is set.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:370-398

## CMP-WP25

**Chat resumes by itself when a usage limit resets**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md), [F082-12](../../20-features/082-usage-dashboard-and-limit-ui/F082-12-resume-after-reset-preference.md)
- Detail: A stopped chat does not continue on its own We can remind you at reset, but a stopped chat does not continue on its own.
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:1816; apps/web/app/api/usage/reset-reminder/route.ts

## CMP-WP30

**Usage alerts at chosen thresholds sent to chosen people**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: No several thresholds or recipient list The workspace spend cap has one alert percentage and a notify mode; no several thresholds or recipient list.
- Evidence: apps/web/app/api/settings/organization/spend-limit/route.ts:37

## CMP-WP31

**Usage credit alerts by notification**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Detail: No separate credit alert notification found In-chat banner warns near limits; no separate credit alert notification found.
- Evidence: packages/ui/unified-chat/src/components/UsageWarningBanner.tsx:17

## CMP-WP32

**Usage page: per-model weekly limits**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md), [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: No row per model One extra weekly bar for flagship models when shown; no row per model.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:1381-1393

## GAP-AREA082-LW04

**Spend cap fails open. If the spend state cannot be read, the request is allowed. This is deliberate, but it means the cap is not a hard stop when the read fails.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-082
- Detail: Area 82. Usage dashboard and limit UI
- Evidence: apps/web/lib/services/spend-limit-service.ts:175-179

## GAP-AREA082-LW05

**Spend cap is eventual. Decisions are cached for 60 seconds, so a workspace can overshoot its cap by about one window of spend. The console states this.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-082
- Detail: Area 82. Usage dashboard and limit UI
- Evidence: apps/web/lib/services/spend-limit-service.ts:53-60 (comment on SPEND_CACHE_TTL_MS)

## GAP-AREA082-LW06

**CLI extra-usage command only opens the pricing page and does not offer a purchase.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-082
- Detail: Area 82. Usage dashboard and limit UI
- Evidence: apps/cli/src/tui/tui_app.rs:6698-6700; apps/cli/src/claude_parity.rs:219

## GAP-AREA082-LW07

**The mobile usage store and the project breakdown are missing. S82.19 is marked missing on mobile, which matches the code.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-082
- Detail: Area 82. Usage dashboard and limit UI
- Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx (no project breakdown found)

## GAP-CAP-research-13

**Research allowance, cost estimate and limits: Comparison W35 says the counter of runs left is Missing while ledger S35.34 says done; they conflict. Mobile has no allowance view.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md), [F082-05](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)
- Requirement items: S35.34, S82.05, S82.09
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-usage-limits-01

**Rolling session window (five hours): Mobile Free and Free on other apps show text only by decision. No known gap in windows themselves; see limit-reached and Local-mode items.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Requirement items: S82.03, S82.17
- Detail: Claude yes, ChatGPT partly; AGI built

## GAP-CAP-usage-limits-03

**Separate weekly cap for the top model family: No per-model rows; the model picker does not say which models fall under the sub-limit (not verified).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Requirement items: S82.04
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-usage-limits-04

**Top tier without a session cap: Claude verifies the account before lifting the cap; AGI has no such verification step (not found).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Requirement items: S82.03
- Detail: Claude yes, ChatGPT partly; AGI built

## GAP-CAP-usage-limits-05

**Monthly billing-period allowance: Web scorecard saw a Premium test account denied with 'billing period ended ... no credits' while Billing said Active with no renewal date (6-defects W-12, W-14, W-19).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-01](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md), [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Requirement items: S82.02, S82.03
- Detail: Claude unknown, ChatGPT partly; AGI built

## GAP-CAP-usage-limits-06

**Fixed reset time and countdown: Web Usage 'Last updated' lags the data (6-defects W-19).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Requirement items: S82.17
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-usage-limits-07

**One allowance shared across apps: Chrome definition says no usage dashboard; comparison says an account-menu meter exists (docs conflict).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-01](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md)
- Requirement items: S82.01
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-usage-limits-08

**Explaining what drains usage: Deep Research estimate says none on Auto (code-audit-defects web-C).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-08](../../20-features/082-usage-dashboard-and-limit-ui/F082-08-task-cost-estimate-and-actual-cost.md)
- Requirement items: S82.22, S82.23
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-usage-limits-10

**Warning before a limit: Threshold differs between docs (80% in definition, 75% in the Chrome row); no separate credit-alert notification (WP31); CLI spend cap warnings missing (C24).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Requirement items: S82.24
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-usage-limits-11

**Limit reached message with reset and options: Seen failing on web: raw 'Error:' text with no Upgrade path (W-19); Free banner shown after Stop although the limit was not reached (W-19); image send at the limit fails silently (W-7); banner stale until reload (W-7).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Requirement items: S82.25, S82.26, S82.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-usage-limits-13

**Wait and auto-continue after reset: No resume-after-reset preference on any app.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-12](../../20-features/082-usage-dashboard-and-limit-ui/F082-12-resume-after-reset-preference.md)
- Requirement items: S82.28
- Detail: Claude partly, ChatGPT unknown; AGI partly built

## GAP-CAP-usage-limits-14

**Usage credits to continue past limits: Sales are closed before 2027-01-01 by owner decision, but the gate is a runtime flag plus access codes (code-audit-defects web-A).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-10](../../20-features/082-usage-dashboard-and-limit-ui/F082-10-buying-extra-usage-and-auto-reload.md)
- Requirement items: S82.29
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-usage-limits-15

**Buy extra usage credits: No in-extension or in-CLI purchase; first-time buyers hit the waitlist gate.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-10](../../20-features/082-usage-dashboard-and-limit-ui/F082-10-buying-extra-usage-and-auto-reload.md)
- Requirement items: S82.29
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-usage-limits-18

**Credit expiry, refund and transfer rules: Expiry display gap for purchased credits.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Requirement items: S82.15, S82.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-usage-limits-20

**Usage dashboard with history: Mobile has no per-project usage; no split by surface (S82.21); no per-surface/speed (DP7). Voice row says 'No voice left' when nothing is used (W-19).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-01](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md), [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md), [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md), [F082-07](../../20-features/082-usage-dashboard-and-limit-ui/F082-07-usage-history-export-and-discrepancy-report.md)
- Requirement items: S82.01, S82.03, S82.04, S82.05, S82.13, S82.14, S82.18, S82.19
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-usage-limits-21

**Per-chat and per-task cost: No per-chat cost or heavy-chat list (D3).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-04](../../20-features/082-usage-dashboard-and-limit-ui/F082-04-usage-by-task-and-by-device-or-surface.md), [F082-08](../../20-features/082-usage-dashboard-and-limit-ui/F082-08-task-cost-estimate-and-actual-cost.md)
- Requirement items: S82.20, S82.22, S82.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-usage-limits-22

**Usage in the terminal and editor: No plan window in CLI status line (C25); no last-known usage when the service is down (C17); no usage bars in the VS Code chat panel (VP3); CLI shows meters to Free, breaking the Free rule (code-audit cli-B).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Requirement items: S82.03, S82.10
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-usage-limits-23

**What drains the plan, with recommendations: No skill, subagent, plugin or MCP split; no /insights report.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Requirement items: S82.05, S82.10
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-usage-limits-25

**Alternative model or reserve at a limit: Whether the suggestion lists an on-device model is not verified. No capped reserve.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Requirement items: S82.26
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-usage-limits-26

**Free plan allowance and display: No unlimited base-model chat (W55). A false Free-limit banner after Stop (W-19). CLI shows Free meters.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Requirement items: S82.03
- Detail: Claude yes, ChatGPT yes; AGI off by decision

## GAP-CAP-usage-limits-27

**Org, seat and per-user spend limits: No group, role or member limits and no override order.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md)
- Requirement items: S82.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-usage-limits-29

**Spend alerts at thresholds: No several thresholds or recipient list; no credit alert notification.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Requirement items: S82.24
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F082-01-01

**The web Usage page does not show the plan as a title line or the billing period dates.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-01](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md)
- Detail: Affects: Web and hosted Desktop users. Work needed: Add a plan and period header to the Usage page, or link clearly to Billing.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:1268-1315 renders no period_start or period_end; dates are in apps/web/features/settings/sections/BillingSection.tsx:822-826.

## GAP-F082-01-02

**CLI cannot show period dates because its type omits them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-01](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md)
- Detail: Affects: CLI users. Work needed: Add the two optional fields and a render line, plus a test in the module.
- Evidence: apps/cli/src/usage_summary.rs:66-93.

## GAP-F082-01-03

**Chrome has no confirmed visible plan or period display.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-01](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md)
- Detail: Affects: Chrome extension users. Work needed: Find or add the element that shows the plan, then update the matrix.
- Evidence: doc: docs/product/surface-feature-matrix.md:249; apps/extension/src/side_panel.ts:13399-13408 only stores plan name.

## GAP-F082-01-04

**Free plan reset times exist in the API but web and mobile Free views hide them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-01](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md)
- Detail: Affects: Free users on web and mobile. Work needed: Product decision recorded in memory says Free shows only Upgrade, so no work unless the decision changes.
- Evidence: apps/web/lib/services/managed-usage-summary-service.ts:92-97 builds free reset times; apps/web/features/settings/sections/UsageSection.tsx:1319-1329 shows only Upgrade.

## GAP-F082-01-05

**The brief's first-draft claim that Free plans show a next reset time on the Usage page is not what web or mobile do.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-01](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md)
- Detail: Affects: Testers using the brief. Work needed: Correct the brief text.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:1319-1329.

## GAP-F082-02-01

**The draft says a window with no cap is shown without a bar. In code it is hidden.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Detail: Affects: Web and mobile testers. Work needed: Correct the brief wording or show a no-cap line.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:1356, 1380; apps/mobile/src/features/settings/cloud-usage/index.tsx:1109, 1132

## GAP-F082-02-02

**Mobile never re-reads on a timer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Detail: Affects: Mobile users who leave Usage open. Work needed: Add a focused-screen interval or reuse the web policy.
- Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx:901-903

## GAP-F082-02-03

**Chrome has no meter UI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Detail: Affects: Chrome users. Work needed: Decide whether a meter is required; if so build it from usageWindowViews.
- Evidence: apps/extension/src/side_panel.ts:13207-13273

## GAP-F082-02-04

**Web does not re-read at the exact reset moment.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Detail: Affects: Web users waiting for a reset. Work needed: Schedule a refresh at the earliest reset like Chrome does.
- Evidence: apps/web/lib/hooks/useManagedUsageSummary.ts:104-108

## GAP-F082-02-NOTBUILT

**Usage meters and reset times: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Requirement items: S82.03, S82.17
- Detail: Chrome: S82.03, S82.17

## GAP-F082-03-01

**No project breakdown on mobile, CLI or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: Affects: Mobile, CLI, VS Code users. Work needed: Parse and render byProject, cap at 8 rows, add tests.
- Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx:712-721; apps/cli/src/usage_summary.rs:136-146; apps/extension-vscode/src/data/usagePresentation.ts:115-139

## GAP-F082-03-02

**No visible workload filter control; the API supports it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: Affects: All apps. Work needed: Add a filter to the web card and pass the parameter.
- Evidence: apps/web/app/api/usage/history/route.ts:42; apps/web/features/settings/sections/UsageSection.tsx:1079

## GAP-F082-03-03

**Chrome has no history view; the brief status 'built' for Chrome is not supported by code found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: Affects: Chrome users. Work needed: Confirm and correct the brief status or build the view.
- Evidence: no history call found under apps/extension

## GAP-F082-03-04

**The brief says the CLI and VS Code show 'task'; they show product area, not tasks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: Affects: Testers reading the brief. Work needed: Correct the wording.
- Evidence: apps/cli/src/usage_summary.rs:787-803; apps/extension-vscode/src/data/usagePresentation.ts:125-127

## GAP-F082-03-05

**CLI and VS Code are fixed to day grouping.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: Affects: CLI and VS Code users. Work needed: Pass granularity.
- Evidence: apps/cli/src/usage_summary.rs:9; apps/extension-vscode/src/utils/api.ts:1555

## GAP-F082-03-NOTBUILT

**Usage by model, feature, work and project: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Requirement items: S82.04, S82.05, S82.10, S82.19
- Detail: Mobile: S82.19; Chrome: S82.04, S82.05, S82.10, S82.19

## GAP-F082-04-01

**Per-device and per-surface usage is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-04](../../20-features/082-usage-dashboard-and-limit-ui/F082-04-usage-by-task-and-by-device-or-surface.md)
- Detail: Affects: All apps and the API. Work needed: Record a surface in usage attribution, aggregate it, return it, render it (see proposals).
- Evidence: apps/web/lib/services/account-usage-history-service.ts:104-250 groups by workload, model, project only.

## GAP-F082-04-02

**CLI and VS Code show per-turn or per-session cost, not per task.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-04](../../20-features/082-usage-dashboard-and-limit-ui/F082-04-usage-by-task-and-by-device-or-surface.md)
- Detail: Affects: CLI and VS Code. Work needed: Decide whether task-level cost is required there.
- Evidence: apps/cli/src/usage_summary.rs:401-441; apps/extension-vscode/src/core/commandSetup.ts:2287

## GAP-F082-04-03

**Brief code references for task cost point at the wrong lines.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-04](../../20-features/082-usage-dashboard-and-limit-ui/F082-04-usage-by-task-and-by-device-or-surface.md)
- Detail: Affects: Documentation. Work needed: Update the brief to lines 752-758, 336-385 and 376-392.
- Evidence: TasksPage.tsx:591 and CloudRunDetailSheet.tsx:179-185 are not cost code.

## GAP-F082-04-04

**Chrome has no per-task cost.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-04](../../20-features/082-usage-dashboard-and-limit-ui/F082-04-usage-by-task-and-by-device-or-surface.md)
- Detail: Affects: Chrome. Work needed: Confirm and mark not applicable or build.
- Evidence: no file found

## GAP-F082-04-NOTBUILT

**Usage by task and by device or surface: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F082-04](../../20-features/082-usage-dashboard-and-limit-ui/F082-04-usage-by-task-and-by-device-or-surface.md)
- Requirement items: S82.21
- Detail: Web: S82.21; Desktop: S82.21; Mobile: S82.21

## GAP-F082-05-01

**Web Usage page has no storage meter while the brief marks it done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-05](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)
- Detail: Affects: Web and hosted Desktop. Work needed: Render a storage card from limits.data.storage.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx (no storage reference); apps/web/app/api/usage/limits/route.ts:99

## GAP-F082-05-02

**Research has no meter or allowance, only a history share.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-05](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)
- Detail: Affects: All apps. Work needed: Product decision on whether research gets its own allowance.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:1139-1143

## GAP-F082-05-03

**Brief code reference for research points to unrelated code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-05](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)
- Detail: Affects: Documentation. Work needed: Correct to usage-attribution.ts:30-37.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4303

## GAP-F082-05-04

**Free voice allowance is computed but never shown on web or mobile Free views.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-05](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)
- Detail: Affects: Free users. Work needed: None if Free is Upgrade-only by decision; otherwise add.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:1228

## GAP-F082-05-05

**The draft says the 'Allowances card' and 'Storage card' exist on web; web has a 'This month' card and no storage card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-05](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)
- Detail: Affects: Testers. Work needed: Correct wording.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:841

## GAP-F082-06-01

**Mobile hides bonus and purchased credits while store purchases are off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Detail: Affects: Mobile users with bonus credits. Work needed: Decide whether read-only bonus credits should show even without sales.
- Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx:419-421; apps/mobile/src/features/billing/storePurchases.json:2

## GAP-F082-06-02

**CLI, VS Code and Chrome do not show bonus credits or expiry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Detail: Affects: CLI, VS Code, Chrome users. Work needed: Add the bonus and purchase_expiry fields and render them.
- Evidence: apps/cli/src/usage_summary.rs:41-48; apps/extension-vscode/src/features/settings/SettingsPanel.ts:99-108; apps/extension/src/features/side-panel/usageWindows.ts:116-125

## GAP-F082-06-03

**Brief marks Chrome 'done' for credits, but no balance is shown there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Detail: Affects: Chrome users, brief readers. Work needed: Correct the brief or add the display.
- Evidence: no use of the balance string found in apps/extension/src/side_panel.ts

## GAP-F082-06-04

**Draft says purchased credits have an expiry date of their own. Code says they usually do not expire, with expiring amounts only where local law requires.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Detail: Affects: Testers. Work needed: Correct wording.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:398-404

## GAP-F082-06-05

**VS Code shows a single spendable total, not the included, purchased and bonus split.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Detail: Affects: VS Code users. Work needed: Read credits.purchased and credits.bonus and show them.
- Evidence: apps/extension-vscode/src/utils/api.ts:1393-1394

## GAP-F082-06-NOTBUILT

**Credit balances: included, purchased, bonus and expiry: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Requirement items: S82.13, S82.14, S82.15, S82.16
- Detail: Chrome: S82.13, S82.14, S82.15, S82.16

## GAP-F082-07-01

**Download CSV shows no error or retry when the export fails.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-07](../../20-features/082-usage-dashboard-and-limit-ui/F082-07-usage-history-export-and-discrepancy-report.md)
- Detail: Affects: Web and hosted desktop users. Work needed: Fetch the file in code, show the server message with a retry, then save the blob.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:1173-1180 is a plain anchor with download

## GAP-F082-07-02

**Mobile lacks project breakdown, CSV and report form.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-07](../../20-features/082-usage-dashboard-and-limit-ui/F082-07-usage-history-export-and-discrepancy-report.md)
- Detail: Affects: Mobile users. Work needed: Project list only if wanted. CSV and form are decided against.
- Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx:707-721; doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-27

## GAP-F082-07-03

**CLI history has no week or month choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-07](../../20-features/082-usage-dashboard-and-limit-ui/F082-07-usage-history-export-and-discrepancy-report.md)
- Detail: Affects: CLI users. Work needed: Pass a granularity argument to the history path.
- Evidence: apps/cli/src/usage_summary.rs:16

## GAP-F082-07-04

**Brief says desktop is built; the Tauri usage section has none of the three controls.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-07](../../20-features/082-usage-dashboard-and-limit-ui/F082-07-usage-history-export-and-discrepancy-report.md)
- Detail: Affects: Tauri build only (internal). Work needed: None if Tauri stays internal; state that in the brief.
- Evidence: apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:447

## GAP-F082-07-05

**Brief line references for the report route are stale (brief cites 182-195; code is at 177-193).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-07](../../20-features/082-usage-dashboard-and-limit-ui/F082-07-usage-history-export-and-discrepancy-report.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief.
- Evidence: apps/web/app/api/usage/discrepancy/route.ts:177-193

## GAP-F082-08-01

**The estimate endpoint has no caller in any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-08](../../20-features/082-usage-dashboard-and-limit-ui/F082-08-task-cost-estimate-and-actual-cost.md)
- Detail: Affects: All apps. Work needed: Wire it to the composer or remove it.
- Evidence: apps/web/__tests__/api/routes-without-callers.test.ts:155

## GAP-F082-08-02

**No estimate for ordinary chat turns or tasks, only research runs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-08](../../20-features/082-usage-dashboard-and-limit-ui/F082-08-task-cost-estimate-and-actual-cost.md)
- Detail: Affects: Web, desktop. Work needed: Decide scope; reuse the endpoint.
- Evidence: Only ResearchCostEstimate and ResearchActivity use estimateResearchCredits (repo search)

## GAP-F082-08-03

**Brief says the estimate is built on desktop and the API only and cites ChatComposerNew.tsx:4936; that line is an unrelated status panel, not an estimate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-08](../../20-features/082-usage-dashboard-and-limit-ui/F082-08-task-cost-estimate-and-actual-cost.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4915-4925

## GAP-F082-08-04

**No retry control when the settled credit lookup fails.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-08](../../20-features/082-usage-dashboard-and-limit-ui/F082-08-task-cost-estimate-and-actual-cost.md)
- Detail: Affects: Web. Work needed: Add a retry or longer poll.
- Evidence: use-settled-turn-credits.ts:58-60

## GAP-F082-09-01

**Spend-cap refusals are not classified, so no shared paywall card or reset time.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Detail: Affects: All apps, workspace members. Work needed: Add the codes to the shared classifier with reason copy.
- Evidence: No match for organization_spend_cap_reached in packages/contracts/types/src; handled only in apps/mobile/services/apiErrors.ts:109 and apps/web/features/chat/lib/live-voice-session.ts:251

## GAP-F082-09-02

**No explicit 'wait' choice; waiting is only implied by reset text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Detail: Affects: Web, mobile. Work needed: Optional: label the dismiss action around the reset time.
- Evidence: InlinePaywallCard.tsx:476; PaywallBottomSheet.tsx:403 shows only Try later/Close

## GAP-F082-09-03

**Brief cites UsageSection.tsx:753 as the wait option; that line is the personal monthly spend limit text, not the plan-limit wait option.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:707-755

## GAP-F082-09-04

**Whether the CLI reads reset and alternative from the response body is unclear.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Detail: Affects: CLI. Work needed: Confirm and avoid the extra fetch.
- Evidence: errors.rs:995-1000 versus streaming.rs:285-301

## GAP-F082-10-01

**No automatic retry after a failed reload; it switches off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-10](../../20-features/082-usage-dashboard-and-limit-ui/F082-10-buying-extra-usage-and-auto-reload.md)
- Detail: Affects: Web, desktop. Work needed: Decide whether to add a bounded retry.
- Evidence: apps/web/lib/services/auto-reload-service.ts:638, 666

## GAP-F082-10-02

**Brief says the waitlist gate blocks first-time buyers of top-up; the gate is not in the top-up route.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-10](../../20-features/082-usage-dashboard-and-limit-ui/F082-10-buying-extra-usage-and-auto-reload.md)
- Detail: Affects: Documentation. Work needed: Correct the brief; keep the gate note for plan checkout.
- Evidence: grep of hasBillingWaitlistAccess: only checkout, portal, waitlist and team seat routes

## GAP-F082-10-03

**No in-app purchase on mobile, VS Code, Chrome, CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-10](../../20-features/082-usage-dashboard-and-limit-ui/F082-10-buying-extra-usage-and-auto-reload.md)
- Detail: Affects: Those apps. Work needed: Link-outs exist; in-app purchase not planned.
- Evidence: cloudUtilityErrorActions.ts:60; tui_app.rs:6698

## GAP-F082-10-04

**No component test found for AutoReloadPanel, TopUpPanel or WorkUsageCard.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-10](../../20-features/082-usage-dashboard-and-limit-ui/F082-10-buying-extra-usage-and-auto-reload.md)
- Detail: Affects: Test coverage. Work needed: Add component tests.
- Evidence: name search of test files

## GAP-F082-11-01

**Blocked turns on the limit-table path are not audited per request.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md)
- Detail: Affects: Admins investigating refusals. Work needed: Record an audit event or metric.
- Evidence: apps/web/lib/managed-compute-gate.ts:527-530

## GAP-F082-11-02

**Two caps exist (organization_spend_limits via gate, policy monthlySpendCapCents via reservation) with different codes and UI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md)
- Detail: Affects: Admins and support. Work needed: Decide one owner and copy.
- Evidence: WorkspaceSpendLimit.tsx and WorkspacePolicySection.tsx:630; managed-usage-request-service.ts:399

## GAP-F082-11-03

**Refusal codes over_cap and organization_spend_cap_reached are not in the shared quota classifier, so apps show no reset or recovery card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md)
- Detail: Affects: All apps. Work needed: Add to the classifier.
- Evidence: No match in packages/contracts/types/src

## GAP-F082-11-04

**Switching to Block has no confirmation dialog.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md)
- Detail: Affects: Admins. Work needed: Use useConfirmAction (AGENTS.md section 9).
- Evidence: WorkspaceSpendLimit.tsx:278-322

## GAP-F082-11-05

**Brief cites 'confirms through the confirmation dialog' and per-request audit event; both only partly true.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: Same lines

## GAP-F082-12-01

**No automatic resume; only a notification.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-12](../../20-features/082-usage-dashboard-and-limit-ui/F082-12-resume-after-reset-preference.md)
- Detail: Affects: All apps. Work needed: Product decision, then a re-send mechanism.
- Evidence: apps/web/lib/workflows/usage-reset-reminder-workflow.ts:15-16

## GAP-F082-12-02

**Brief marks web, desktop and mobile as missing and says no web UI caller exists; code shows web and mobile callers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-12](../../20-features/082-usage-dashboard-and-limit-ui/F082-12-resume-after-reset-preference.md)
- Detail: Affects: Documentation. Work needed: Update brief statuses.
- Evidence: WebChatPage.tsx:1816; ChatComposerNew.tsx:5104; UsageLimitBanner.tsx:66

## GAP-F082-12-03

**Hidden in the desktop host.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-12](../../20-features/082-usage-dashboard-and-limit-ui/F082-12-resume-after-reset-preference.md)
- Detail: Affects: Desktop users. Work needed: Decide whether Electron push can be supported.
- Evidence: WebChatPage.tsx:1816

## GAP-F082-12-04

**No reminder on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F082-12](../../20-features/082-usage-dashboard-and-limit-ui/F082-12-resume-after-reset-preference.md)
- Detail: Affects: Those apps. Work needed: Optional.
- Evidence: No code found
