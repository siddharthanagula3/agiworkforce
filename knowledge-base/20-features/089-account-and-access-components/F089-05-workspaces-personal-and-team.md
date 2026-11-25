---
id: "F089-05"
type: "feature"
title: "Workspaces (personal and team)"
aliases: ["Organization service", "Workspace service", "Active workspace", "Team workspace", "Personal workspace", "Workspace deletion with cooling period (S89.10, S89.11)"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.10", "S89.11"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-api-and-contracts", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:team", "plan:team_premium", "plan:enterprise", "table:organizations", "table:organization_members", "table:user_settings", "api:GET /api/settings/workspaces", "api:PUT /api/settings/workspaces", "api:POST /api/settings/organization", "api:DELETE /api/settings/organization", "F089-04", "F089-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-05 Workspaces (personal and team)

A person has a personal workspace and may belong to team workspaces. They pick the active one, and data and policy follow it. A team owner on a team plan can create one workspace, rename it, transfer ownership, and schedule its deletion with a 14 day cooling period that can be cancelled.

Area: [89. Account and access components](README.md). Requirement items: [S89.10](../../10-requirements/capabilities/089-account-and-access-components.md#s8910), [S89.11](../../10-requirements/capabilities/089-account-and-access-components.md#s8911).

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

**What it does.** Lists the person's workspaces, saves and resolves the active one (a request header beats the saved choice), and lets team admins create and change an organization; the owner can schedule deletion and cancel it.

**Why it exists.** Teams need shared data and shared rules separate from a person's own account, with seat limits and a safe way to delete a team.

**Who uses it.** Team owners and admins; every team member when switching workspace.

**Problems it solves**

- Data and policy are scoped to the chosen workspace; a request for a workspace the person is not in is refused (apps/web/lib/services/active-workspace-service.ts:63-84).
- A team cannot be deleted by accident: owner only, typed confirmation, legal holds block, 14 day cooling (apps/web/app/api/settings/organization/route.ts:475-575).
- Seats cannot exceed the licence (apps/web/lib/services/organization-seat-service.ts:76-90).

**Use cases**

- An employee switches from personal to the company workspace in the account menu.
- A manager on a team plan creates the company workspace.
- The owner schedules deletion, then cancels within 14 days.
- Mobile sends an active-workspace header on each request.

## 2. User experience

**Where to find it**

- Web: account menu workspace switcher; Settings, Team (apps/web/app/settings/team/page.tsx); workspace console at /workspace (nav groups Workspace, People, Controls, Records; links Overview, Members, Roles, Identity ...) (apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:38-132).
- Desktop: cloud team section (apps/desktop/src/features/settings/cloud/CloudTeamSection.tsx) using /api/settings/organization and /organization/active (apps/desktop/src/api/cloudAccountSettings.ts:662-686).
- Mobile: team feature calling /api/settings/organization, /organization/active, transfer-ownership (apps/mobile/src/features/team/service.ts:68-176).

**Before you start**

- Creating a workspace needs an active plan with team administration (Team, Team Premium or Enterprise plan ids team, team_premium, enterprise) (packages/contracts/types/src/billing-catalog.ts:362; apps/web/app/api/settings/team/team-admin-access.ts:63-75).
- The person must not already own a workspace (organization/route.ts:244-258).
- Deleting needs ownership of the active workspace (organization/route.ts:490).

**Screens and controls**

- Switch: PUT /api/settings/workspaces with a workspace id or the personal selector (workspaces/route.ts:56-102).
- Header selector that wins over the saved choice (active-workspace-service.ts:63-84).
- Delete confirmation must match the workspace name or slug (organization/route.ts:505-514).
- Cancel deletion: POST /api/settings/organization/deletion/cancel (owner only).

**Journey**

1. Person opens the switcher; the app lists workspaces (GET /api/settings/workspaces).
2. Person picks one; the app PUTs the choice; the server saves it and caches it.
3. Later requests resolve the workspace from header or saved choice.
4. To delete, the owner types the workspace name; the server checks legal holds and schedules erasure 14 days out.
5. The owner can cancel any time before the date.

**What the person sees and gets**

- List: workspaces, activeWorkspaceId, activeOrganizationId, scope 'organization' or 'personal' (workspaces/route.ts:36-50).
- Switch result: workspaceId, activeOrganizationId, scope.
- Refusals: 'Invalid Managed Cloud workspace selector' (validation), 'You are not a member of that workspace' (403).
- Create refusals: 'You already own a workspace. Switch to it from the account menu.', 'Your purchased seats could not be verified...' (503).
- Delete message: 'Workspace deletion scheduled. Everything in this workspace will be permanently deleted in 14 days. Cancel from the workspace deletion page, under Settings, Workspace, any time before then to keep it.' with scheduledFor (organization/route.ts:572-576).

**Settings**

- Saved active workspace in settings namespace 'workspace', key activeOrganizationId (active-workspace-service.ts:22-24, 168-190).
- Cooling period: ORGANIZATION_DELETION_COOLING_PERIOD_DAYS = 14 (apps/web/lib/server/organization-deletion.ts:10).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Resolve active workspace: header (personal value returns none; malformed value is a validation error; non-member is 403), else cache, else saved selection joined to active membership (active-workspace-service.ts:63-110).
- List memberships and account workspaces (active-workspace-service.ts:155-181; workspaces/route.ts:30-50).
- Switch inside a transaction with an advisory lock; membership checked; value and cache written (workspaces/route.ts:75-90; active-workspace-service.ts:168-232).
- Create organization: team-admin gate, one owned workspace, purchased seats read from billing, advisory lock, transaction (organization/route.ts:227-346).
- Delete: owner only, name or slug confirmation, legal-hold check, one pending schedule, audit event organization_deletion_requested (organization/route.ts:475-575).
- Deletion status exposed with pending, requestedAt, scheduledFor, canCancel (organization/route.ts:105-153).
- Seat accounting: licensed seats, consumed, available, source billing or unprovisioned; database ceiling errors become a 409 with a plain message (organization-seat-service.ts:33-100).
- Ownership transfer route exists with step-up and entitlement guards (apps/web/app/api/settings/organization/transfer-ownership/route.ts; its tests).

**Incomplete**

- Draft said admins schedule deletion; code requires the owner (organization/route.ts:490).
- Draft said a change clears the cache; code writes the new value into the cache (active-workspace-service.ts:219-231).

**Present but disconnected or switched off**

- Workspace control sets can lock a workspace down for an incident; the lockdown gate treats an unresolvable lookup as not locked (apps/web/lib/api-auth.ts:166-182).

**Not available**

- Workspaces on CLI, VS Code and Chrome apps: only the CLI workspace policy file was seen (apps/cli/src/cloud/workspace_policy.rs); behaviour not traced.

## 4. Required behaviour

**Established requirements**

- An organization service creates, updates, transfers and deletes organizations (workspaces for teams) with owners and seats. (source: brief S89.10)
- A workspace service lists a user's workspaces (personal and team) and switches the active one, scoping data to it. (source: brief S89.11)
- A selector that is not a valid id is refused with a validation error; a non-member is refused as forbidden. (source: apps/web/lib/services/active-workspace-service.ts:68-78)
- An action a user cannot undo asks first and names the consequence; permanent removal happens only from an explicit user action that names what is lost. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. GET /api/settings/workspaces returns personal scope when no organization is active.
2. PUT with a workspace the caller is not in returns 403 'You are not a member of that workspace'.
3. A request header with a valid member workspace id overrides the saved choice for that request.
4. A user who already owns a workspace gets 409 on POST /api/settings/organization.
5. A non-owner calling DELETE /api/settings/organization is refused.
6. DELETE with a wrong name or slug confirmation schedules nothing.
7. DELETE with an active legal hold is refused with the hold count message.
8. After scheduling, deletion status shows pending true and canCancel true until the date.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A scheduled-deletion workspace keeps working until the date [inferred; the enforcement job was not read].
- Seat counts come from billing; a workspace without a subscription shows 'unprovisioned' [inferred from seatSource].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Document in the brief that creation needs a team plan and one owned workspace per account.
- [proposed] Trace and test the workspace header on CLI, VS Code and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | active-workspace-service | `apps/web/lib/services/active-workspace-service.ts` | Resolve, list, persist active workspace (lines 63, 155, 168, 217). |
| endpoint | GET and PUT /api/settings/workspaces | `apps/web/app/api/settings/workspaces/route.ts` | List and switch. |
| endpoint | GET, POST, PATCH, DELETE /api/settings/organization | `apps/web/app/api/settings/organization/route.ts` | Read, create, rename, schedule deletion. |
| endpoint | PUT /api/settings/organization/active | `apps/web/app/api/settings/organization/active` | Active workspace call used by Desktop and Mobile clients (route file not read). |
| endpoint | POST /api/settings/organization/deletion/cancel | `apps/web/app/api/settings/organization/deletion/cancel/route.ts` | Owner cancels scheduled deletion. |
| endpoint | POST /api/settings/organization/transfer-ownership | `apps/web/app/api/settings/organization/transfer-ownership/route.ts` | Transfer ownership. |
| service | organization-seat-service | `apps/web/lib/services/organization-seat-service.ts` | Seat state and error mapping. |
| service | team-admin-access | `apps/web/app/api/settings/team/team-admin-access.ts` | Plan gate team_admin and seat facts. |
| service | organization-deletion | `apps/web/lib/server/organization-deletion.ts` | Cooling period and schedule date. |
| service | organization-erasure | `apps/web/lib/server/organization-erasure.ts` | Executes erasure (brief S89.23; not read). |
| service | organization-membership-service | `apps/web/lib/services/organization-membership-service.ts` | requireOrganizationOwner. |
| service | request-context-cache | `apps/web/lib/server/request-context-cache.ts` | Active organization cache. |
| schema | ManagedCloudAccountWorkspacesSchema and workspace header constants | `packages/contracts/cloud-contracts` | Shape of list response and header names (imports at active-workspace-service.ts:4-7). |
| screen | Workspace console | `apps/web/features/workspace-console` | Web console pages and nav. |
| screen | Team settings page | `apps/web/app/settings/team/page.tsx` | Web team page. |
| component | CloudTeamSection | `apps/desktop/src/features/settings/cloud/CloudTeamSection.tsx` | Desktop team UI. |
| service | team service | `apps/mobile/src/features/team/service.ts` | Mobile workspace and team calls. |
| table | organizations, organization_members, user_settings | `apps/web/lib/services/active-workspace-service.ts` | Workspace rows, memberships, saved selection. |
| event | organization_deletion_requested audit event | `apps/web/app/api/settings/organization/route.ts` | Critical audit row. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client lists workspaces or sends a workspace header with a request. | device and our servers | apps/web/lib/services/active-workspace-service.ts:63-84 |
| Server verifies active membership in organization_members. | our servers | active-workspace-service.ts:131-146 |
| Switch writes settings.workspace.activeOrganizationId and sets the cache, under an advisory lock. | our servers | workspaces/route.ts:75-90; active-workspace-service.ts:168-232 |
| Create checks team plan and billing-backed purchased seats (a Stripe read), then inserts the organization in a transaction. | our servers | organization/route.ts:242-300 (Stripe call via resolvePurchasedSeatsForOwner) |
| Delete validates owner, confirmation, holds, then sets deletion_requested_at and deletion_scheduled_for. | our servers | organization/route.ts:490-555 |
| After the date the erasure code removes the organization (job not read). | our servers | brief S89.23 cites apps/web/lib/server/organization-erasure.ts:297; not opened |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Active workspace choice | user_settings.settings.workspace.activeOrganizationId plus key-value cache | Server; all apps read it | Cleared when membership ends (clearRecordedActiveWorkspaceSelection). |
| Organization, members, licensed seats | tables organizations, organization_members | Server | Deletion scheduled with 14 day cooling, then erased. |
| Deletion request time, schedule, requester | organizations.deletion_requested_at, deletion_scheduled_for, deletion_requested_by | Server | Cleared on cancel [inferred]. |

**Models and providers.** No AI model. Billing provider (Stripe) is read for purchased seats on create.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | Create and rename: team admin access (membership plus plan). Delete, cancel deletion: organization owner. Switch: any active member. |
| Subscription | Creation and admin need a plan with the team_admin capability: team, team_premium, enterprise (billing-catalog.ts:362). Seats come from licensed seats. |
| Limits and metering | One owned workspace per account. Licensed seat ceiling enforced by database constraint organizations_seats_within_license. Rate limits 'settings-org', 'settings-org-patch'. |
| Feature flags | none found in the code for these routes. |
| Model compatibility | Not model-dependent, though workspace policy (model policy) is a separate feature. |
| Provider restrictions | Billing seats read from Stripe. |
| Local mode | Needs our servers. Local inference stays free and is not scoped by a workspace in the code read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Malformed selector | Validation error and a workspace_switch rejection metric. | active-workspace-service.ts:68-72 |
| Not a member | 403; cached selection pointing at a lost membership is reset to personal. | active-workspace-service.ts:73-97 |
| Seat ceiling | 409 'This organization has no licensed seats available...'. | organization-seat-service.ts:76-83 |
| Stripe unreachable on create | 503 'Your purchased seats could not be verified. No organization was created; please try again.' | organization/route.ts:262-282 |
| Deletion already scheduled, window closed | Refused; schedule unchanged. | organization/route.ts:525-531 |
| Concurrent delete | 409 'Workspace deletion state changed. Refresh before trying again.' | organization/route.ts:551-553 |
| Workspace lookup failure at request binding | 503 'Unable to verify workspace scope. Please try again shortly.' | apps/web/lib/api-auth.ts:233-241 |
| Offline | not handled in the code read. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/active-workspace-service.test.ts`: Resolve and persist active workspace.
- `apps/web/app/api/settings/workspaces/__tests__/route.test.ts`: Workspaces route.
- `apps/web/app/api/settings/organization/__tests__/route.creation.test.ts`: Create organization.
- `apps/web/app/api/settings/organization/__tests__/route.creation-seats.test.ts`: Create with seats.
- `apps/web/app/api/settings/organization/__tests__/route.deletion.test.ts`: Scheduled deletion.
- `apps/web/app/api/settings/organization/__tests__/route.rename-audit.test.ts`: Rename audit.
- `apps/web/app/api/settings/organization/__tests__/route.capability-honesty.test.ts`: Capability honesty of the route.
- `apps/web/app/api/settings/organization/transfer-ownership/__tests__/route.step-up.test.ts`: Step-up on transfer.
- `apps/web/app/api/settings/organization/transfer-ownership/__tests__/route.sole-owner.test.ts`: Sole owner rule.
- `apps/web/lib/services/__tests__/organization-seat-service.test.ts`: Seat accounting.
- `apps/web/db/neon/organization-seats-lifecycle-migration.test.ts`: Seat lifecycle migration.

**Test scenarios**

- **Switch and header override**
  1. Join two workspaces
  2. PUT workspace A
  3. Send a request with the header for B
  - Expected: Header request resolves to B; the saved choice stays A.
- **Non-member**
  1. Send the header for a workspace the user is not in
  - Expected: 403 'You are not a member of that workspace'.
- **Create twice**
  1. Create a workspace on a team plan
  2. Create another
  - Expected: Second call 409 'You already own a workspace...'.
- **Schedule and cancel deletion**
  1. As owner DELETE with the right name
  2. Check status
  3. POST cancel
  - Expected: Message shows 14 days and scheduledFor; status pending then cleared.
- **Legal hold**
  1. Add an active legal hold
  2. Try to schedule deletion
  - Expected: Refused naming the hold count.

**Where to look when it fails**

- Log 'Workspace deletion scheduled'; audit organization_deletion_requested.
- Metric rejection kind workspace_switch with reasons malformed_selector, not_a_member, resource_in_other_workspace.
- Tables organizations, organization_members, user_settings.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief and draft say 'admins' delete; code allows only the owner.** Affects: Team admins. Evidence: organization/route.ts:490. Work needed: Correct the brief.
- **Workspace behaviour on CLI, VS Code and Chrome not traced.** Affects: Those apps. Evidence: only CLI policy file seen. Work needed: Trace header use and tests.
- **Erasure execution after cooling period not verified here.** Affects: All team workspaces. Evidence: organization-erasure.ts not opened. Work needed: Read and test the scheduled job.

**Depends on**

- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-api-and-contracts
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:team
- plan:team_premium
- plan:enterprise
- table:organizations
- table:organization_members
- table:user_settings
- api:GET /api/settings/workspaces
- api:PUT /api/settings/workspaces
- api:POST /api/settings/organization
- api:DELETE /api/settings/organization
- F089-04
- F089-06

## Unknown

- Scheduled erasure job behaviour and its trigger.
- Contents of /api/settings/organization/active route.
- Workspace header use on CLI, VS Code and Chrome.
- Which workspace features apply when a workspace is scheduled for deletion.
- How Local mode on Desktop treats a selected team workspace.
