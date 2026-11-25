---
id: "F082-11"
type: "feature"
title: "Workspace spending cap"
aliases: ["Monthly spend limit", "Spending cap", "Workspace spend limit", "Organization spend cap", "over_cap", "organization_spend_cap_reached", "S82.31"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S82.31"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "surface:web", "surface:desktop", "mode:cloud", "table:organization_spend_limits", "table:personal_spend_limits", "table:managed_usage_requests", "api:GET /api/settings/organization/spend-limit", "api:PUT /api/settings/organization/spend-limit", "api:DELETE /api/settings/organization/spend-limit", "F082-09"]
basis: "code inspection"
second_reader: "8 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-11 Workspace spending cap

A workspace owner or admin can set a monthly credit limit with a mode of Off, Notify or Block. Only Block refuses members' Cloud turns once the month's spend reaches the limit. Decisions are cached for 60 seconds. A separate policy cap and a personal spend limit also exist.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.31](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8231).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Caps managed spend for a workspace per calendar month and optionally alerts at a percentage threshold.

**Why it exists.** Finance owners need a budget ceiling (S82.31). Notify lets them watch before enforcing.

**Who uses it.** Workspace owners and admins who hold the policy.manage permission; members feel the refusals.

**Problems it solves**

- Uncontrolled team spend
- No early warning before a budget is hit

**Use cases**

- Owner sets a cap, 80 percent alert and Notify to observe first.
- Owner switches to Block; members' new Cloud turns stop at the cap.
- Owner raises the cap and members are freed at once.
- Owner removes the limit.

## 2. User experience

**Where to find it**

- Web and hosted desktop: workspace console usage page /workspace/usage, card 'Monthly spend limit' (apps/web/app/workspace/usage/page.tsx; apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:377; WorkspaceSpendLimit.tsx:186-198).
- Second control: Settings > workspace policy, 'Monthly spend cap' (apps/web/features/settings/sections/WorkspacePolicySection.tsx:630).
- Personal limit (a different thing): Settings > Usage card 'Monthly spend limit' with 'Manage' (UsageSection.tsx:707-720).

**Before you start**

- Workspace membership in a Team or Enterprise workspace and the policy.manage permission to change (apps/web/app/api/settings/organization/spend-limit/route.ts:69; apps/web/app/api/settings/team/team-admin-access.ts:70-90).
- The component renders nothing for a caller who cannot administer the limit (WorkspaceSpendLimit.test.tsx:133).

**Screens and controls**

- Usage bar and text '<spent> of <cap> used this month', '· over the limit' or '· past the N% alert' (WorkspaceSpendLimit.tsx:196-222).
- Fields 'Cap (credits)', 'Alert at' %, select 'Spend limit enforcement' with Off, Notify, Block (lines 228-270).
- Help text per mode: Off 'Recorded only. Nothing acts on the cap.'; Notify 'Crossing the cap is reported, but no turn is refused.'; Block 'Managed turns stop at the cap, up to about a minute of spend late.' (lines 76-80).
- Buttons 'Set limit' or 'Update limit', and 'Remove limit' (lines 291-322).

**Journey**

1. Open the workspace usage page.
2. Enter a cap in credits, an alert percent and a mode.
3. If choosing Block when it was not Block, read the inline notice that new turns will be declined (line 278-289).
4. Click 'Set limit' or 'Update limit'.
5. To remove, click 'Remove limit' and confirm the dialog 'Remove the workspace spend limit?'.
6. A member over the cap sees the refusal message.

**What the person sees and gets**

- Refusal text: 'This workspace has reached its monthly spend limit. An owner or admin can raise it, or wait until the limit resets at the start of next month.' (apps/web/lib/services/spend-limit-service.ts:187-190).
- Policy-cap refusal uses the policy's reason with code organization_spend_cap_reached and status 402 (managed-usage-request-service.ts:399).
- Save errors appear as an alert next to the buttons (WorkspaceSpendLimit.tsx:325-335).

**Settings**

- Monthly cap (credits), enforcement (off/notify/block), alert threshold percent (spend-limit route PutSchema, lines 40-46).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Limit CRUD: GET (state), PUT (upsert) and DELETE. PUT and DELETE check CSRF, rate limit and policy.manage. PUT audits admin_policy_changed with severity critical whenever the saved mode is block (not only when switching to block), otherwise warning. DELETE audits a warning only when a row existed. GET is rate limited and membership checked only and writes no audit event (apps/web/app/api/settings/organization/spend-limit/route.ts:50-175; PUT/DELETE audit at lines 98-156).
- Enforcement: evaluateSpendLimit allows unless configured, mode block and spend >= cap; decision cached 60 seconds; unreadable state is treated as allowed (apps/web/lib/services/spend-limit-service.ts:53-60, 161-206). A raised cap or delete clears the cache for this server process (lines 212-214, 245-275).
- Gate applied before managed work in chat completions, embeddings, audio transcription, voice live sessions, image and video generation and resume routes (callers of buildSpendLimitGateResponse in apps/web/app/api/...); the gate answers 402 with type insufficient_quota (apps/web/lib/managed-compute-gate.ts:511-545).
- Crossing announcements via dispatchSpendAlertIfDue (spend-limit-service.ts:205-210).
- Separate policy cap in the managed request path: refusal writes audit event spend_cap_exceeded and throws organization_spend_cap_reached (managed-usage-request-service.ts:338-399, 779).
- Web UI with confirm dialog for removal.
- Web chat voice code has client handling for both over_cap and organization_spend_cap_reached (apps/web/features/chat/lib/live-voice-session.ts; apps/web/features/chat/stores/voice-input-store.ts).

**Incomplete**

- The confirmation dialog covers only removing the limit. Saving a change to Block shows an inline warning note, not a dialog (WorkspaceSpendLimit.tsx:278-322). The brief says the change is confirmed by the dialog.
- Only the policy-cap path writes an audit event per refused request. The Block path writes a warning log line only (managed-compute-gate.ts:527-530). The brief's line 'each refused request writes an audit event' is true only for the policy cap.
- The 60-second cache is per server process (Map in memory, spend-limit-service.ts:67); across several instances enforcement lag can differ. This is read from the code, not tested [inferred].

**Present but disconnected or switched off**

- nothing found

**Not available**

- Mobile, CLI, VS Code and Chrome have no controls (brief n/a). They show the refusal text only. Mobile's no-model-switch list has organization_spend_cap_reached but not over_cap, so over_cap would offer a model switch on mobile (apps/mobile/services/apiErrors.ts:99-109). How the CLI, VS Code and Chrome treat code over_cap was not established.

## 4. Required behaviour

**Established requirements**

- An owner can set a spending cap that stops managed usage once reached. (source: S82.31 (brief))
- Modes are off, notify and block; only block refuses. (source: apps/web/lib/services/spend-limit-service.ts:150-154, 183)
- Decisions are cached 60 seconds, so enforcement is eventual and may overshoot by about one window of spend. (source: apps/web/lib/services/spend-limit-service.ts:53-60)
- If spend cannot be read, the request is allowed. (source: apps/web/lib/services/spend-limit-service.ts:171-181)
- Product requirement: Usage settings must include a monthly spend limit. (source: doc: docs/product/requirements.md section 16.5 (lines 1322-1336))
- An action a user cannot undo asks first, naming the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. With mode Block and spend at or above the cap, a member's next Cloud turn is refused with status 402 and the monthly spend limit message.
2. With mode Notify or Off, turns continue even above the cap.
3. Raising the cap frees members immediately on that server.
4. A member cannot see the set or remove controls.
5. Removing the limit shows a confirmation naming the consequence and then removes it.
6. Changing to Block records a critical audit event.
7. If the spend lookup fails, the turn is allowed and an error is logged.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Overshoot of about a minute of spend is acceptable and is stated to the admin in the UI copy [inferred from WorkspaceSpendLimit.tsx:79].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Put switching to Block behind the confirmation dialog, since it starts refusing work.
- [proposed] Merge the two cap mechanisms (limit table and policy cap) or document which wins.
- [proposed] Write an audit event on each Block refusal.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | WorkspaceSpendLimit | `apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx` | Admin UI: cap, alert, mode, set, remove |
| component | WorkspaceUsageAnalytics | `apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx` | Hosts the spend limit card |
| screen | /workspace/usage page | `apps/web/app/workspace/usage/page.tsx` | Route that renders workspace usage |
| endpoint | GET PUT DELETE /api/settings/organization/spend-limit | `apps/web/app/api/settings/organization/spend-limit/route.ts` | Read, save and delete the limit |
| service | spend-limit-service | `apps/web/lib/services/spend-limit-service.ts` | State, decision, cache, upsert, delete, personal limit |
| service | buildSpendLimitGateResponse | `apps/web/lib/managed-compute-gate.ts` | Returns the 402 refusal for managed routes |
| service | managed-compute-access | `apps/web/lib/services/managed-compute-access.ts` | Also evaluates spend limit per organization (line 141) |
| service | spend-alert-service | `apps/web/lib/services/spend-alert-service.ts` | Sends alert when a threshold or cap is crossed |
| service | assertOrganizationSpendCap | `apps/web/lib/services/managed-usage-request-service.ts` | Policy cap check and audit event (line 338) |
| service | organization-policy-evaluator | `apps/web/lib/services/organization-policy-evaluator.ts` | spend_cap decision (line 418) |
| service | requireTeamAdminAccess | `apps/web/app/api/settings/team/team-admin-access.ts` | Membership check and Team or Enterprise plan gate (403 SUBSCRIPTION_REQUIRED), lines 70-90 |
| service | enterprise-funding-organization | `apps/web/lib/services/enterprise-funding-organization.ts` | Resolves the user's first governing organization for the budget (lines 15-23) |
| component | WorkspacePolicySection | `apps/web/features/settings/sections/WorkspacePolicySection.tsx` | Monthly spend cap policy field |
| endpoint | policy route | `apps/web/app/api/settings/organization/policy/route.ts` | Saves monthlySpendCapCents |
| table | organization_spend_limits | `apps/web/lib/services/spend-limit-service.ts:119` | Cap, mode, threshold per organization |
| table | personal_spend_limits | `apps/web/lib/services/spend-limit-service.ts:316` | Personal monthly overage limit |
| event | admin_policy_changed / spend_cap_exceeded | `apps/web/app/api/settings/organization/spend-limit/route.ts:116` | Audit events |
| test | spend-limit-service tests | `apps/web/lib/services/__tests__/spend-limit-service.test.ts` | Decision logic |
| test | WorkspaceSpendLimit tests | `apps/web/features/workspace-console/components/__tests__/WorkspaceSpendLimit.test.tsx` | UI behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin saves the limit; browser PUTs with bearer token and CSRF header. | device and our servers | WorkspaceSpendLimit.tsx:56-64 |
| Server checks membership, the Team or Enterprise plan and policy.manage, upserts the row, clears the cache, writes an audit event, returns the new state. | our servers | spend-limit/route.ts:98-139; spend-limit-service.ts:245-276; team-admin-access.ts:70-90 |
| A member sends a managed request; the route calls the gate which resolves the funding organization and evaluates the limit (cache 60 s). The budget is resolved from the user's first governing organization and ignores the x-agi-organization-id header, so a member cannot escape the cap by sending 'personal'. | our servers | managed-compute-gate.ts:507-525, 511-523; enterprise-funding-organization.ts:15-23; spend-limit-service.ts:161-206 |
| The month-to-date sum of completed requests for the whole organization is read with the privileged database adapter. | our servers | spend-limit-service.ts:98-135 |
| If blocked, the route answers 402 with the message; the client shows the refusal. | our servers | managed-compute-gate.ts:532-545 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cap, mode, alert threshold, updated by, updated at | table:organization_spend_limits | Server | Deleted by the Remove limit action |
| Decision cache | In-memory map in the server process | No | 60 seconds |
| Audit events | Security audit log | Server | unknown |

**Models and providers.** Not model specific. The sum uses actual cost of completed managed requests, whatever model or provider served them. Only managed (Cloud) turns are gated; own-key and Local turns are not.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with workspace membership. |
| Permissions | policy.manage to change (PUT and DELETE). GET needs only active membership in a Team or Enterprise workspace (requireOrgMember and requireTeamAdminAccess, no policy.manage), so any active member can read the state; canManageLimit tells the UI whether to show controls (spend-limit/route.ts:50-63, 80-91). |
| Subscription | Team or Enterprise only. requireTeamAdminAccess throws 403 SUBSCRIPTION_REQUIRED ('Team administration requires an active Team or Enterprise subscription') on GET, PUT and DELETE for any other plan (apps/web/app/api/settings/team/team-admin-access.ts:70-90; spend-limit/route.ts:63, 79). |
| Limits and metering | Cap bounds MIN_MONTHLY_CAP_CREDITS to MAX_MONTHLY_CAP_CREDITS and alert percent bounds (apps/web/lib/spend-limit-bounds.ts). Cache 60 s. |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Local and own-key turns are not managed spend and are not gated by this cap. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Load error | Retryable error without raw HTTP status. | WorkspaceSpendLimit.test.tsx:57 |
| Save error | Alert text, no transport details. | WorkspaceSpendLimit.test.tsx:70; WorkspaceSpendLimit.tsx:325 |
| Cap input invalid | Set limit stays disabled. | WorkspaceSpendLimit.test.tsx:109 |
| No permission | Card renders nothing. | WorkspaceSpendLimit.test.tsx:133 |
| Plan is not Team or Enterprise | GET, PUT and DELETE answer 403 SUBSCRIPTION_REQUIRED. | team-admin-access.ts:70-90; spend-limit/route.ts:63, 79 |
| Member sends x-agi-organization-id 'personal' | Header is ignored; the budget of the user's first governing organization still applies. | managed-compute-gate.ts:507-525; enterprise-funding-organization.ts:15-23 |
| Spend read fails | Request allowed; logged '[spend-limit] state unavailable; request treated as ungoverned'. | spend-limit-service.ts:171-181 |
| Policy cap lookup fails | Refuses with 503 billing_unavailable (fails closed) on the policy path. | managed-usage-request-service.ts:344-373 |
| Over cap in Block | 402 with code over_cap. | spend-limit-service.ts:183-191; managed-compute-gate.ts:532-545 |
| Month rollover | Spend sum starts at the calendar month start; the refusal says it resets next month. | spend-limit-service.ts:116; line 189 |
| Accessibility | Usage bar has role img and aria-label with percent; enforcement select has aria-label. | WorkspaceSpendLimit.tsx:201-205, 264 |
| Offline / timeout | not handled in the code beyond generic errors | none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/spend-limit-service.test.ts`: Spend limit decisions
- `apps/web/lib/services/__tests__/spend-limit-coverage.test.ts`: Coverage of gated routes
- `apps/web/lib/services/__tests__/spend-alert-service.test.ts`: Alerts
- `apps/web/app/api/settings/organization/spend-limit/route.test.ts`: Limit route
- `apps/web/features/workspace-console/components/__tests__/WorkspaceSpendLimit.test.tsx`: UI
- `apps/web/features/workspace-console/components/__tests__/WorkspaceSpendLimit.draft.test.tsx`: Draft state of the form
- `apps/web/lib/__tests__/managed-compute-gate.workspace-policy.test.ts`: Gate with workspace policy
- `apps/web/lib/services/__tests__/organization-policy-evaluator.test.ts`: Policy evaluation incl. spend cap

**Test scenarios**

- **Block mode refuses**
  1. As owner set a small cap with Block.
  2. As a member spend past it.
  3. Send another Cloud turn.
  - Expected: 402 and the monthly spend limit message; within about a minute of crossing.
- **Notify mode**
  1. Set Notify and exceed the cap.
  - Expected: Turns continue; an alert is sent once at the crossing.
- **Raise the cap**
  1. While blocked, raise the cap.
  - Expected: Next turn succeeds without waiting a minute (same server).
- **Member view**
  1. Open the usage page as a plain member.
  - Expected: No controls.
- **Remove**
  1. Click Remove limit.
  - Expected: Dialog names the consequence; confirm deletes; a warning audit event is written.
- **Spend read failure**
  1. Simulate a database error in the spend sum.
  - Expected: Turn allowed; error logged.
- **Non-Team plan**
  1. Call GET /api/settings/organization/spend-limit as a member of a workspace on another plan.
  - Expected: 403 SUBSCRIPTION_REQUIRED.

**Where to look when it fails**

- Log '[spend-limit] request refused by workspace budget' and '[spend-limit] state unavailable'.
- Audit events spend_cap_exceeded, admin_policy_changed.
- Tables organization_spend_limits and managed_usage_requests (organization_id, status, actual_cost_microusd).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **Blocked turns on the limit-table path are not audited per request.** Affects: Admins investigating refusals. Evidence: apps/web/lib/managed-compute-gate.ts:527-530. Work needed: Record an audit event or metric.
- **Two caps exist (organization_spend_limits via gate, policy monthlySpendCapCents via reservation) with different codes and UI.** Affects: Admins and support. Evidence: WorkspaceSpendLimit.tsx and WorkspacePolicySection.tsx:630; managed-usage-request-service.ts:399. Work needed: Decide one owner and copy.
- **Refusal codes over_cap and organization_spend_cap_reached are not in the shared quota classifier, so apps show no reset or recovery card. Mobile's no-model-switch list omits over_cap, so over_cap would offer a model switch there.** Affects: All apps. Evidence: No match in packages/contracts/types/src; apps/mobile/services/apiErrors.ts:99-109. Work needed: Add to the classifier.
- **Switching to Block has no confirmation dialog.** Affects: Admins. Evidence: WorkspaceSpendLimit.tsx:278-322. Work needed: Use useConfirmAction (AGENTS.md section 9).
- **Brief cites 'confirms through the confirmation dialog' and per-request audit event; both only partly true.** Affects: Documentation. Evidence: Same lines. Work needed: Correct the brief.

**Depends on**

- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- surface:web
- surface:desktop
- mode:cloud
- table:organization_spend_limits
- table:personal_spend_limits
- table:managed_usage_requests
- api:GET /api/settings/organization/spend-limit
- api:PUT /api/settings/organization/spend-limit
- api:DELETE /api/settings/organization/spend-limit
- F082-09

## Unknown

- How the web chat renders code over_cap and organization_spend_cap_reached outside the voice code, which handles both (live-voice-session.ts, voice-input-store.ts).
- How the CLI, VS Code and Chrome treat code over_cap.
- Behaviour across several server instances for the 60-second cache.
- Whether desktop (Electron) shows the workspace console unchanged.

## Second reader's check

A second reader checked 11 statements of this page against the code: 8 correct, 3 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Limit CRUD: GET, PUT, DELETE with CSRF, rate limits, permission check and audit event admin_policy_changed, critical severity when switching to block (route.ts:50-175)" The code shows: PUT and DELETE check CSRF and rate limit. GET (route.ts:57-77) has no CSRF check, which is normal for a read. Audit is critical only on PUT when the saved mode is block (route.ts:116-130). Any PUT that saves mode block records critical, not only a switch to block. DELETE records a warning audit event, and only if a row was removed (route.ts:144-156). GET writes no audit event. (apps/web/app/api/settings/organization/spend-limit/route.ts:98-156). **Corrected:** PUT and DELETE check CSRF, rate limit and policy.manage. PUT audits admin_policy_changed with severity critical whenever the saved mode is block, otherwise warning. DELETE audits a warning only when a row existed. GET is rate limited and membership checked only.
- **Partly wrong (section 7):** "Permissions: policy.manage to change; GET passes requireOrgMember and requireTeamAdminAccess. Whether non-admins can read is unclear. Subscription: plan names for access are not read in this review. Unknown: which plan tiers can reach it." The code shows: requireTeamAdminAccess asserts active membership. It then throws SUBSCRIPTION_REQUIRED 403 unless the organization's plan allows the team_admin capability, with the message 'Team administration requires an active Team or Enterprise subscription' and requiredPlans team and enterprise. GET and PUT/DELETE both run it. GET does not need policy.manage, so any active member of a team or enterprise workspace can read the state; canManageLimit tells the UI whether to show controls. The limit is not readable or settable on other plans. (apps/web/app/api/settings/team/team-admin-access.ts:70-90; spend-limit/route.ts:57-63, 80-91). **Corrected:** Subscription: Team or Enterprise only (403 SUBSCRIPTION_REQUIRED otherwise). Read: any active member of such a workspace. Write: also needs policy.manage. This also means the 'Unknown' entries about plan tiers and member read can be resolved from code.
- **Partly wrong (section 8/3):** "Cap decisions only for Cloud turns; Local and own-key turns are not gated; how other apps treat over_cap was not established" The code shows: The gate sits on the managed llm/v1 routes only, so Local and own-key traffic that does not use them is not gated. That part holds. The web chat does handle these codes: voice-input-store.ts, live-voice-session.ts and the useDictation test reference over_cap or organization_spend_cap_reached. Mobile apiErrors.ts lists organization_spend_cap_reached as no-model-switch, but not over_cap. (apps/web/features/chat/stores/voice-input-store.ts; apps/web/features/chat/lib/live-voice-session.ts; apps/mobile/services/apiErrors.ts:109). **Corrected:** Web voice code handles both codes. Mobile's no-model-switch list has organization_spend_cap_reached but not over_cap, so over_cap would offer a model switch on mobile.

**Facts the page missed**

- Access needs a Team or Enterprise plan. requireTeamAdminAccess throws 403 SUBSCRIPTION_REQUIRED for any other plan, on GET as well as PUT and DELETE (apps/web/app/api/settings/team/team-admin-access.ts:70-90; spend-limit/route.ts:63, 79). The page lists this as unknown.
- The budget is resolved from the user's first governing organization and ignores the x-agi-organization-id header, so a member cannot escape the cap by sending 'personal' (apps/web/lib/managed-compute-gate.ts:507-525; apps/web/lib/services/enterprise-funding-organization.ts:15-23). The page does not say this.
- Web chat has client handling for the over_cap and organization_spend_cap_reached codes in voice code (apps/web/features/chat/lib/live-voice-session.ts, apps/web/features/chat/stores/voice-input-store.ts), which the page lists as unknown. Mobile's no-model-switch list omits over_cap (apps/mobile/services/apiErrors.ts:99-109).
