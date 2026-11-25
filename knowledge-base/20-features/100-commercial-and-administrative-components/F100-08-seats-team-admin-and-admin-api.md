---
id: "F100-08"
type: "feature"
title: "Seats, team admin and admin API"
aliases: ["Seats, team admin and admin API", "Team seats", "Licensed seats", "Invitations", "Workspace API keys", "Admin API keys", "Service principals", "SCIM directory sync", "Directory sync (SCIM 2.0)", "S100.21 Seat/license service", "S100.26 Administrative API"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.21", "S100.26"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-api-and-contracts", "surface:web", "mode:cloud", "plan:team", "plan:enterprise", "table:organizations", "F100-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-08 Seats, team admin and admin API

Tracks how many paid seats a workspace has and how many are used, lets admins invite members within that limit, and lets admins run the workspace through scoped API keys. Enterprise workspaces can also sync users from their identity provider through SCIM. Everything is on the web and server; no other app was found to manage seats.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.21](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10021), [S100.26](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10026).

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

**What it does.** Seat service: the organizations table holds licensed_seats and a trigger-maintained seats_consumed, with a database check that seats used cannot pass seats licensed (apps/web/db/neon/0085_organization_seats_lifecycle.sql:24-60; apps/web/lib/services/organization-seat-service.ts:30-60). Stripe webhook code writes purchased seats onto the organization (apps/web/app/api/stripe-webhook/lib/seats.ts:90-200). Invitations are created, listed and expired by the Team settings API (apps/web/app/api/settings/team/invitations/route.ts:60-160). Admin API: workspace API keys with the prefix agiadm_ act as service principals with scopes (apps/web/lib/server/admin-api-keys.ts:19, 95-130; apps/web/lib/server/compliance-caller.ts:36-85). SCIM: a bearer token acts for one workspace and provisions users and groups (apps/web/lib/server/scim/scim-auth.ts:30-120).

**Why it exists.** So teams pay for the number of people they have, admins cannot add past that number, and large customers can manage people from their own identity system. The brief asks for a seat service that tracks purchased seats, assigns and enforces them, and an authenticated, scoped administrative API (doc: knowledge-base/data/area-briefs/100-commercial-and-administrative-components.md S100.21, S100.26).

**Who uses it.** Workspace owners and admins (Team or Enterprise plan), automation that holds a workspace API key, and identity providers calling SCIM.

**Problems it solves**

- Prevents more members than paid seats, even when two admins act at once (database check).
- Lets an admin invite someone who has no account yet.
- Lets automation read audit data and manage members with only the permissions it was given.
- Lets an identity provider create, update and remove members automatically.

**Use cases**

- An owner invites a colleague by email with role member and sees seats used go up.
- An admin creates a workspace API key with the audit.read scope to export the audit trail from a script.
- An identity provider calls /api/scim/v2/Users to provision a new hire.
- An owner at the seat limit is told to free a seat or buy more.

## 2. User experience

**Where to find it**

- Web: Settings, Team section: cards 'Workspace details', 'Seats & billing' (Licensed, In use, Available, Premium seats, button 'Change seats' or 'Review contract'), 'Invite teammate', 'Pending invitations', 'Members' (apps/web/features/settings/sections/TeamSection.tsx:811-1330).
- Web workspace console: /workspace/people ('Members'), /workspace/identity ('Identity') and the workspace API keys panel (apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:54-67; apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx).
- Web admin console: /admin/directory-sync, page title 'Directory sync (SCIM 2.0)' with 'SCIM tokens' (apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:348, 506; apps/web/app/admin/directory-sync/page.tsx).
- Desktop, mobile, CLI, VS Code, Chrome: no seat, invitation or admin API screen found; mobile cloud billing and account screens reference settings routes but seat management was not read.

**Before you start**

- Team, Team Premium or Enterprise plan for team administration, because team_admin is granted to those plans (packages/contracts/types/src/billing-catalog.ts:362).
- Enterprise plan for SCIM, because enterprise_controls is granted to Enterprise only (packages/contracts/types/src/billing-catalog.ts:363; apps/web/lib/server/scim/scim-auth.ts:112-120).
- Workspace permission members.manage to invite (apps/web/app/api/settings/team/invitations/route.ts:39-56).
- A recent re-authentication (step-up) to create a workspace API key (apps/web/app/api/settings/organization/admin-api-keys/route.ts:72).

**Screens and controls**

- Invite teammate: 'Invitee email' field, 'Invitation role' select (Member role, Viewer role, Admin role), button 'Create invitation', note 'Invitations expire after 7 days.' (apps/web/features/settings/sections/TeamSection.tsx:976-1033).
- Pending invitations: renew and revoke buttons per row (apps/web/features/settings/sections/TeamSection.tsx:1191-1204).
- Members: seat type control per member (apps/web/features/settings/sections/TeamSection.tsx:1325).
- Workspace API keys: name, expiry options 30 days, 90 days, 1 year, No expiry, scopes, 'Copy key', 'Revoke key' (apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:37-296).
- Directory sync page: provider list including 'Generic SCIM 2.0', directory ID, token create and revoke (apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:69, 477, 546).

**Journey**

1. Admin opens Settings, Team; the page loads invitations and seats from GET /api/settings/team/invitations (apps/web/features/settings/hooks/use-settings-queries.ts:1126-1141).
2. Admin types an email, picks a role, presses 'Create invitation'.
3. Server checks team admin plan, membership and members.manage, checks the role is not above the actor's, creates the invitation and sends the email (apps/web/app/api/settings/team/invitations/route.ts:93-135).
4. The page shows a private invitation link and a 'Copy link' button when delivery needs it (apps/web/features/settings/sections/TeamSection.tsx:1081-1101).
5. Invitee accepts; seats used goes up. If no seat is free the database refuses and the person is told to free a seat or buy more (apps/web/lib/services/organization-seat-service.ts:100-125).
6. For automation: owner creates a workspace API key, copies it once, and the script calls the allowed routes with Authorization: Bearer (apps/web/lib/server/compliance-caller.ts:48-85).

**What the person sees and gets**

- Seat card numbers Licensed, In use, Available (apps/web/features/settings/sections/TeamSection.tsx:886-905).
- Refusal text 'This organization has no licensed seats available. Free a seat by removing a member or revoking a pending invitation, or purchase more seats.' (apps/web/lib/services/organization-seat-service.ts:100-107).
- API errors for keys: 'This workspace API key is invalid, expired or revoked.' and 'Workspace API keys require an active Team or Enterprise subscription.' (apps/web/lib/server/compliance-caller.ts:56-67).
- SCIM errors are SCIM-format errors with a detail string (apps/web/lib/server/scim/scim-auth.ts:42-60).

**Settings**

- Workspace policy and IP allow list for service principals (apps/web/lib/server/compliance-caller.ts:70).
- Key lifetime up to 365 days (apps/web/app/api/settings/organization/admin-api-keys/route.ts:35).
- Invitation lifetime 7 days (apps/web/lib/services/organization-invitation-service.ts:16).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Seat state read, seat ceiling mapped to a 409 conflict (apps/web/lib/services/organization-seat-service.ts:30-125).
- Database trigger and check keep seats_consumed within licensed_seats (apps/web/db/neon/0085_organization_seats_lifecycle.sql).
- Stripe seat sync, including refusal of Enterprise seat expansion while billing collection blocks new commitments, and Premium seat demotion (apps/web/app/api/stripe-webhook/lib/seats.ts:60-200).
- Invitation list (expires pending ones first, returns seat state) and create with audit event member_invited (apps/web/app/api/settings/team/invitations/route.ts:60-160).
- Workspace API keys with scopes bounded by creator permissions, step-up, audit events admin_api_key_created and admin_api_key_revoked (apps/web/lib/server/admin-api-keys.ts:108-128; apps/web/app/api/settings/organization/admin-api-keys/route.ts).
- Service-principal resolution with plan check, IP allow list and scope check (apps/web/lib/server/compliance-caller.ts:36-85).
- A route-access table says which routes accept service principals: audit, audit export, legal-hold export, members, invitations, usage-report, service-principals list (apps/web/lib/server/service-principals/route-access.ts:26-114).
- SCIM routes Users, Groups, ServiceProviderConfig, ResourceTypes, Schemas with token check, workspace lockdown check, active connection check, issuer-still-admin check and Enterprise entitlement check (apps/web/lib/server/scim/scim-auth.ts:30-130; apps/web/app/api/scim/v2).

**Incomplete**

- The brief line for compliance-caller (36) and SCIM lockdown (30-55) are correct in substance, but the draft omitted that SCIM needs the Enterprise plan while the admin API needs Team or Enterprise (apps/web/lib/server/scim/scim-auth.ts:112-120; apps/web/lib/server/compliance-caller.ts:60-67).

**Present but disconnected or switched off**

- Tenant lockdown flag turns SCIM off for a workspace (apps/web/lib/server/scim/scim-auth.ts:48-58).

**Not available**

- Seat or invitation screens on desktop, mobile, CLI, VS Code, Chrome: none found.
- Admin API access to usage analytics: usage-analytics and its export are not in the service-principal access table, only usage-report is (apps/web/lib/server/service-principals/route-access.ts:96-100).

## 4. Required behaviour

**Established requirements**

- A seat/license service tracks purchased seats, assigns them to members and enforces the count. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.21)
- Organization admins can manage their workspace programmatically through an authenticated, scoped administrative API. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.26)
- Invitations list and create require team admin access; list expires pending invites and returns seat state. (source: apps/web/app/api/settings/team/invitations/route.ts:60-80)
- A destructive or irreversible action asks first and names the consequence. (source: AGENTS.md section 9)
- Every subscription capability connects to one AGI Subscription system. (source: task product context)

**Acceptance criteria**

1. An admin on a Team plan can create an invitation; a member without members.manage is refused.
2. When seats used equals seats licensed, a new invitation or acceptance is refused with the 'no licensed seats available' message.
3. The invitation list marks expired invitations before returning and includes licensed, used and available seats.
4. A workspace API key for a workspace that lost its Team entitlement is refused with 'require an active Team or Enterprise subscription'.
5. A key scoped only for one permission is refused on a route needing another.
6. A request with a bearer token that is not a workspace key is refused and never falls back to the cookie session.
7. A SCIM request with a bad token gets 401; for a locked-down workspace gets 403 and a sync.denied event; on a non-Enterprise plan is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Seats consumed count active members plus pending invitations, because accepting an invitation must release its seat before taking one (apps/web/db/neon/0085_organization_seats_lifecycle.sql:36-45).
- [inferred] The same permission model applies to people and keys, because routes declare one permission per route (apps/web/lib/server/service-principals/caller.ts:36-60).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show seats and invitations in the desktop and mobile apps as a link to the web page.
- [proposed] Allow usage analytics export for workspace keys with billing.read scope.
- [proposed] Document the SCIM Enterprise-only rule beside the Team plan page.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | organization-seat-service | `apps/web/lib/services/organization-seat-service.ts` | Seat state, ceiling error mapping. |
| schema | seats lifecycle migration | `apps/web/db/neon/0085_organization_seats_lifecycle.sql` | licensed_seats, seats_consumed triggers and check. |
| event | persistPurchasedSeatsOnOrganization | `apps/web/app/api/stripe-webhook/lib/seats.ts` | Writes paid seats from Stripe onto the organization. |
| endpoint | /api/settings/team/invitations | `apps/web/app/api/settings/team/invitations/route.ts` | List and create invitations. |
| service | organization-invitation-service | `apps/web/lib/services/organization-invitation-service.ts` | Create, expire, renew, revoke, accept, decline. |
| service | team-admin-access | `apps/web/app/api/settings/team/team-admin-access.ts` | Plan check for team administration and seat numbers. |
| screen | TeamSection | `apps/web/features/settings/sections/TeamSection.tsx` | Team settings screen. |
| endpoint | /api/settings/organization/admin-api-keys | `apps/web/app/api/settings/organization/admin-api-keys/route.ts` | Create, list, revoke workspace API keys. |
| service | admin-api-keys | `apps/web/lib/server/admin-api-keys.ts` | Key generation, hashing, scope bounding, verification. |
| service | service-principal | `apps/web/lib/server/service-principal.ts` | Principal identity and scope assertion. |
| service | compliance-caller | `apps/web/lib/server/compliance-caller.ts` | Resolves a member or key caller with plan, IP list and scope. |
| config | route-access table | `apps/web/lib/server/service-principals/route-access.ts` | Which routes accept service principals. |
| service | workspace api caller | `apps/web/lib/server/service-principals/caller.ts` | General workspace caller resolver. |
| component | WorkspaceApiKeys | `apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx` | Key management UI. |
| table | organization admin API keys | `apps/web/db/neon/0206_organization_admin_api_keys.sql` | Stores key hashes, scopes, expiry. |
| service | scim-auth | `apps/web/lib/server/scim/scim-auth.ts` | SCIM token, lockdown, connection, issuer, plan checks. |
| service | scim-provisioning-service | `apps/web/lib/server/scim/scim-provisioning-service.ts` | Provisioning and sync events with audit. |
| endpoint | /api/scim/v2/* | `apps/web/app/api/scim/v2/Users/route.ts` | SCIM Users, Groups and discovery endpoints. |
| screen | DirectorySyncAdminPage | `apps/web/features/admin/pages/DirectorySyncAdminPage.tsx` | Connections and SCIM tokens UI. |
| hook | use-settings-queries invitations | `apps/web/features/settings/hooks/use-settings-queries.ts` | Loads invitations and seats. |
| endpoint | /api/settings/organization/invitations | `apps/web/app/api/settings/organization/invitations/route.ts` | Workspace-key reachable invitations. |
| table | organizations seat columns | `apps/web/db/neon/0085_organization_seats_lifecycle.sql` | licensed_seats, seats_consumed, owner_user_id. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin loads Team settings; server expires old invitations and returns invitations plus seats. | our servers | apps/web/app/api/settings/team/invitations/route.ts:60-90 |
| Admin creates an invitation; server checks plan, membership, permission and role ceiling, writes the row and emails the invite. | our servers | apps/web/app/api/settings/team/invitations/route.ts:93-160 |
| Database triggers change seats_consumed; a check refuses going over licensed_seats. | our servers | apps/web/db/neon/0085_organization_seats_lifecycle.sql:24-60 |
| Stripe sends subscription events; the webhook writes licensed seats onto the organization. | outside service | apps/web/app/api/stripe-webhook/lib/seats.ts:90-200 |
| A script calls an allowed route with a workspace key; the server verifies the key hash, plan, IP list and scope. | our servers | apps/web/lib/server/compliance-caller.ts:48-85 |
| The identity provider calls SCIM with a bearer token; the server verifies token, lockdown, connection, issuer and plan, then provisions. | our servers | apps/web/lib/server/scim/scim-auth.ts:30-130 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Licensed and consumed seats | table public.organizations | Server only | Kept with the organization |
| Invitations (token hash, role, expiry) | organization invitations table (see apps/web/lib/services/organization-invitation-service.ts) | Server only | Pending invitations expire after 7 days; later retention unknown |
| Workspace API keys (hash, prefix, scopes, expiry, last used) | admin API key table from apps/web/db/neon/0206_organization_admin_api_keys.sql | Server only | Revoked keys stay marked revoked |
| SCIM tokens, connections and sync events | directory sync tables (apps/web/lib/server/scim) | Server only | Deleting a connection deletes its tokens and mappings (apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:447) |
| Audit events for invites and keys | security_audit_logs and enterprise_audit_events | Server only | See F100-12 |

**Models and providers.** No model or inference provider takes part. Stripe is the outside source of paid seat counts; the identity provider is the outside caller for SCIM.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in member of the workspace for the UI; a workspace key or SCIM token for machines (apps/web/lib/server/compliance-caller.ts:36-85). |
| Permissions | members.manage to invite (apps/web/app/api/settings/team/invitations/route.ts:48-55); identity.manage to manage keys (apps/web/app/api/settings/organization/admin-api-keys/route.ts:39); a key cannot carry a permission its creator lacks (apps/web/lib/server/admin-api-keys.ts:108-128). |
| Subscription | Team, Team Premium or Enterprise for team_admin; Enterprise for SCIM (packages/contracts/types/src/billing-catalog.ts:362-363). |
| Limits and metering | Seats limited by licensed_seats; invitations expire after 7 days; keys last at most 365 days; routes use named rate limits such as settings-team-invitations-write (apps/web/app/api/settings/team/invitations/route.ts:95). |
| Feature flags | Tenant lockdown flag stops SCIM (apps/web/lib/feature-flags/tenant-lockdown.ts via apps/web/lib/server/scim/scim-auth.ts:11). |
| Model compatibility | none found in the code |
| Provider restrictions | Stripe required for purchased seats; Clerk is used for identity (SYS-authentication-and-identity). |
| Local mode | Not applicable: seats, invitations and keys are server-side workspace features. No Local-mode behaviour found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No seat free | 409 conflict with guidance to free a seat or buy more. | apps/web/lib/services/organization-seat-service.ts:100-107 |
| Owner removal | 409 asking to transfer ownership first. | apps/web/lib/services/organization-seat-service.ts:108-113 |
| Seat reduction below used | A reduction message tells how many members or invitations to remove. | apps/web/lib/services/organization-seat-service.ts:123-131 |
| Enterprise seat expansion while collection blocked | Refused, logged and audited as plan_changed warning. | apps/web/app/api/stripe-webhook/lib/seats.ts:60-95 |
| Premium seats fall below assigned | Latest assignments return to Standard and keep Premium to period end. | apps/web/app/api/stripe-webhook/lib/seats.ts:115-160 |
| Bearer token present but not a workspace key | 401, no fallback to cookie. | apps/web/lib/server/compliance-caller.ts:44-52 |
| SCIM issuer left admin role | 403 'Mint a new token'. | apps/web/lib/server/scim/scim-auth.ts:92-108 |
| Loading, retry, offline on Team settings | not handled in the code beyond standard query states (not read in detail) | apps/web/features/settings/sections/TeamSection.tsx |
| Outcome unconfirmed after workspace action | Dialog 'Workspace outcome unconfirmed' with reload. | apps/web/features/settings/sections/TeamSection.tsx:327-380 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/organization-seat-service.test.ts`: Seat state and error mapping.
- `apps/web/db/neon/organization-seats-lifecycle-migration.test.ts`: Seat migration shape.
- `apps/web/app/api/stripe-webhook/lib/__tests__/seats.test.ts`: Seat sync from Stripe.
- `apps/web/app/api/stripe-webhook/lib/__tests__/premium-seats.test.ts`: Premium seat counts.
- `apps/web/app/api/stripe-webhook/lib/__tests__/seat-persistence.test.ts`: Seat persistence outcomes.
- `apps/web/lib/server/__tests__/compliance-caller.test.ts`: Key auth, scope, disabled principal, revoked key, no cookie fallback, lost entitlement.
- `apps/web/lib/server/scim/__tests__/scim-auth.test.ts`: SCIM token and plan checks.
- `apps/web/app/api/scim/v2/__tests__/scim-every-handler-gated.test.ts`: Every SCIM handler refuses without an entitled token.
- `apps/web/app/api/scim/v2/__tests__/scim-routes.test.ts`: SCIM route behaviour.
- `apps/web/features/settings/sections/TeamSection.test.tsx`: Team settings screen.
- `apps/web/app/api/settings/organization/admin-api-keys/__tests__`: Admin key route (files in folder not opened).

**Test scenarios**

- **Seat ceiling**
  1. On a Team workspace with all seats used, create an invitation and have it accepted.
  - Expected: Refused with the 'no licensed seats available' message; seats used unchanged.
- **Scoped key**
  1. Create a key with only audit.read; call the audit export route; call the members route.
  - Expected: Audit export succeeds; members route refused naming the missing scope.
- **Lost entitlement**
  1. Cancel the Team plan; call any workspace route with the key.
  - Expected: 403 'require an active Team or Enterprise subscription'.
- **SCIM lockdown**
  1. Turn on tenant lockdown for a workspace; call SCIM Users with a valid token.
  - Expected: 403 locked-down message and a sync.denied event.
- **Concurrent last seat**
  1. Two admins accept the last two invitations at the same moment on a one-seat-left workspace.
  - Expected: One succeeds, one gets the seat conflict.

**Where to look when it fails**

- Log 'Organization invitation created' (apps/web/app/api/settings/team/invitations/route.ts:130).
- Log 'Refusing enterprise seat expansion while billing collection blocks new commitments' (apps/web/app/api/stripe-webhook/lib/seats.ts).
- Table directory sync events via recordSyncEvent (apps/web/lib/server/scim/scim-provisioning-service.ts:311).
- Audit types member_invited, admin_api_key_created, admin_api_key_revoked.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No seat, invitation or admin management in desktop, mobile, CLI, VS Code or Chrome.** Affects: All non-web apps.. Evidence: No client code found for settings/team routes except mobile references not read.. Work needed: Decide hand-off to web or native screens.
- **Usage analytics and its export cannot be reached with a workspace key.** Affects: Admin automation.. Evidence: apps/web/lib/server/service-principals/route-access.ts lists usage-report but not usage-analytics.. Work needed: Add route access declarations if wanted.
- **Two invitation routes exist (team and organization).** Affects: Web maintainers.. Evidence: apps/web/app/api/settings/team/invitations/route.ts and apps/web/app/api/settings/organization/invitations/route.ts.. Work needed: Confirm why both exist and share logic.
- **Seat service has no single 'assign a seat' step; seats follow membership by trigger.** Affects: Brief wording 'assigns them to members'.. Evidence: apps/web/db/neon/0085_organization_seats_lifecycle.sql. Work needed: Clarify the wording or the model.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-api-and-contracts
- surface:web
- mode:cloud
- plan:team
- plan:enterprise
- table:organizations
- F100-12

## Unknown

- Invitation table name and its retention.
- Whether mobile or desktop screens manage seats (mobile cloud-billing and cloud-account files reference settings routes but were not read).
- Exact SCIM token and connection table names.
- Whether the admin-api-keys route tests cover scope refusal.
