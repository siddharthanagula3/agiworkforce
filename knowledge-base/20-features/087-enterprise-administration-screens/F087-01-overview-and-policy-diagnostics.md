---
id: "F087-01"
type: "feature"
title: "Overview and policy diagnostics"
aliases: ["Workspace overview", "Overview (console link)", "Security posture", "Organization overview", "WorkspacePostureOverview", "Explain a member's policy", "Policy diagnostics", "S87.01", "S87.39", "Workspace administration (mobile)"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.01", "S87.39"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "plan:team", "plan:enterprise", "api:GET /api/settings/organization/posture", "api:GET /api/settings/organization/policy/diagnose", "table:organization_admin_policies", "table:organization_policy_overrides", "table:organization_members", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "F087-02", "F087-04", "F087-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-01 Overview and policy diagnostics

The Workspace console Overview page on web (and desktop through the hosted web app) shows an owner or admin a live security posture list with recommendations. A diagnostics panel on the Policy page explains what one member may use and why a request would be allowed or refused. Mobile shows a trimmed posture list.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.01](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8701), [S87.39](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8739).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Overview: reads the workspace's real configuration from the database on each load and lists signals in groups (Identity, Provisioning, Access, AI controls, Data, Residency and keys, Audit), each marked Enforced, Stated position or Not configured, plus Recommended next steps (workspace-posture-service.ts:33, WorkspacePostureOverview.tsx:171). Diagnostics: for a chosen member, optionally a feature, an app surface and a country, it returns the member's effective policy, the rules that turned things off, and an allow or refuse decision with a plain reason (policy/diagnose/route.ts:20-31,61-70; WorkspacePolicyDiagnostics.tsx:115).

**Why it exists.** A security reviewer reads a posture page as a list of controls, so the page separates what the server enforces from what is only recorded (workspace-posture-service.ts:22-32). Diagnostics lets an admin answer 'why can this person not use X' without guessing.

**Who uses it.** Workspace owners and admins on a Team or Enterprise plan. Members are refused by the server.

**Problems it solves**

- An admin cannot tell which controls actually bind and which are only notes.
- An admin cannot tell why a member is blocked when defaults, roles, groups and personal exceptions all apply.
- A security team needs one page to check sign-in, provisioning, sharing, retention, keys and audit setup.

**Use cases**

- An admin opens Overview before a security review and follows a Recommended link to verify a domain.
- An admin picks a member and the Code feature on the Desktop app and reads why it is refused.
- An admin on the phone checks seats and posture rows without opening a laptop.

## 2. User experience

**Where to find it**

- Web: console at /workspace, nav section 'Workspace', link 'Overview' with hint 'Security posture and recommendations' (WorkspaceConsoleNav.tsx:38-47). Reached from Settings through the 'Workspace administration' pointer (WorkspaceConsolePointer.tsx:28).
- Web diagnostics: console 'Policy' page (/workspace/policy), card 'Explain a member's policy' (WorkspaceFeatureControls.tsx:564; WorkspacePolicyDiagnostics.tsx:115).
- Desktop: the Electron main window loads the hosted web app (electron/main.ts:1065-1067), so the same pages apply [inferred]. Whether the window offers a route to /workspace is unknown.
- Mobile: Settings > Workspace screen, section 'Seats and invitations' followed by one group per posture group (WorkspaceAdministration.tsx:366-420; settings/workspace.tsx:664-667).
- CLI, VS Code, Chrome: not available.

**Before you start**

- Signed in, current terms accepted, age check passed, account active (workspace/layout.tsx:25-35).
- A shared workspace selected; otherwise 'No workspace selected' (WorkspaceConsoleShell.tsx:100).
- Role owner or admin for the page frame (WorkspaceConsoleShell.tsx:10,107), Team or Enterprise plan (team-admin-access.ts:70-84), and the audit.read permission for the posture data (posture/route.ts:43-48). Diagnostics also needs policy.manage (diagnose/route.ts:40-44).

**Screens and controls**

- Overview header: workspace name, 'Read live from this workspace's configuration on <time>' and a count of items needing attention (WorkspacePostureOverview.tsx:219-240).
- 'Recommended' card with a button per recommendation; group cards with rows showing a state mark, value, an enforcement badge and a link arrow.
- Footnote explaining 'Stated position'.
- Diagnostics form: Member select, 'Feature to check (optional)', 'From' app select, 'Country code (optional)', and an 'Explain' button (WorkspacePolicyDiagnostics.tsx:128-195).
- Mobile rows: 'Seats', pending invitations, 'Invite by email', posture rows, and recommendation rows that open the web in an in-app browser (WorkspaceAdministration.tsx:371-427).

**Journey**

1. Open Settings, choose 'Workspace administration', or go to /workspace.
2. Read the header and the Recommended card.
3. Open a group row link to fix an item (for example Members, Identity, Policy).
4. To explain a member: go to Policy, scroll to 'Explain a member's policy', choose the member, optionally a feature, app and country, press Explain.
5. Read 'Allowed.' or 'Refused.' with the reason, the policy revision, any rules that turned things off, and reasoning, country and app limits.

**What the person sees and gets**

- Loading skeleton cards; error card 'We could not load your workspace posture' with 'Try again'.
- Card 'You do not administer this workspace' for a refusal (WorkspacePostureOverview.tsx; use-workspace-posture.ts:64).
- Diagnostics result line 'Allowed.' or 'Refused.' plus reason; 'Nothing is turned off for this person.'; 'This workspace has no policy yet.'
- Mobile: error row 'Workspace administration could not load' with value 'Retry'.

**Settings**

- The posture reflects Policy, Models, Connectors, Identity, Data and Audit pages; it has no settings of its own.
- Posture data is cached in the browser for 60 seconds (use-workspace-posture.ts:71).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Posture route: rate limit, user-scoped database, membership check, Team/Enterprise check, audit.read check, live read, admin-data-access log (posture/route.ts:33-57).
- Posture service reads organizations, members, invitations, SSO, directory sync, SCIM tokens/users/groups, shared items, audit events, legal holds, audit destinations, spend limit, connector and model policy counts (workspace-posture-service.ts:193-300).
- Each signal carries enforcement 'enforced', 'stated' or 'unconfigured' (workspace-posture-service.ts:33).
- Diagnose route validates the query, confirms the person is a member, and returns effective controls plus a decision with Cache-Control private, no-store (diagnose/route.ts:46-71).
- Web UI for both (WorkspacePostureOverview.tsx, WorkspacePolicyDiagnostics.tsx) and mobile posture list (WorkspaceAdministration.tsx).

**Incomplete**

- The overview does not show the plan name; the plan is used only for retention (workspace-posture-service.ts:354) and a 'Seats' row exists (workspace-posture-service.ts:487-499).
- Diagnostics explains only a feature ask or a managed-compute ask; model, connector, sharing or export requests cannot be chosen (diagnose/route.ts:61-65).
- Mobile shows state and value but not the enforcement badge or detail text (administration.ts:30-36).

**Present but disconnected or switched off**

- Desktop: the internal desktop source has a workspace policy hook that hides sidebar features, but the public Electron window shows the hosted web app (desktop/src/features/v3/useWorkspacePolicy.ts:53-64; electron/main.ts:1065-1067).

**Not available**

- CLI: no console or command for posture or diagnostics found; a search of cli/src, extension/src and vscode for the posture and diagnose endpoints found none (search result).
- VS Code and Chrome extension: not applicable.

## 4. Required behaviour

**Established requirements**

- An administrator opens an organization overview that summarises the workspace from live data. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S87.01)
- An administrator can see the effective policy for a member or request and why an action was allowed or refused. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S87.39)
- Owner/admin/member permissions are enforced through direct API requests and the UI. (source: docs/product/experience-contract.md:795 (W22))
- Enterprise admin, audit, policy and SSO/SCIM controls are required before broad managed compute. (source: docs/product/suite.md:92)

**Acceptance criteria**

1. A member who calls GET /api/settings/organization/posture directly gets 403 and no posture data.
2. An admin on a Team or Enterprise plan sees the posture with a generated-at time, and a second open after a configuration change shows the change (after the 60 s cache).
3. A row whose value is only recorded shows 'Stated position', not 'Enforced'.
4. Diagnostics for a member with a feature turned off returns 'Refused.' with a reason and lists the rule that turned it off.
5. Diagnostics for a person who is not a member returns 'That person is not a member of this workspace.'
6. If the database cannot read the policy, the decision is a refusal with code workspace_policy_unavailable, not 'allowed'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The Overview should state the plan and licensed seats; the brief's S87.01 asks for plan, but the page shows only a 'Seats' row [inferred from workspace-posture-service.ts:487].
- A non-admin on mobile should not see an error row; the admin section is shown by plan, not role (settings/workspace.tsx:340,664) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let diagnostics also explain model, connector and sharing asks, since those are refused by other gates.
- [proposed] Show the enforcement badge on mobile rows.
- [proposed] Show a distinct 'Team or Enterprise plan required' card instead of the generic 'You do not administer' card for a subscription refusal.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Workspace overview page | `apps/web/app/workspace/page.tsx` | Renders WorkspacePostureOverview at /workspace. |
| component | WorkspacePostureOverview | `apps/web/features/workspace-console/components/WorkspacePostureOverview.tsx` | Posture UI: header, Recommended, groups, badges, error and refusal cards. |
| hook | useWorkspacePosture | `apps/web/features/workspace-console/hooks/use-workspace-posture.ts` | Fetches posture with bearer token; 403 becomes null; 60 s stale time. |
| component | WorkspaceConsoleNav | `apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx` | Console navigation with the Overview link. |
| component | WorkspaceConsoleShell | `apps/web/features/workspace-console/components/WorkspaceConsoleShell.tsx` | Frame states: temporarily unavailable, no workspace, not an administrator. |
| other | Console layout | `apps/web/app/workspace/layout.tsx` | Server gate: session, terms, age, account active, membership lookup. |
| endpoint | GET /api/settings/organization/posture | `apps/web/app/api/settings/organization/posture/route.ts` | Admin-only posture read. |
| service | readWorkspacePosture | `apps/web/lib/services/workspace-posture-service.ts` | Builds groups, signals and recommendations from tables. |
| service | requireTeamAdminAccess | `apps/web/app/api/settings/team/team-admin-access.ts` | Member and Team/Enterprise entitlement check shared by admin routes. |
| endpoint | GET /api/settings/organization/policy/diagnose | `apps/web/app/api/settings/organization/policy/diagnose/route.ts` | Explains a member's effective policy and a decision. |
| service | diagnoseMemberPolicy | `apps/web/lib/services/organization-policy-gate.ts` | Reads layered policy and overrides and evaluates one ask. |
| service | Policy evaluator and decision codes | `apps/web/lib/services/organization-policy-evaluator.ts` | Defines PolicyAsk, PolicyDecisionCode and the unavailable and unscoped decisions. |
| component | WorkspacePolicyDiagnostics | `apps/web/features/workspace-console/components/WorkspacePolicyDiagnostics.tsx` | Diagnostics form and result. |
| component | WorkspaceFeatureControls | `apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx` | Hosts the diagnostics card on the Policy page. |
| service | workspaceAccess helper | `apps/web/app/api/settings/organization/workspace-access.ts` | requireWorkspaceConsolePermission used by diagnose. |
| component | Mobile WorkspaceAdministration | `apps/mobile/src/features/team/WorkspaceAdministration.tsx` | Seats, invitations and posture on the phone. |
| service | Mobile administration client | `apps/mobile/src/features/team/administration.ts` | fetchWorkspacePosture and parsing. |
| screen | Mobile workspace settings screen | `apps/mobile/app/(app)/settings/workspace.tsx` | Mounts WorkspaceAdministration when the plan allows team admin. |
| table | organization_admin_policies | `apps/web/lib/services/organization-policy-service.ts` | Stored workspace policy read by posture and diagnostics. |
| table | organization_policy_overrides | `apps/web/lib/services/organization-policy-override-service.ts` | Exceptions applied in diagnostics. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin opens /workspace; the server layout checks the session, terms, age eligibility and account state, then looks up the workspace role. | our servers | apps/web/app/workspace/layout.tsx:21-49 |
| The page frame is chosen from the role: unavailable, no workspace, not an administrator, or the console. | device | apps/web/features/workspace-console/components/WorkspaceConsoleShell.tsx:100-111 |
| The browser calls GET posture with its bearer token; a 403 becomes the 'You do not administer' card. | device and our servers | apps/web/features/workspace-console/hooks/use-workspace-posture.ts:60-66 |
| The route applies a rate limit, resolves the user-scoped database, requires membership, Team/Enterprise entitlement and audit.read. | our servers | apps/web/app/api/settings/organization/posture/route.ts:34-48 |
| The service runs its database reads in parallel and builds signals and recommendations; the access is logged as admin data access. | our servers | apps/web/lib/services/workspace-posture-service.ts:169-300; posture/route.ts:50-57 |
| For diagnostics, the form calls GET diagnose; the route needs policy.manage, checks the member exists, builds an ask, and diagnoseMemberPolicy returns effective controls and a decision. | our servers | apps/web/app/api/settings/organization/policy/diagnose/route.ts:40-71 |
| On mobile, the screen loads invitations and posture together and shows them as rows. | device and our servers | apps/mobile/src/features/team/WorkspaceAdministration.tsx:229-243 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Posture snapshot (not stored) | Computed per request from workspace tables; only cached in the browser query cache | No | Browser cache expires after about 5 minutes (use-workspace-posture.ts:72) |
| Admin data access log entry | Written by logAdminDataAccess; target table not read | unknown | unknown |

**Models and providers.** No model or provider takes part in posture or diagnostics. The posture counts model and connector policy rows only (workspace-posture-service.ts:288-300).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account in good standing, terms accepted, age eligible, active member of a shared workspace (workspace/layout.tsx:25-35; posture/route.ts:38-41). |
| Permissions | Console frame: owner or admin role. Posture: audit.read. Diagnostics: policy.manage (posture/route.ts:43-48; diagnose/route.ts:40-44). |
| Subscription | Team, Team premium or Enterprise plan (capability team_admin) (billing-catalog.ts:362; team-admin-access.ts:80). Other plans get a 403 SUBSCRIPTION_REQUIRED. |
| Limits and metering | Rate limit bucket 'settings-org' (posture/route.ts:34). No usage metering found. |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable. The console is a cloud page that needs sign-in and a cloud workspace. Local inference is not affected and needs no workspace. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Two skeleton cards. | WorkspacePostureOverview.tsx:171-180 |
| Error | Card with 'Try again' that refetches. | WorkspacePostureOverview.tsx:182-205 |
| Refused (403, including a plan refusal) | Card 'You do not administer this workspace'; the plan-specific message is not shown [inferred]. | use-workspace-posture.ts:64 |
| No workspace / membership read failed | 'No workspace selected' or 'temporarily unavailable', never an empty-workspace message for a database fault. | workspace/layout.tsx:44-49; WorkspaceConsoleShell.tsx:100 |
| Policy unreadable | Diagnosis decision refuses with a workspace_policy_unavailable decision and the gate returns 503 on live routes. | organization-policy-evaluator.ts:82; managed-compute-gate.ts:168-175 |
| No saved policy | Diagnostics says 'This workspace has no policy yet.' | WorkspacePolicyDiagnostics.tsx (result block, lines after 'rules.length') |
| Country omitted | A restricted-country workspace refuses, as a request with unknown location is. | WorkspacePolicyDiagnostics.tsx:187-190 |
| Offline / retry / cancel | not handled in the code beyond Try again and Retry. | searched WorkspacePostureOverview.tsx and WorkspacePolicyDiagnostics.tsx; no offline or cancel handling found |
| Mobile non-admin member | The admin section is gated by plan only, so a member likely sees the load-error row [inferred]. | settings/workspace.tsx:340,664-667; administration.ts:185 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/workspace-posture-service.test.ts`: Posture service (46 test cases; contents not opened beyond the count).
- `apps/web/lib/services/__tests__/workspace-posture-key-rotation.test.ts`: Key-rotation posture signal, by file name.
- `apps/web/app/api/settings/organization/posture/__tests__/route.test.ts`: Posture route (9 cases; contents not opened).
- `apps/web/features/workspace-console/components/__tests__/WorkspacePostureOverview.test.tsx`: Overview UI (11 cases).
- `apps/web/features/workspace-console/components/__tests__/WorkspacePolicyDiagnostics.test.tsx`: Diagnostics UI (2 cases).
- `apps/web/app/api/settings/organization/policy/diagnose/__tests__/route.test.ts`: Diagnose route, by file name.
- `apps/web/lib/services/__tests__/organization-policy-gate.test.ts`: Policy gate, by file name.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceConsoleShell.test.tsx`: Console frame states, by file name.

**Test scenarios**

- **Member is refused by the server**
  1. Sign in as a plain member of a Team workspace.
  2. Call GET /api/settings/organization/posture with that session.
  - Expected: 403 and no posture JSON.
- **Admin sees live data**
  1. Sign in as admin on a Team workspace.
  2. Open /workspace and note 'Pending invitations'.
  3. Send an invitation, wait over 60 seconds, reload.
  - Expected: The count changes and the generated-at time moves.
- **Stated versus enforced**
  1. Open Overview and find a row labelled 'Stated position'.
  2. Read its tooltip and the footnote.
  - Expected: Wording says it is recorded and not enforced.
- **Explain a refused feature**
  1. Turn a feature off for a member on the Policy page.
  2. In 'Explain a member's policy' choose the member and that feature, press Explain.
  - Expected: 'Refused.' with a reason and a rule line naming the feature turned off.
- **Fail closed**
  1. In a test environment make the policy read fail.
  2. Request a governed feature as a member.
  - Expected: Refusal (503 with retry hint), not an allow.
- **Mobile posture**
  1. Open Settings > Workspace on a Team account as admin.
  - Expected: Seats row, invitations and posture groups load; a recommendation opens the web page.

**Where to look when it fails**

- Log lines '[org-policy] ... denied' and '[workspace-controls] policy unreadable after retry; denied' (organization-policy-gate.ts:42-48,347).
- Error names SUBSCRIPTION_REQUIRED and decision codes in organization-policy-evaluator.ts:42-61.
- Tables: organization_admin_policies, organization_policy_overrides, enterprise_audit_events.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)
- Mobile: [70-qa/test-plans/mobile/087-enterprise-administration-screens.md](../../70-qa/test-plans/mobile/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **Diagnostics cannot explain model, connector, sharing or export refusals.** Affects: Admins on web and desktop. Evidence: diagnose/route.ts:61-65 builds only feature and managed_compute asks. Work needed: Add asks for model access and connector policy, or link to those pages' own explanations.
- **Plan name is not in the overview.** Affects: Admins. Evidence: workspace-posture-service.ts groups list has no plan row; brief S87.01 names plan. Work needed: Add a plan row or confirm the brief wording.
- **Mobile admin section can show an error to non-admin members.** Affects: Mobile members on a Team plan. Evidence: settings/workspace.tsx:340,664; administration.ts:185. Work needed: Gate by role as well as plan.
- **No CLI equivalent.** Affects: CLI users. Evidence: no CLI file references the endpoints. Work needed: Decide whether the CLI needs one; the web console may be enough.
- **Plan refusal shows the generic 'not an administrator' card.** Affects: Admins on a lower plan. Evidence: use-workspace-posture.ts:64. Work needed: Read the refusal code and show an upgrade message.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- plan:team
- plan:enterprise
- api:GET /api/settings/organization/posture
- api:GET /api/settings/organization/policy/diagnose
- table:organization_admin_policies
- table:organization_policy_overrides
- table:organization_members
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- F087-02
- F087-04
- F087-06

## Unknown

- Whether the Electron window offers navigation to /workspace.
- Where logAdminDataAccess stores its record and how long it is kept.
- Whether the Tauri-internal desktop app has its own posture screen (none found).
- Which tests assert the fail-closed decision; test bodies were not opened.
