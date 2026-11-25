---
id: "F087-11"
type: "feature"
title: "Usage, budgets and spend limits"
aliases: ["Usage analytics", "Usage page", "Spend limit", "Monthly spend cap", "Budget", "Group spending limits", "User spending limits", "S87.30", "S87.31", "S87.32", "S87.33"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.30", "S87.31", "S87.32", "S87.33"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:team", "plan:team_premium", "plan:enterprise", "table:managed_usage_requests", "table:organization_spend_limits", "table:organization_spend_alerts", "api:GET /api/settings/organization/usage-analytics", "api:PUT /api/settings/organization/spend-limit", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-observability-and-operations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-11 Usage, budgets and spend limits

Admins see settled managed-Cloud usage by member, product area, model and provider for 7, 30 or 90 days, export a daily CSV, and set a monthly spend limit with an alert. A second 'Monthly spend cap' lives on Policy. Per-group and per-member limits do not exist. Local and own-key usage is not counted.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.30](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8730), [S87.31](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8731), [S87.32](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8732), [S87.33](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8733).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reports credits, turns and tokens from managed usage records, and refuses or warns on managed usage when a workspace limit is reached (WorkspaceUsageAnalytics.tsx:23-377; spend-limit-service.ts:161; managed-usage-request-service.ts:338).

**Why it exists.** Finance owners need to see and cap the cost of AGI-managed compute.

**Who uses it.** Owners and admins with billing.read; policy.manage to change limits (usage-analytics/route.ts:68; spend-limit/route.ts:77-90).

**Problems it solves**

- Surprise cloud bills.
- No view of who and what drives cost.
- No alert before a limit.

**Use cases**

- Check last 30 days by model.
- Export the daily CSV for finance.
- Set a monthly limit with alert at a percent and block mode.
- Get an email when the threshold is crossed.

## 2. User experience

**Where to find it**

- Web: Workspace > Records > 'Usage' (/workspace/usage); the 'Monthly spend limit' card sits at the bottom of that page (WorkspaceUsageAnalytics.tsx:377). A separate 'Monthly spend cap' row is on Workspace > 'Policy' (WorkspacePolicySection.tsx:630).
- Desktop: [inferred] same hosted pages (doc: AGENTS.md section 5).
- Mobile, CLI, VS Code, Chrome: nothing.

**Before you start**

- Owner or admin with billing.read; plan team, team_premium or enterprise (usage-analytics/route.ts:55-70).
- Changing limits needs policy.manage.

**Screens and controls**

- Period buttons '7 days', '30 days', '90 days' (WorkspaceUsageAnalytics.tsx:23-27); link 'Export daily CSV' (282).
- Totals: Credits used, Active members, Avg credits / active member, Turns, Tokens in, Tokens out.
- Tables 'By member', 'By product area', 'By model', 'By provider' (349-369).
- Limit card 'Monthly spend limit': 'Cap (credits)', 'Alert at' percent, select 'Spend limit enforcement' with Off, Notify, Block; remove confirmation 'Remove the workspace spend limit?' (WorkspaceSpendLimit.tsx:190,264,311).

**Journey**

1. Open Usage and pick a period.
2. Read totals and tables; export CSV.
3. Enter a cap and an alert percent, choose Notify or Block, save.
4. Saving Block shows a notice that new Cloud turns will be declined once the cap is reached.

**What the person sees and gets**

- Progress bar and text 'X of Y used this month', ' · over the limit' or 'past the N% alert'.
- Empty state 'No settled Cloud usage in this window' and 'Local and BYOK activity is not included' (WorkspaceUsageAnalytics.tsx:340).
- Non-admin text 'You do not administer this workspace' (240).
- Refusal in chat: 'This workspace has reached its monthly spend limit...' (spend-limit-service.ts:186) or HTTP 402 organization_spend_cap_reached (managed-usage-request-service.ts:399).
- Alert emails and in-app notices to owners and admins, once per month per kind (spend-alert-service.ts:40).

**Settings**

- Spend limit enforcement Off, Notify, Block.
- Policy 'Monthly spend cap in credits' (separate cap).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Usage: settled managed usage requests aggregated by member, workload, model, provider, daily, with freshness note about unsettled requests (organization-usage-service.ts:187; WorkspaceUsageAnalytics.tsx).
- CSV export with dimensions daily, member, model, provider, workload, project (usage-analytics/export/route.ts:25).
- Spend limit: stored per workspace with cap, enforcement, alert percent; 'block' returns over_cap; decisions cached 60 seconds so enforcement is eventual (spend-limit-service.ts:58,161-200).
- Spend limit is checked for the selected workspace and the enterprise funding workspace (managed-compute-access.ts:109-150).
- Alerts: threshold and cap, once per month per kind, to owners and admins (spend-alert-service.ts:40).
- Policy cap: month-to-date spend compared to monthlySpendCapCents; refusal 402 with audit spend_cap_exceeded; billing errors give 503 billing_unavailable (managed-usage-request-service.ts:338-399; organization-policy-evaluator.ts:418).

**Incomplete**

- Two overlapping workspace caps (Policy 'Monthly spend cap' and Usage 'Monthly spend limit') with different failure behaviour and codes; the screen does not explain the difference (WorkspacePolicySection.tsx:630; WorkspaceSpendLimit.tsx:190).
- Usage is Cloud only; Local and BYOK never appear (WorkspaceUsageAnalytics.tsx:340).

**Present but disconnected or switched off**

- Personal spend limits exist for self-set limits by the member (spend-limit-service.ts:290-360; api /api/settings/spend-limit) but are not admin-set per-member limits.

**Not available**

- Group spending limits (S87.31) and user spending limits set by an admin (S87.32): no code found.
- Mobile, CLI, VS Code: no usage or limits screen found.
- Per-member usage for non-admins: whole route refuses non-admins; no workspace-total-only view.

## 4. Required behaviour

**Established requirements**

- Admin sees usage and spend by member, model, product area and provider over a period and can export it. (source: brief S87.30 Should)
- Group spending limits cap group usage. (source: brief S87.31 Should)
- User spending limits cap an individual member's usage. (source: brief S87.32 Should)
- Monthly budget with alert; managed usage refused once exhausted when enforced. (source: brief S87.33 Should)
- The console states that block is eventual, not exact. (source: spend-limit-service.ts:50-57 comment)

**Acceptance criteria**

1. As admin, Usage totals equal the sum of settled managed requests in the window.
2. A member without billing.read gets a refusal from the usage API.
3. With the limit in Block mode and spend over the cap, a new managed turn is refused with over_cap.
4. In Notify mode nothing is refused but alert notices are sent once.
5. The Policy cap refuses with 402 organization_spend_cap_reached and an audit row.
6. Removing the limit takes effect without waiting for the cache window.
7. The CSV export has one row per day for the chosen window.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- One budget concept should exist; two caps confuse admins [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Merge or label the two caps.
- [proposed] Add member and group limits with the same notify and block modes.
- [proposed] Add a total-only view for non-admin members if required.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Usage page | `apps/web/app/workspace/usage/page.tsx` | Console page titled Usage |
| component | WorkspaceUsageAnalytics | `apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx` | Totals, tables, export link |
| component | WorkspaceSpendLimit | `apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx` | Limit form |
| hook | use-workspace-usage | `apps/web/features/workspace-console/hooks/use-workspace-usage.ts` | Fetches usage, null on 403 |
| endpoint | GET /api/settings/organization/usage-analytics | `apps/web/app/api/settings/organization/usage-analytics/route.ts` | Usage and activity |
| endpoint | GET /api/settings/organization/usage-analytics/export | `apps/web/app/api/settings/organization/usage-analytics/export/route.ts` | CSV export |
| endpoint | /api/settings/organization/spend-limit | `apps/web/app/api/settings/organization/spend-limit/route.ts` | Read, save, delete limit with audit |
| service | organization-usage-service | `apps/web/lib/services/organization-usage-service.ts` | Aggregation queries |
| service | spend-limit-service | `apps/web/lib/services/spend-limit-service.ts` | State, decision, cache, personal limits |
| service | spend-alert-service | `apps/web/lib/services/spend-alert-service.ts` | Threshold and cap alerts |
| service | managed-compute-access | `apps/web/lib/services/managed-compute-access.ts` | Applies the limit to managed compute |
| service | managed-usage-request-service | `apps/web/lib/services/managed-usage-request-service.ts` | Policy cap check when reserving usage |
| service | organization-policy-evaluator | `apps/web/lib/services/organization-policy-evaluator.ts` | spend_cap decision |
| table | managed_usage_requests | `apps/web/lib/services/organization-usage-service.ts` | Source of all usage numbers |
| table | organization_spend_limits | `apps/web/lib/services/spend-limit-service.ts` | Limit settings |
| table | organization_spend_alerts | `apps/web/lib/services/spend-alert-service.ts` | Once-per-month alert claims |
| table | personal_spend_limits | `apps/web/lib/services/spend-limit-service.ts` | Self-set member limits |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin opens Usage; browser requests usage with a window. | device and our servers | use-workspace-usage.ts:32 |
| Server checks admin access and billing.read, aggregates managed_usage_requests, logs the admin data access. | our servers | usage-analytics/route.ts:55-95 |
| Admin saves a limit; server validates, upserts, invalidates the cached decision, audits (critical for block). | our servers | spend-limit/route.ts:92-139 |
| A managed turn reserves usage; access check reads the limit (cached 60 s) for the selected and funding workspaces, then the policy cap compares month-to-date spend. | our servers | managed-compute-access.ts:129-175; managed-usage-request-service.ts:338 |
| Crossing a threshold or cap triggers emails and notices. | our servers | spend-limit-service.ts:200; spend-alert-service.ts:40 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Usage requests with tokens, cost, member, model, provider, workload | table managed_usage_requests | Server only | Retention unknown |
| Limit and alert threshold | table organization_spend_limits | Read per decision with 60 s cache | Delete removes the row |

**Models and providers.** Usage is broken down by model and provider as recorded for managed Cloud requests. Choice of model affects cost only; no model restriction here. Local and own-key requests never touch these tables.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in admin. |
| Permissions | billing.read to view and export; policy.manage to change limits; any member may read limit state to understand a refusal (spend-limit/route.ts:59-75). |
| Subscription | Console needs plan:team, plan:team_premium or plan:enterprise. Limits apply to AGI-managed compute only. |
| Limits and metering | Windows 7, 30, 90 days in the UI; open-ended windows clamped (usage-analytics route test:203). Cap bounds from spend-limit-bounds.ts. Spend measured in credits. |
| Feature flags | Policy cap is null by default (no cap). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Local and own-key usage is excluded from usage and caps (WorkspaceUsageAnalytics.tsx:340); caps do not limit them. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading, error | Loading state and 'Try again' button. | WorkspaceUsageAnalytics.tsx:225 |
| Not admin | 'You do not administer this workspace' (not totals). | WorkspaceUsageAnalytics.tsx:240 |
| Empty window | 'No settled Cloud usage in this window'. | WorkspaceUsageAnalytics.tsx:340 |
| Unsettled requests | Notice says final usage is excluded. | WorkspaceUsageAnalytics.tsx:318 |
| Limit read fails (Usage limit) | Request treated as ungoverned: fails OPEN with a log. | spend-limit-service.ts:177 |
| Policy cap read fails | Fails CLOSED with 503 billing_unavailable. | managed-usage-request-service.ts:300-306,360-366 |
| Overshoot | Up to about one cache window of spend may pass. | spend-limit-service.ts:50-57 |
| Cancel, offline | not handled in the code beyond form disable while saving. | WorkspaceSpendLimit.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/spend-limit-service.test.ts`: State reading, settled-only month sums, percent
- `apps/web/lib/services/__tests__/spend-alert-service.test.ts`: Alert kinds, once per month, notices for admins
- `apps/web/lib/services/__tests__/managed-usage-request-service.spend-cap.test.ts`: Policy cap refusal, audit, funding org lookup failure
- `apps/web/lib/services/__tests__/managed-compute-access.test.ts`: Subscription and read-only access decisions
- `apps/web/app/api/settings/organization/spend-limit/route.test.ts`: Workspace scoping, malformed JSON, delete audit
- `apps/web/app/api/settings/organization/usage-analytics/__tests__/route.test.ts`: Refuses members and viewers, window clamping, plan check
- `apps/web/app/api/settings/organization/usage-analytics/export/__tests__/route.test.ts`: CSV export route
- `apps/web/lib/services/__tests__/organization-usage-service.test.ts`: Usage aggregation
- `apps/web/features/workspace-console/components/__tests__/WorkspaceSpendLimit.test.tsx`: Limit form
- `apps/web/features/workspace-console/components/__tests__/WorkspaceUsageAnalytics.test.tsx`: Usage screen

**Test scenarios**

- **Block mode**
  1. Set a small cap in Block mode.
  2. Run managed turns until spend passes it.
  3. Run another turn within a minute and after.
  - Expected: Turn refused with over_cap, possibly after small overshoot; raising the cap takes effect at once.
- **Policy cap**
  1. Set 'Monthly spend cap in credits' on Policy.
  2. Exceed it.
  - Expected: 402 organization_spend_cap_reached and spend_cap_exceeded audit row.
- **Fail modes**
  1. Break the spend-limit read in a test; then the policy read.
  - Expected: Limit: allowed with log. Policy cap: 503.
- **Non-admin**
  1. Open Usage as a member.
  - Expected: 'You do not administer this workspace'.
- **Local usage**
  1. Run a Local turn and a BYOK turn.
  2. Open Usage.
  - Expected: Neither appears.
- **CSV**
  1. Click Export daily CSV for 30 days.
  - Expected: One row per day matching totals.

**Where to look when it fails**

- Log '[spend-limit] state unavailable; request treated as ungoverned' and '[managed-usage] organization spend lookup failed; billing unavailable'.
- Audit eventType spend_cap_exceeded and admin_policy_changed with resourceType organization_spend_limit.
- Tables organization_spend_limits, organization_spend_alerts, managed_usage_requests.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **Group spending limits not implemented** Affects: All apps. Evidence: No code; brief S87.31. Work needed: Design group limits and enforcement
- **Admin-set user spending limits not implemented** Affects: All apps. Evidence: Only self-set personal limits (spend-limit-service.ts:290-360). Work needed: Admin-set per-member limits
- **Two workspace caps with opposite failure behaviour** Affects: Admins and finance. Evidence: spend-limit-service.ts:177 vs managed-usage-request-service.ts:300. Work needed: Choose one model or align failure handling
- **Brief says managed usage fails closed when the budget cannot be read; the Usage-page limit fails open** Affects: Cloud workspaces using Usage limit. Evidence: spend-limit-service.ts:150-180. Work needed: Align code and requirement
- **Non-admins see no workspace total** Affects: Members. Evidence: WorkspaceUsageAnalytics.tsx:240. Work needed: Optional total-only view
- **No CLI, mobile or VS Code surface** Affects: Those apps. Evidence: No code found. Work needed: Decide scope
- Not built on: Mobile, CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:team
- plan:team_premium
- plan:enterprise
- table:managed_usage_requests
- table:organization_spend_limits
- table:organization_spend_alerts
- api:GET /api/settings/organization/usage-analytics
- api:PUT /api/settings/organization/spend-limit
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-observability-and-operations

## Unknown

- Retention of managed_usage_requests.
- How usage maps for Chat versus Code surfaces beyond the workload column.
- Whether CLI Managed turns appear in workspace usage (they use the managed gateway; not traced).
- Which cap the brief's 'spend_cap_exceeded' wording refers to: it is the Policy cap's code, not the Usage limit's.
- Enterprise funding workspace rules beyond resolveGoverningOrganizationIds.
