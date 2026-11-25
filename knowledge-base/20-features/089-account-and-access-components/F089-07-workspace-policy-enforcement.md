---
id: "F089-07"
type: "feature"
title: "Workspace policy enforcement"
aliases: ["Resource-authorization layer (S89.16)", "Workspace policy gate", "Organization policy gate", "evaluateActiveWorkspacePolicy", "Workspace controls", "Admin policy"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.16"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-observability-and-operations", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:apps/web/lib/services/organization-policy-gate.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-07 Workspace policy enforcement

A server-side gate that applies a workspace's saved rules (managed compute, feature access, surfaces, second-factor requirement, IP allow-list, retention flags, product analytics) to each request, scoped to the workspace the person is using. If the workspace or its policy cannot be read, the request is denied, not treated as having no policy.

Area: [89. Account and access components](README.md). Requirement items: [S89.16](../../10-requirements/capabilities/089-account-and-access-components.md#s8916).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Resolves the caller's active workspace, reads the layered workspace policy (plus per-member overrides), and asks a pure evaluator one question about the request. It answers allowed, denied with a code, or 'unscoped' when no policy governs the request (apps/web/lib/services/organization-policy-gate.ts:205-310). Separate helpers answer second-factor, IP allow-list, zero-data-retention, secret-handling and product-analytics questions across all governing workspaces (organization-policy-gate.ts:409-610).

**Why it exists.** A buyer is told the workspace policy binds regardless of which client sent the request. A route that skips the gate makes that false (apps/web/lib/services/__tests__/workspace-policy-coverage.test.ts:19-26). The brief requires every data access to be scoped to the caller and workspace and to apply feature access, MFA, IP allow-list and retention (S89.16, doc: knowledge-base/data/area-briefs/089-account-and-access-components.md).

**Who uses it.** Workspace owners and admins set the policy; every member's requests on web, desktop, mobile, CLI, VS Code and Chrome are governed by it when they reach the web server. The gate itself is called by server routes, not by people.

**Problems it solves**

- A workspace with an unreadable policy would silently behave as ungoverned; the gate denies instead (organization-policy-gate.ts:192-197).
- A caller could pick a workspace they do not belong to; the gate denies with 'workspace_not_accessible' (organization-policy-gate.ts:216-223).
- A delinquent enterprise contract could still buy managed compute from personal scope; the funding organization's billing hold is checked first (organization-policy-gate.ts:199-203, 134-167).
- Product analytics could be collected against a workspace's wishes; any governing workspace that forbids them blocks collection (organization-policy-gate.ts:501-513).

**Use cases**

- An admin turns managed compute off for a workspace; a member's chat request to the managed route is refused with 'managed_compute_disabled' (apps/web/lib/services/__tests__/organization-policy-gate.test.ts:206).
- An admin requires second-factor sign-in; a member without it is refused on gated routes (apps/web/lib/mfa-policy-gate.ts:1-48, organization-policy-gate.ts:464-499).
- An admin sets an IP allow-list; a request from another network is refused with 'ip_not_allowed' (apps/web/lib/ip-allow-list-gate.ts:18-30, 56-66).
- The database is down during a policy read; the request is refused with 'workspace_policy_unavailable' and a message telling the person to retry (organization-policy-evaluator.ts:82-88).

## 2. User experience

**Where to find it**

- No screen belongs to the gate itself; the person only sees a refusal message in whichever app made the request [inferred from gate returning a decision with a reason, organization-policy-evaluator.ts:75-104].
- Admins edit the policy through GET and PATCH /api/settings/organization/policy and read the effective result at /api/settings/organization/policy/effective (apps/web/app/api/settings/organization/policy/route.ts:334-335; apps/web/app/api/settings/organization/policy/effective/route.ts).
- Admins read the security posture through GET /api/settings/organization/posture (apps/web/app/api/settings/organization/posture/route.ts:66).

**Before you start**

- The person is signed in and (for workspace scope) a member of the workspace they select (organization-policy-gate.ts:211-224).
- An admin has saved a policy; before that the workspace is ungoverned by design (organization-policy-gate.ts:185-190).
- Changing policy needs the 'policy.manage' permission (apps/web/app/api/settings/organization/policy/route.ts:225-226). Reading posture needs 'audit.read' (posture/route.ts:44-48).

**Screens and controls**

- Exact admin screen labels for the policy editor: unknown, not traced in this pass.
- Refusal text seen by the person: 'We could not confirm your workspace security settings, so this request was stopped. Try again in a moment, and contact your workspace administrator if it keeps happening.' (organization-policy-evaluator.ts:85-86).
- Not-a-member text: 'You are not a member of the selected workspace. Choose a workspace you belong to, then try again.' (organization-policy-evaluator.ts:101-102).
- Billing-unreadable text on purchases: 'We could not confirm your workspace billing status, so this purchase was stopped. Try again in a moment.' (organization-policy-evaluator.ts:93-94).

**Journey**

1. 1. The person acts in an app (for example sends a managed chat turn).
2. 2. The app calls a web route; the route calls the gate with the person's id, a question (the 'ask') and the request (organization-policy-gate.ts:205-210).
3. 3. The gate resolves the active workspace; a failed read is retried once (organization-policy-gate.ts:61-71, 213-215).
4. 4. It reads the billing state and the layered policy, applies per-member overrides, and the evaluator decides (organization-policy-gate.ts:248-310).
5. 5. If allowed the route continues; if denied the route returns the reason and code.
6. 6. Failure path: unreadable data produces 'workspace_policy_unavailable' and a log line '[org-policy] ... request denied' (organization-policy-gate.ts:265-269).

**What the person sees and gets**

- A decision object with allowed, code, reason, obligations and organizationId (organization-policy-gate.ts:57-59).
- Decision codes include managed_compute_disabled, feature_disabled, region_not_allowed, surface_not_allowed, mfa_required, billing_read_only, billing_past_due, workspace_policy_unavailable, workspace_not_accessible (organization-policy-evaluator.ts:42-61).
- Errors for MFA and IP: 403 with reason 'mfa_required' or 'ip_not_allowed' (mfa-policy-gate.ts:19-26; ip-allow-list-gate.ts:18-24).
- Info and error log lines carry the prefix '[org-policy]'.

**Settings**

- Workspace policy fields read by the gate: requireMfa, ipAllowList, allowProductAnalytics, zeroDataRetentionOnly, secretHandling, retentionDays, requireLocalToByokPreview, per-surface sync switches (organization-policy-gate.ts:486,510,542,593; organization-policy-evaluator.ts:114-132).
- Request-country header name 'x-vercel-ip-country' feeds region rules (organization-policy-gate.ts:51).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The gate retries each read once, then denies with 'workspace_policy_unavailable' (organization-policy-gate.ts:48,61-71,264-269).
- A purchase ask (credit top-up, seat purchase) is decided on the billing hold alone when only the policy is unreadable; an unreadable billing hold denies the purchase (organization-policy-gate.ts:93-117, 264-276; organization-policy-evaluator.ts:110-112).
- Selected-workspace failures below HTTP 500 are denied as 'workspace_not_accessible' (organization-policy-gate.ts:216-223).
- Unknown second-factor requirement throws service-unavailable (organization-policy-gate.ts:490-496).
- Product analytics: any governing workspace that disallows them returns false, and any read error in the caller collects nothing (organization-policy-gate.ts:501-513; apps/web/lib/server/product-analytics.ts:29-37).
- IP allow-list: cached; on read failure the last known list is enforced, and with none known the request is denied (organization-policy-gate.ts:566-596).
- Secret handling falls back to the strictest mode ('block') when unreadable (organization-policy-gate.ts:50,419-424,440-444).
- A coverage test names every managed-compute route and fails if one stops calling the gate (apps/web/lib/services/__tests__/workspace-policy-coverage.test.ts:34-60).

**Incomplete**

- Whether retentionDays is enforced by purge jobs is not established here; the gate only returns it as an obligation (organization-policy-evaluator.ts:114-118). unknown.

**Present but disconnected or switched off**

- An organization with no saved policy is deliberately answered 'unscoped' (allowed) so existing organizations are not switched off (organization-policy-gate.ts:185-190, 278).

**Not available**

- No desktop, mobile, CLI, VS Code or Chrome code evaluates policy locally; they rely on the web server [inferred: the gate imports server-only modules, organization-policy-gate.ts:1].

## 4. Required behaviour

**Established requirements**

- A resource-authorization layer scopes every data access to the caller and active workspace and applies workspace policy (feature access, MFA, IP allow-list, retention). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S89.16)
- An unreadable workspace or policy is not 'no policy'; each read is retried once, then the request is denied as workspace_policy_unavailable, except a purchase that depends only on the billing hold. (source: apps/web/lib/services/organization-policy-gate.ts:192-197)
- A request against a workspace the person cannot access is denied with an explicit decision. (source: apps/web/lib/services/organization-policy-gate.ts:211-224)
- If the second-factor requirement is unknown, the request fails. (source: apps/web/lib/services/organization-policy-gate.ts:490-496)
- Product analytics are blocked if any governing workspace forbids them. (source: apps/web/lib/services/organization-policy-gate.ts:501-513)
- Every managed-compute route must ask the workspace policy. (source: apps/web/lib/services/__tests__/workspace-policy-coverage.test.ts:19-26)

**Acceptance criteria**

1. With no saved policy, a managed-compute ask in that workspace returns allowed with code 'unscoped'.
2. With managed compute switched off in a saved policy, the ask returns allowed=false with code 'managed_compute_disabled'.
3. If the policy read fails twice, a non-purchase ask returns 'workspace_policy_unavailable'; a credit top-up with no billing hold is allowed.
4. If the billing state cannot be read after one retry, a seat purchase is denied.
5. A selected workspace the caller is not a member of is denied with 'workspace_not_accessible', not treated as personal scope.
6. If any governing workspace has product analytics off, the analytics check returns false.
7. If one governing workspace's policy is unreadable and none requires MFA, the MFA check throws service-unavailable.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Per-surface rules are a configuration control, not a security boundary, because the surface comes from a client-supplied header (organization-policy-evaluator.ts:139-143). [inferred from the code comment]
- Cloud mode is governed; Local mode never reaches the gate [inferred: Local inference does not call web routes].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test that lists every route that serves workspace data and fails if it never calls a gate, beyond the managed-compute list.
- [proposed] Record in the posture response which gate calls failed closed in the last day, so admins can see unavailable-policy denials.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | organization-policy-gate | `apps/web/lib/services/organization-policy-gate.ts` | Active-workspace policy evaluation, retry-then-deny, MFA, IP allow-list, retention, secret-handling and analytics helpers |
| service | organization-policy-evaluator | `apps/web/lib/services/organization-policy-evaluator.ts` | Pure decision function, decision constants and the PolicyAsk list |
| service | organization-policy-service | `apps/web/lib/services/organization-policy-service.ts` | Reads the layered organization policy and workspace code controls (imported at organization-policy-gate.ts:17-22) |
| service | organization-policy-override-service | `apps/web/lib/services/organization-policy-override-service.ts` | Per-member policy overrides (organization-policy-gate.ts:23) |
| service | enterprise-collection-state | `apps/web/lib/services/enterprise-collection-state.ts` | Billing hold state (organization-policy-gate.ts:24-28) |
| service | governing-organizations | `apps/web/lib/services/governing-organizations.ts` | Lists the workspaces that govern a user (organization-policy-gate.ts:30) |
| service | active-workspace-service | `apps/web/lib/services/active-workspace-service.ts` | Resolves the workspace a request is scoped to (organization-policy-gate.ts:16) |
| service | organization-ip-allow-list-cache | `apps/web/lib/services/organization-ip-allow-list-cache.ts` | Cache and last-known list for IP allow-lists (organization-policy-gate.ts:31-35) |
| hook | mfa-policy-gate | `apps/web/lib/mfa-policy-gate.ts` | Throws MfaRequiredError using resolveMfaPolicy |
| hook | ip-allow-list-gate | `apps/web/lib/ip-allow-list-gate.ts` | assertIpAllowList and assertOrganizationIpAllowList; IpNotAllowedError |
| service | managed-compute-gate | `apps/web/lib/managed-compute-gate.ts` | Calls evaluateActiveWorkspacePolicy for managed compute (lines 116,170,444) |
| service | product-analytics | `apps/web/lib/server/product-analytics.ts` | Consent plus workspace check before any event is stored |
| endpoint | GET/PATCH /api/settings/organization/policy | `apps/web/app/api/settings/organization/policy/route.ts` | Admin reads and edits the policy; needs policy.manage |
| endpoint | GET /api/settings/organization/policy/effective | `apps/web/app/api/settings/organization/policy/effective/route.ts` | Returns the effective controls for the caller (uses resolveEffectiveWorkspaceControls) |
| endpoint | GET /api/settings/organization/posture | `apps/web/app/api/settings/organization/posture/route.ts` | Admin-only security posture; needs audit.read; logs admin data access |
| service | workspace-posture-service | `apps/web/lib/services/workspace-posture-service.ts` | Builds the posture (imported at posture/route.ts:16-19) |
| test | organization-policy-gate.test.ts | `apps/web/lib/services/__tests__/organization-policy-gate.test.ts` | Retry, deny, billing hold, MFA, analytics, secret handling cases |
| test | workspace-policy-coverage.test.ts | `apps/web/lib/services/__tests__/workspace-policy-coverage.test.ts` | Guards that managed-compute routes call the gate |
| test | organization-policy-evaluator.test.ts | `apps/web/lib/services/__tests__/organization-policy-evaluator.test.ts` | Evaluator decisions |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A web route receives a request from any app and calls the gate with the user id and an ask. | our servers | apps/web/lib/managed-compute-gate.ts:116,170,444 |
| The gate resolves the active workspace from the request, retrying once on failure. | our servers | apps/web/lib/services/organization-policy-gate.ts:211-215 |
| It reads billing state and the layered policy from the database, retrying once each. | our servers | organization-policy-gate.ts:248-261 |
| It applies per-member overrides when the policy has any. | our servers | organization-policy-gate.ts:280-294 |
| The pure evaluator returns allowed or a denial code; denials are logged. | our servers | organization-policy-gate.ts:296-309 |
| The route allows the request or returns the denial to the app. | device and our servers | apps/web/lib/managed-compute-gate.ts:444 [inferred for the app-side display] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Workspace policy, overrides and billing state (read only by the gate) | Database; the exact table names were not opened in this pass (migration apps/web/db/neon/0076_enterprise_control_plane_tables.sql lists enterprise tables) | Not synced to devices by the gate | unknown |
| Last known IP allow-list per workspace | In-process cache (apps/web/lib/services/organization-ip-allow-list-cache.ts) | No | Held in server memory; lifetime unknown |
| Denial log lines | Server logs | No | unknown |

**Models and providers.** The gate does not call a model or provider. It decides whether a model call may start, and managed-compute asks are the main case (organization-policy-evaluator.ts:23-24). Model and provider restrictions per workspace live in a separate model-policy gate (apps/web/lib/services/__tests__/model-policy-gate.test.ts exists) and are not covered here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account. Personal scope (no active workspace) is ungoverned for policy except for the funding organization's billing hold (organization-policy-gate.ts:199-203). |
| Permissions | Reading and changing policy needs 'policy.manage' (policy/route.ts:225-226); posture needs 'audit.read' and team-admin access (posture/route.ts:44-48). The gate itself applies to every member. |
| Subscription | Billing hold states (read-only, past due) can deny managed compute and purchases (organization-policy-evaluator.ts:55-56). Which plan allows workspace policy editing was not established here. unknown. |
| Limits and metering | The gate does not meter usage. Rate limits on the admin routes use the 'settings-org' keys (posture/route.ts:33). |
| Feature flags | none found in the gate. Tenant lockdown is checked in the directory-sync path, not here. |
| Model compatibility | Not model specific. |
| Provider restrictions | none found in this gate; provider rules sit in the model-policy gate. |
| Local mode | Local mode does not call the web server, so this gate does not apply to it [inferred]. A Local to own-key move is only previewed by the 'requireLocalToByokPreview' obligation, which the gate returns but does not enforce (organization-policy-evaluator.ts:114-118). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Policy read fails twice | Non-purchase asks denied with workspace_policy_unavailable; purchases decided on billing hold | organization-policy-gate.ts:264-276 |
| Workspace not found or not a member | Denied with workspace_not_accessible | organization-policy-gate.ts:216-223 |
| Active workspace read fails with a server error | Denied as unavailable, or billing-unavailable for purchases | organization-policy-gate.ts:224-228 |
| No policy saved | Allowed as 'unscoped' unless a billing hold applies | organization-policy-gate.ts:278 |
| Overrides unreadable | Denied as unavailable | organization-policy-gate.ts:287-293 |
| IP allow-list read fails | Last known list enforced; none known means denied | organization-policy-gate.ts:577-590 |
| Offline, retry, cancel, loading | not handled in the code at this layer; the retry is a single immediate repeat | organization-policy-gate.ts:61-71 |
| Accessibility or app differences | not handled in the code; the gate returns text and codes and each app renders them | organization-policy-gate.ts:57-59 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/organization-policy-gate.test.ts`: Personal scope, billing holds, saved policy, retry, unreadable policy, workspace selector, purchases, secret handling, MFA, product analytics
- `apps/web/lib/services/__tests__/workspace-policy-coverage.test.ts`: Every managed-compute route asks the gate and sends its surface
- `apps/web/lib/services/__tests__/organization-policy-evaluator.test.ts`: Pure evaluator decisions
- `apps/web/lib/services/__tests__/organization-policy-service.test.ts`: Policy reads
- `apps/web/lib/services/__tests__/organization-policy-merge-and-cache.test.ts`: Layering and caching
- `apps/web/app/api/settings/organization/policy/__tests__/route.test.ts`: Policy route
- `apps/web/app/api/settings/organization/posture/__tests__/route.test.ts`: Posture route
- `apps/web/lib/server/product-analytics.test.ts`: Analytics gate

**Test scenarios**

- **Policy unreadable**
  1. Make the policy read fail twice in a test double
  2. Ask for managed compute
  - Expected: allowed=false, code workspace_policy_unavailable
- **Credit top-up with unreadable policy**
  1. Make only the policy read fail
  2. Ask credit_topup with no billing hold
  - Expected: allowed=true
- **Non-member workspace**
  1. Send a workspace selector for a workspace the user is not in
  - Expected: workspace_not_accessible, not personal scope
- **Analytics off in one of two workspaces**
  1. Give the user two governing workspaces, one with analytics off
  2. Call the analytics check
  - Expected: false
- **MFA requirement unknown**
  1. Make one governing policy read fail, none requiring MFA
  - Expected: service-unavailable error, request refused
- **Real-run check**
  1. Run the admin policy edit against a local database and send a managed chat turn as a member
  - Expected: Turn refused when managed compute is off. No file records this has been run.

**Where to look when it fails**

- Log lines starting '[org-policy]', '[mfa-policy]', '[ip-allow-list]', '[secret-handling]'.
- Decision codes listed in organization-policy-evaluator.ts:42-61.
- Security audit log events for IP refusals (apps/web/lib/ip-allow-list-gate.ts:30).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Retention days is returned as an obligation but no consumer was traced** Affects: Workspace admins who set retention, all apps. Evidence: organization-policy-evaluator.ts:114-118. Work needed: Trace and test which jobs enforce retentionDays.
- **Coverage guard covers only managed-compute routes, not every workspace-data route** Affects: Workspace members, all apps. Evidence: workspace-policy-coverage.test.ts:34-43. Work needed: Extend the named-route guard to other gated routes.
- **Policy editor screen labels and plan requirement not established** Affects: Admins on web. Evidence: No screen file opened. Work needed: Trace the admin UI and the plan capability for policy editing.

**Depends on**

- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-observability-and-operations
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:apps/web/lib/services/organization-policy-gate.ts

## Unknown

- Table names that store the workspace policy and overrides.
- Which plan capability allows editing workspace policy.
- Whether any job enforces retentionDays.
- Admin policy editor screen labels.
- The brief cites organization-policy-gate.ts under apps/web/lib/services, not lib/server; the first draft's short file name is ambiguous.
