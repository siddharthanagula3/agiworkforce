# Teams & Enterprise — Control Plane Plan

Status: Active
Owner: Enterprise/platform lead
Last updated: 2026-08-22

Companion read: `AGENTS.md`, `docs/current/source-of-truth.md`,
`docs/agent-context/known-flaws.md`, `PLAN.md`.

This plan governs Teams and Enterprise work only. Every status below is cited to
a migration, route, or file in the working tree at commit `0d4e6986a`. Where the
tree does not prove a capability, it is marked ABSENT rather than assumed.

## Status Vocabulary

A binary done/not-done audit hides the dominant failure mode in this area, so
four states are used:

| State   | Meaning                                                      |
| ------- | ------------------------------------------------------------ |
| SHIPPED | Wired through every layer and observable in a real request.  |
| PARTIAL | Path exists but stops short of the user, or of the last hop. |
| INERT   | Table, policy, or contract exists with zero consumers.       |
| ABSENT  | Not begun.                                                   |

## Inventory

### SHIPPED

- **Tenant model** — `organizations` + `organization_members`, roles
  owner/admin/member/viewer (`0015`). Legacy `teams`/`team_members` dropped in
  `0058`; "Team" is a plan name, the tenant entity is an organization.
- **Tenant isolation** — `current_app_org_id()`, `app_row_is_visible`,
  `app_row_is_writable` across twelve content roots (`0073`), tightened by
  `0110` so Personal and each workspace are mutually exclusive scopes. Fails
  closed when the org GUC is unset; tenancy cannot be forged on write.
- **Active workspace scope** — `lib/services/active-workspace-service.ts`,
  persisted in `user_settings.workspace.activeOrganizationId`, overridable per
  request by `x-agi-organization-id` (`MANAGED_CLOUD_ORGANIZATION_HEADER`) after
  a membership check. Switchers on Web (`features/workspaces/components/
WorkspaceMenuItems.tsx`), Desktop (`features/v3/WorkspaceSwitcher.tsx`), and
  Mobile (`app/(app)/settings/workspace.tsx`).
- **Member lifecycle** — invite, accept, resend, revoke, role change, ownership
  transfer, leave under `/api/settings/team/*` and
  `/api/settings/organization/*`. Last-owner protection enforced. Invite tokens
  hashed with expiry (`0085`).
- **Seat accounting** — `licensed_seats` / `seats_consumed` (`0085`), written
  only by `app/api/stripe-webhook/lib/seats.ts`, which refuses to lower the
  count below occupied seats. `/api/settings/organization/seats` reports
  `seatsWritable: false` honestly.
- **Enterprise SSO** — SAML 2.0 and OIDC via Clerk enterprise connections with
  DNS TXT domain verification and SP metadata display (`0076`, `0083`, `0092`,
  `lib/server/sso/*`, `/api/admin/sso`). Owner-only writes, gated on
  `enterprise_controls`.
- **SCIM 2.0** — Users, Groups, ResourceTypes, Schemas, ServiceProviderConfig,
  scoped tokens, directory-sync event log (`0084`, `/api/scim/v2/*`).
- **Sharing grants** — `organization_shared_projects`,
  `organization_project_access`, `organization_shared_connectors` (`0086`,
  read/write split fixed in `0090`). Sharing predicates are deliberately kept
  textually separate from the governance predicate. Wired into
  `/api/projects` and `/api/projects/[id]` via `resolveSharedProjectScope`.
- **Append-only audit write** — `0087` revokes direct INSERT from `app_rls` and
  routes writes through a SECURITY DEFINER function.
- **Usage ledger table** — `organization_usage_ledger` with privacy mode,
  provider, model, tokens, provider cost, charged amount, and gross margin.

### PARTIAL

- **Shared projects are invisible in-product** — `/api/projects/route.ts:52`
  computes `is_org_shared` and `lib/projects.ts:138` maps it onto the type; no
  projects UI renders it. A member cannot see that a project is shared, who owns
  it, or whether their grant is read or write.
- **Shared projects do not share conversations** — the project conversation
  count is scoped `c.user_id = $1` (`/api/projects/route.ts`), so members of one
  shared project see disjoint conversation sets.
- **Invitations have no delivery** — `/api/settings/team/invitations/route.ts`
  returns a copyable link and discloses that no transactional email provider is
  configured.
- **Self-serve Team checkout** — seat selector, per-seat pricing, and checkout
  body are catalog-derived and working; live Stripe Team Price IDs do not exist
  (`FoundersAssistance.md` item 5). Human action, not a code gap.
- **Administration is a settings section** — `features/settings/sections/
TeamSection.tsx` (1093 lines) plus `OrganizationSharingSection.tsx` (446).
  `/admin` is the internal operator console gated on Clerk `publicMetadata`.

### INERT

- ~~**`organization_admin_policies` has zero consumers.**~~ **FIXED
  2026-08-22 (Wave 1).** Read and written by
  `/api/settings/organization/policy`, edited in `WorkspacePolicySection`, and
  enforced on all seven managed-compute routes through
  `buildOrganizationPolicyGateResponse`. Three fields are recorded but not yet
  enforced — see ORGPOLICY-03 in `known-flaws.md`.
- ~~**The admin console renders a constant as configuration.**~~ **FIXED
  2026-08-22 (Wave 1).** The readiness row and both policy tiles in
  `AdminConsolePage` now say explicitly that they show the shipped default a
  workspace receives on its first save, not a live setting, and point to where
  a workspace owner sets its own.
- **`enterprise_audit_events` is write-only in practice.** RLS grants
  owner/admin SELECT and no route exposes it. Writes DO reach it: any
  `recordAuditEvent` call carrying an `organizationId` goes through the
  `0087` SECURITY DEFINER writer, and policy changes now do. The missing half is
  read and export — Wave 3. `0087`'s stale reference to the removed
  `services/api-gateway` reader was corrected on 2026-08-22.
- **`organization_usage_ledger` has NO WRITER, and is not the usage table.**
  Only `lib/server/account-erasure.ts` and `lib/billing/financial-record-retention.ts`
  reference it; nothing inserts. A dashboard built on it would report zero
  forever while looking authoritative. Workspace usage analytics
  (`/workspace/usage`, 2026-08-23) therefore reads `managed_usage_requests`,
  which is where a managed turn actually lands. Either give the ledger a writer
  or drop it — do not build a second read path on it.
- **Two designed contracts with no implementation** — `ConnectorPolicy` and
  `AuditExportRequest` in `packages/contracts/types/src/enterprise/index.ts` are
  referenced nowhere else in the tree. `AdminPolicy` (Wave 1),
  `RetentionPolicy`'s conversation window (0138), and `ProviderPolicy`'s
  substance (0139, as `organization_model_policies`) are now implemented. The
  remaining two belong to Waves 3 and 4.
- **Directory groups drive only a role.** `scim_groups` / `scim_group_members`
  map to an org role via `/api/admin/directory-sync/groups`. No sharing grant,
  policy scope, or budget is addressable by group.

### ABSENT

- ~~Customer-facing admin console.~~ **SHIPPED 2026-08-23 (Wave 2)** at
  `/workspace`. See CONSOLE-01 for what is still unverified.
- SSO sign-in affordance, org-level SSO enforcement, break-glass path.
  `/login/page.tsx` mounts a bare Clerk `<SignIn>`.
- Session and device-token revocation on deprovision.
- ~~Legal hold.~~ **SHIPPED 2026-08-23 (Wave 3).** `legal_holds` (0138),
  placed and released at `/workspace/data`, suspends retention for its subject.
- ~~Retention enforcement. `retention_days` is stored and never read.~~
  **SHIPPED 2026-08-23 (Wave 3).** Opt-in per workspace via
  `retention_enforced`; nightly sweep at
  `/api/cron/enforce-workspace-retention`; fails closed when holds cannot be
  read. See RETENTION-01 for what is still unproven.
- Compliance/audit export and SIEM streaming.
- Admin adoption, value, and cost reporting.
- IP allowlist, tenant restrictions, managed device policy (MDM/plist/registry).
- Sharing of prompts, skills, agents, artifacts, or files outside a project.
- CLI workspace awareness (one mention in `apps/cli/src/oauth.rs`). VS Code and
  Chrome carry account plumbing but no workspace scope selection.

## Architecture: One Policy Plane, Three Rings

The database enforces tenancy (who owns a row). The application enforces
authorization (who may call a route). The missing layer is where an
administrator's decision becomes a runtime obligation.

**Governing rule: an org-governed decision is made in exactly one evaluator,
which reads the policy row, returns allow or deny with obligations, and writes
one audit event. No feature implements its own policy check.**

```
RING 1  identity and scope    SSO/Clerk -> active workspace (membership checked)
                              -> SCIM groups (role + entitlement) -> seats/plan
                                            |
RING 2  policy decision       evaluate(org, principal, resource, action)
        point  [TO BUILD]       -> allow | deny + obligations           -> audit event
                              privacy mode, sync surface, connector,      (append only)
                              model, retention, export, agent action
                                            |
RING 3  row-level security    app_row_is_visible, app_org_resource_is_readable,
        [BUILT]               grant rows. Fails closed when scope is unset.
```

This buys resource-level rather than tool-level authorization: a denied
connector stays denied whether the call arrives from chat, an MCP tool, a
scheduled task, a cloud agent run, or the CLI, because all of them ask the same
evaluator. That property is the difference between an enterprise control and a
client-side preference, and Critical Rules forbid labelling the second as the
first.

It is also the locked differentiator. Both reference products govern only their
own hosted inference. The tenancy work already landed is what lets one
administrative policy cover on-device Local, BYOK, and Managed Cloud. Building
the console before the evaluator would produce settings that render and decide
nothing.

## Waves

Dependency-ordered; each wave is unsafe to start before the one above it lands.
Each runs as a workflow of four to five agents. Waves 1–3 are load-bearing;
4–7 parallelize once the plane exists.

### Wave 1 — Make the policy plane real (keystone) — LANDED 2026-08-22

Shipped in this pass. Open gaps are ORGPOLICY-01/02/03 in
`docs/agent-context/known-flaws.md`; read those before extending this wave.

- `lib/services/organization-policy-evaluator.ts` — pure, total evaluator.
- `lib/services/organization-policy-service.ts` — read, effective-read, whole-row
  upsert, and field diff.
- `lib/services/organization-policy-gate.ts` — scope resolution; answers
  `unscoped` for personal scope, for an org with no saved policy, and for a
  policy read that fails.
- `GET`/`PATCH /api/settings/organization/policy` — owner/admin gated, CSRF and
  rate limited, Zod validated, coherence-checked against the table's own CHECK
  constraints, and audited on every write.
- `features/settings/sections/WorkspacePolicySection.tsx`, mounted in the Team
  settings section.
- `buildOrganizationPolicyGateResponse` wired into all seven managed-compute
  routes: chat completions, approve, embeddings, transcriptions, image, video,
  provider probe.
- 94 tests across evaluator, gate, gate response, and route.

Original scope, for reference:

- Policy service and evaluator: `evaluate(org, principal, resource, action)`
  returning allow/deny with obligations; deny-by-default when no policy row
  exists.
- `GET` / `PATCH /api/settings/organization/policy`, owner/admin gated, CSRF and
  rate limited, Zod-validated against the existing `AdminPolicy` contract.
- Enforcement at four call sites: privacy-mode selection, managed-compute
  admission (`lib/managed-compute-gate.ts`), chat-sync surface gating, and the
  local-to-BYOK preview requirement.
- Implement `ProviderPolicy` and `ConnectorPolicy` against the evaluator.
- Replace the constant rendered as configuration in `AdminConsolePage` with the
  real row or an explicit "not configured".

**Exit:** setting `allow_managed_compute = false` blocks a member's managed turn
in an observed network request, and the denial lands in
`enterprise_audit_events`. Not a passing typecheck — a watched request.

**Exit status: NOT met.** Every layer is unit-tested and the deny path returns a
403 with a stable code, but no turn has been observed being denied against a
live Neon organization. Tracked as ORGPOLICY-01. This is the first thing to do
when a seeded workspace is available.

### Wave 2 — Workspace admin console — LANDED 2026-08-23

Shipped in this pass at `/workspace`, kept deliberately distinct from `/admin`
(the platform operator console, gated on Clerk `publicMetadata` that no customer
holds). Seven routes: Overview, Members, Identity, Policy, Sharing, Audit,
Billing.

- `app/workspace/layout.tsx` — resolves role server-side and renders one of
  three named states rather than an empty frame: personal scope, non-admin
  denial, and membership-read failure, which is deliberately NOT collapsed into
  the personal-scope state (that would tell an administrator their organization
  had vanished).
- `lib/services/workspace-posture-service.ts` — reads the live configuration of
  one workspace across identity, provisioning, access, AI controls, data, and
  audit. Every signal carries an `enforcement` field of `enforced` /
  `stated` / `unconfigured`, so a recorded value can never wear the same badge
  as a runtime control. `retentionDays` and per-surface sync are `stated`;
  managed compute and privacy modes are `enforced`.
- `GET /api/settings/organization/posture` — owner/admin gated, rate limited,
  entitlement checked. The posture enumerates how a workspace authenticates and
  shares, so the role check is a real gate rather than a UI hint.
- `features/workspace-console/` — nav, shell, posture dashboard, identity
  panels, billing summary.
- Settings keeps a pointer, not a duplicate: the Team panel used to stack
  `TeamSection` + policy + sharing + audit (~78KB of admin UI behind one scroll
  with no addressable sections). Policy, sharing, and audit moved to the
  console; membership stays in settings because a plain member legitimately
  needs it.
- SSO and directory-sync administration moved from operator-gated `/admin` to
  the customer console. Their APIs were always org-scoped and
  `enterprise_controls`-gated, so this moves the UI to the population the
  authorization was already written for.
- 52 unit tests plus a four-case Playwright suite.

**Exit:** an owner completes every administrative task from one place; a member
hitting the same route sees a correct denial, not a broken page.

**Exit status: PARTIALLY met.** Verified in a real browser against a live Clerk
session (`e2e/workspace-console.spec.ts`, 4/4 passing): all seven routes render
a named state, an anonymous visitor is gated with the destination preserved, the
posture API returns 403 to a caller who administers nothing, and the reachable
page carries zero serious or critical axe violations. NOT verified: the console
as an actual workspace owner. The QA account is on `max_15x`, which correctly
refuses workspace creation with `SUBSCRIPTION_REQUIRED`, so the posture
dashboard has never been rendered against a real organization. Tracked as
CONSOLE-01 in `known-flaws.md`.

**Local verification prerequisite, recorded because it silently blocked this for
weeks:** server-side `auth()` verifies the session's authorized party against
`CLERK_AUTHORIZED_PARTIES`, which falls back to `NEXT_PUBLIC_APP_URL`'s origin
(`lib/clerk-authorized-parties.ts`). Against a localhost dev server that
fallback is the production origin, so EVERY protected page redirects to sign-in
no matter how valid the browser session is — which reads exactly like broken
auth. Start the dev server with `CLERK_AUTHORIZED_PARTIES=http://localhost:3000`
to render any authenticated page locally.

### Wave 3 — Audit and compliance backbone (5 agents)

- Audit read API with actor, action, resource, outcome, severity, date filters
  and stable pagination.
- JSONL export implementing `AuditExportRequest`; SIEM streaming on the same
  envelope.
- Retention enforcement that reads `retention_days`; legal hold that suspends
  it.
- Unify `audit_logs` (via `lib/services/audit-service.ts`) and
  `enterprise_audit_events` onto one writer. Correct `0087`'s stale reference to
  the removed API gateway.

**Exit:** a privileged action is reconstructable from the export with actor,
resource, policy decision, and outcome; a held record survives a retention
sweep.

### Wave 3 — Audit and compliance backbone — PARTIALLY LANDED

- **Audit read API — LANDED 2026-08-23.** Keyset pagination over
  `(created_at DESC, id DESC)` with actor, action, resource, outcome, severity
  and date filters.
- **JSONL export — LANDED 2026-08-23.** Gated on the `audit_export` policy
  resource; every export and every refusal is written back to the trail.
- **Retention enforcement — LANDED 2026-08-23.** `0138` adds
  `retention_enforced` (opt-in, defaults false), `legal_holds`, and
  `organization_retention_sweeps`. `lib/services/retention-service.ts` sweeps
  from `updated_at`, excludes held subjects, and FAILS CLOSED when the hold set
  cannot be read. `/api/cron/enforce-workspace-retention` runs nightly at 04:20
  and accepts `?dryRun=1`. Administered at `/workspace/data`; the workspace
  posture badge follows the workspace's own opt-in rather than a constant.
- **Legal hold — LANDED 2026-08-23.** Organization-wide or per-member, with
  release recorded at critical severity. Both tables are SELECT-only for the
  application role.
- **SIEM streaming — STILL ABSENT.** Pull the JSONL export on a schedule until
  a webhook or log drain exists.
- **One writer for `audit_logs` and `enterprise_audit_events` — STILL OPEN.**

**Exit:** a privileged action is reconstructable from the export with actor,
resource, policy decision, and outcome; a held record survives a retention
sweep.

**Exit status: half met.** The first clause holds and is verified. The second is
unit-tested across 24 tests but has never been observed against a live database
— tracked as RETENTION-01. Do not describe retention as proven to a customer
until a dry run has been watched against a seeded workspace.

### Wave 4 — Sharing that reads as sharing (5 agents)

- Render shared state in the projects UI: badge, owner, access level, working
  read-only mode for `read` grants.
- Shared project conversations, opt-in per project.
- Shared knowledge files surfaced with provenance; the owner-only write rule
  made visible rather than silent.
- Extend sharing to prompts, skills, and artifacts through the same grant-row
  pattern — never a flag on the content row.
- Group-addressable grants, giving `scim_groups` product meaning.

**Exit:** a member opens a shared project and can see whose it is, what they may
do in it, and the team's conversations; a `read` grant visibly cannot write.

### Wave 5 — Identity lifecycle, login to offboarding (4 agents)

- "Sign in with SSO" with domain routing, org-level SSO enforcement, documented
  break-glass.
- Deprovision fans out to session and device-token revocation across all six
  surfaces.
- Invitation email delivery, retiring the copy-the-link fallback.
- Live verification against a real Clerk instance — the open blocker recorded
  2026-08-04 in `known-flaws.md`.

**Exit:** deactivating a user at the IdP removes access from Web, Desktop,
Mobile, CLI, VS Code, and Chrome within the stated window.

### Wave 6 — Cost, seats, and roles (4 agents)

- Admin usage and cost analytics from `organization_usage_ledger`, by member,
  project, model, connector.
- Workspace budgets, alerts, hard caps evaluated through the Wave 1 plane.
- Seat enforcement at invite and accept; reconciliation against Stripe.
- Custom roles and delegated administration above the four fixed roles.

**Exit:** a concurrent load test cannot exceed a hard workspace budget, and the
admin can attribute the spend that did occur.

### Wave 7 — Six-surface and network parity (5 agents)

- Workspace scope selection and policy obedience in CLI, VS Code, Chrome.
- IP allowlist and tenant restrictions.
- Managed device policy via MDM, plist, registry, with a fail-closed option.
- Corporate proxy, custom CA, and mTLS support across all six surfaces.

**Exit:** all six surfaces pass a corporate proxy and CA matrix, and an org
policy denial holds identically on every one.

## Parity Target

| Capability                    | Reference products         | Us today                        | Wave |
| ----------------------------- | -------------------------- | ------------------------------- | ---- |
| Dedicated workspace           | Both                       | SHIPPED                         | —    |
| Roles                         | Both, custom at Enterprise | SHIPPED, four fixed             | 6    |
| SSO (SAML/OIDC)               | Both                       | SHIPPED, unverified live        | 5    |
| Domain verification           | Both                       | SHIPPED                         | —    |
| SCIM provisioning             | Enterprise on both         | SHIPPED                         | —    |
| Deprovision revokes sessions  | Both                       | ABSENT                          | 5    |
| Shared projects               | Both                       | PARTIAL, invisible in UI        | 4    |
| Shared project conversations  | Both                       | ABSENT                          | 4    |
| Shared agents/skills/prompts  | Both                       | ABSENT                          | 4    |
| Admin model/provider policy   | Both                       | SHIPPED, enforced post-routing  | 1    |
| Admin connector policy        | Both                       | INERT, contract only            | 1, 4 |
| Central admin console         | Both                       | SHIPPED, unverified as owner    | 2    |
| Audit log read                | Both                       | SHIPPED, read + JSONL export    | 3    |
| Compliance export / SIEM      | Enterprise on both         | ABSENT                          | 3    |
| Custom retention + legal hold | Enterprise on both         | SHIPPED, opt-in, unrun live     | 3    |
| Usage and cost analytics      | Both                       | SHIPPED, read-only, no caps     | 6    |
| Central billing and seats     | Both                       | PARTIAL, live prices missing    | 6    |
| IP allowlist / device policy  | Enterprise on both         | ABSENT                          | 7    |
| External sharing control      | Both                       | SHIPPED, enforced on both paths | 3    |
| Policy across Local + BYOK    | Neither                    | ABSENT                          | 1    |
| Trust-transition governance   | Neither                    | PARTIAL, consent without policy | 1    |

## Blocked By Human

Both are recorded in `FoundersAssistance.md`; repeated here because they gate
wave exits.

1. **Stripe** — Wave 6 cannot complete self-serve Team checkout until the live
   Team product and Price IDs exist (`FoundersAssistance.md` item 5). Everything
   else in Wave 6 proceeds without it.
2. **Clerk** — Wave 5's live SSO verification needs a paid Clerk plan with
   enterprise connections enabled. Until then SSO stays
   implemented-but-unverified and must be described that way.
