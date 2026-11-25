---
id: "AREA-087"
type: "area"
title: "Enterprise administration screens"
features: ["F087-01", "F087-02", "F087-03", "F087-04", "F087-05", "F087-06", "F087-07", "F087-08", "F087-09", "F087-10", "F087-11", "F087-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 87. Enterprise administration screens

A workspace administrator uses this area to run a shared team workspace: see who is in it, invite and remove people, decide what they may use, sign them in through the company's identity provider, control where data is kept, and read the audit trail and spend. It matters because a company cannot adopt the product for staff without these controls, and each control has to be enforced on the server, not only shown on screen.

**Who uses it.** Workspace owners and admins use the console (apps/web/app/workspace/*). Owners are the only role that can transfer ownership. Members are affected but do not use the console: policy refusals reach them in chat requests, CLI runs and the extension. Developers and automations use the scoped admin API keys and service accounts (S87.12, S87.40). Platform operators, not workspace admins, use the support-access grant flow (S87.35). Plan gates apply: the code checks enterprise plan tiers for some controls (apps/web/lib/services/managed-compute-access.ts, apps/web/app/api/settings/organization/data-region/route.ts).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F087-01](F087-01-overview-and-policy-diagnostics.md) | Overview and policy diagnostics | built | built | built | no | n/a | n/a |
| [F087-02](F087-02-members-invitations-seats-and-ownership.md) | Members, invitations, seats and ownership | built | built | built | no | n/a | n/a |
| [F087-03](F087-03-roles-custom-roles-and-groups.md) | Roles, custom roles and groups | built | built | built | no | n/a | n/a |
| [F087-04](F087-04-sign-in-domains-and-directory-sync.md) | Sign-in, domains and directory sync | built | built | n/a | no | n/a | n/a |
| [F087-05](F087-05-service-accounts-and-admin-api-keys.md) | Service accounts and admin API keys | built | built | n/a | no | n/a | n/a |
| [F087-06](F087-06-model-feature-and-tool-access.md) | Model, feature and tool access | built | built | n/a | partly | n/a | n/a |
| [F087-07](F087-07-connectors-skills-and-private-marketplace.md) | Connectors, skills and private marketplace | built | built | n/a | partly | n/a | n/a |
| [F087-08](F087-08-sharing-publishing-and-memory.md) | Sharing, publishing and memory | built | built | n/a | no | n/a | n/a |
| [F087-09](F087-09-data-retention-region-keys-network-and-managed-cli.md) | Data retention, region, keys, network and managed client settings | partly | partly | no | partly | n/a | built |
| [F087-10](F087-10-audit-trail-and-exports.md) | Audit trail and exports | built | built | n/a | no | n/a | n/a |
| [F087-11](F087-11-usage-budgets-and-spend-limits.md) | Usage, budgets and spend limits | partly | partly | no | no | no | n/a |
| [F087-12](F087-12-billing-compliance-legal-holds-and-support-access.md) | Billing, compliance, legal holds and support access | partly | partly | no | no | no | n/a |

Requirement items for this area: [10-requirements/capabilities/087-enterprise-administration-screens.md](../../10-requirements/capabilities/087-enterprise-administration-screens.md).

## How this area works in the code

1. **Admin opens the console.** The workspace page renders the posture overview. The left navigation groups links as Workspace, People, Controls, Data and so on. Each link is a page under /workspace. (`apps/web/app/workspace/page.tsx:1-14`, `apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:1-80`)
2. **Page loads its data through an admin route.** Each console panel calls a settings API route. The posture route checks the rate limit, opens a user-scoped database connection, requires workspace membership, requires team admin access, and requires the audit.read permission. It then reads the posture and writes an admin data-access log row. (`apps/web/app/api/settings/organization/posture/route.ts:1-60`)
3. **Changing people: invite, change role, remove.** Invitations need the members.manage permission and a CSRF token on writes. Invitable roles are admin, member and viewer. Role changes accept owner, admin, member or viewer. Removing a member drops the membership, then deprovisions device tokens and API keys, and writes an audit event. (`apps/web/app/api/settings/team/invitations/route.ts:1-80`, `apps/web/app/api/settings/team/[memberId]/route.ts:1-70`)
4. **Saving a policy.** Admin saves are stored as an organization policy. The evaluator turns a question (for example managed compute, privacy mode, audit export, external sharing, MFA or spend cap) into an allow or refuse decision with a code and a reason. (`apps/web/lib/services/organization-policy-evaluator.ts:340-380`)
5. **Enforcement on a chat request.** The chat route first runs the product-wide kill switch, then asks the workspace policy gate. If the policy cannot be read, the request is denied. A denial returns a 403 response; an allowed request continues. (`apps/web/lib/managed-compute-gate.ts:60-110`, `apps/web/app/api/llm/v1/chat/completions/route.ts:433`)
6. **Spend budget check.** After the policy check passes, a managed request is checked against the monthly spend limit for the selected workspace and for the enterprise funding workspace, if there is one. (`apps/web/lib/services/managed-compute-access.ts:100-140`)
7. **Network allow list.** Bearer-token and API requests call the IP allow-list check. A request from outside the allowed ranges is refused, and the refusal is written to the audit trail. (`apps/web/lib/api-auth.ts:320-345`, `apps/web/lib/ip-allow-list-gate.ts:1-60`)
8. **Domain verification and sign-in.** The admin requests a challenge, publishes the TXT record, then calls verify. The DNS lookup compares each TXT value with the expected token and returns verified, token_mismatch or no_record. (`apps/web/app/api/admin/sso/verify-domain/route.ts:95-125`, `apps/web/lib/server/sso/domain-verification.ts:115-135`)
9. **Audit export and retention sweep.** An audit export is checked against the export policy, recorded before the file streams, and streamed in batches. A scheduled retention job deletes old conversations one organization at a time, skips held data, and writes a sweep audit event. (`apps/web/app/api/settings/organization/audit/export/route.ts:60-113`, `apps/web/app/api/cron/enforce-workspace-retention/route.ts:55-80`, `vercel.json:98`)
10. **CLI and extension read the same policy.** The CLI fetches the effective workspace policy about once an hour, caches it sealed in the OS credential store, and treats an old or unreadable cache as not allowed. The Chrome extension reads a managed site-policy file from browser managed storage. (`apps/cli/src/cloud/workspace_policy.rs:1-30`, `apps/extension/manifest.json:30-40`, `apps/extension/managed-schema.json:1-20`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx` | Groups the console links by the question an admin asks (Workspace, People, Controls, and so on). |
| `apps/web/lib/services/organization-policy-evaluator.ts` | Turns each policy question (managed compute, feature, privacy, audit export, spend cap, billing state) into allow or refuse with a code and reason. |
| `apps/web/lib/managed-compute-gate.ts` | Runs the product kill switch and then the workspace policy check for managed compute requests; denies when the policy cannot be read. |
| `apps/web/app/api/settings/team/invitations/route.ts` | Lists and creates invitations; requires members.manage and checks seat state. |
| `apps/web/app/api/settings/team/[memberId]/route.ts` | Changes a member's role, removes members, and deprovisions their device tokens and keys. |
| `apps/web/lib/server/sso/domain-verification.ts` | Checks the DNS TXT record for a claimed domain against the expected token. |
| `apps/web/app/api/settings/organization/audit/export/route.ts` | Checks the export policy, records the export, and streams the audit trail. |
| `apps/web/app/api/cron/enforce-workspace-retention/route.ts` | Scheduled sweep that deletes old workspace conversations, one organization at a time, and audits each sweep. |
| `apps/web/lib/services/managed-compute-access.ts` | Applies the workspace spend limit to managed compute, including the enterprise funding workspace. |
| `apps/web/lib/server/data-region.ts` | Reads each workspace's data region and whether the target region is provisioned. |
| `apps/cli/src/cloud/workspace_policy.rs` | CLI copy of the effective workspace policy: hourly refresh, sealed cache, fails closed when stale or unreadable. |
| `apps/web/app/api/settings/organization/posture/route.ts` | Admin-only read of the workspace security posture, with a data-access log row. |

## What is stored

- Workspace policy (governed flag, rules for features, privacy modes, audit export, external sharing, memory, IP ranges, model and connector allow lists): Organization policy rows read by the policy gate in the web database (apps/web/lib/services/organization-policy-gate.ts)
- Data region: current region, requested region and when it was requested: public.organizations columns data_region, data_region_requested, data_region_requested_at (apps/web/lib/server/data-region.ts:31-50)
- Domain verification token and verified time for each SSO connection: SSO connection rows: domain_verification_token and domain_verified_at (apps/web/lib/server/neon-types.ts:192; apps/web/lib/server/sso/connection-view.ts:23)
- Invitations and member roles: organization_members and invitation tables in the web database (apps/web/app/api/settings/team/invitations/route.ts)
- Audit trail rows, including denials, exports, IP refusals and retention sweeps: Audit event store written by recordAuditEvent (apps/web/lib/security-audit.ts, imported by the routes read)
- Support access grants and their append-only, hash-chained log: Database tables from apps/web/db/neon/0229_support_access_grants.sql, 0345 and 0403; service apps/web/lib/server/support-access-service.ts
- Legal holds and commercial agreement terms: Legal-hold routes (apps/web/app/api/settings/organization/legal-holds/route.ts) and apps/web/lib/services/enterprise-contracts/agreement-store.ts
- CLI effective policy cache, sealed with a seal value and fetched time: The user's OS credential store under service com.agiworkforce.cli.workspace-policy (apps/cli/src/cloud/workspace_policy.rs:25-30)
- Extension site policy (blocklist and allowlist of sites): Browser managed storage, schema in apps/extension/managed-schema.json

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Managed compute kill switch (product-wide)**: When off, every managed compute request is refused with a 403 and the message says to use Local or BYOK. (apps/web/lib/managed-compute-gate.ts (isManagedComputePrivateBetaEnabled check in buildManagedComputeGateResponse))
- **Workspace policy (governed flag and per-rule values)**: Turns feature, privacy, audit export, external sharing, memory and other rules on or off for the workspace. An absent policy means the workspace is not governed and everything is allowed. (apps/web/lib/services/organization-policy-evaluator.ts; route comment at apps/web/app/api/settings/organization/audit/export/route.ts)
- **Feature exceptions**: Lets one person or group keep a switched-off feature. (apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx (exceptions UI))
- **Monthly spend limit and alert threshold**: When spent, managed usage is refused (spend_cap_exceeded). Threshold sets the alert percent. (apps/web/app/api/settings/organization/spend-limit/route.ts; apps/web/lib/services/managed-compute-access.ts)
- **Enterprise plan tier check**: Some controls are offered only on enterprise plans. (apps/web/lib/services/managed-compute-access.ts (isEnterprisePlanTier import); apps/web/app/api/settings/organization/data-region/route.ts (canUseBillingPlanCapability))
- **Data region provisioning**: A region is usable only after its database, bucket, log sink and key are set up. A move to an unprovisioned region is refused with a conflict. (Environment variables AGI_DATA_REGION_EU_* read through resolveDataRegion in apps/web/lib/server/data-region.ts:20-25)
- **Retention sweep schedule and batch size**: Runs the retention job on a schedule and caps the number of organizations per run. (vercel.json:98 (schedule); MAX_ORGANIZATIONS_PER_RUN in apps/web/app/api/cron/enforce-workspace-retention/route.ts)
- **CLI policy refresh and cache age**: Refresh about hourly; a sealed cache older than 7 days needs a fresh read before it counts; clock skew tolerance 5 minutes. (apps/cli/src/cloud/workspace_policy.rs:17-24 (constants))
- **Extension managed site policy**: Blocks or allows sites for automation, upload and download; a document the schema rejects stops the extension acting on every site. (apps/extension/manifest.json (storage.managed_schema) and apps/extension/managed-schema.json)
- **Permission checks (members.manage, policy.manage, audit.read, admin.policy.manage)**: Decide which roles can change members, policy, spend limits, data region, and read the posture. (requireMemberPermission and requireWorkspaceConsolePermission calls in the route files listed above)

## Shared between apps

Shared across apps: the policy evaluator and gate (apps/web/lib/services/organization-policy-evaluator.ts, organization-policy-gate.ts) decide for web, desktop (through the hosted web and the desktop developer session service apps/desktop/electron/runtime/developerSessionService.ts) and the chat route. Shared packages imported by the files read: @agiworkforce/types (WORKSPACE_FEATURE_LABELS, policy types, plan tiers), @agiworkforce/compliance (data region resolution), @agiworkforce/cloud-contracts (managed cloud headers), @agiworkforce/ui (ChipInput and useUnsavedChangesGuard used by WorkspacePolicySection). Per AGENTS.md section 5, the public Desktop shows the hosted web app, so its console is the same code. Separate per app: mobile has its own team and administration code under apps/mobile/src/features/team/ and apps/mobile/app/(app)/settings/workspace.tsx; the CLI has its own policy cache and enforcement in apps/cli/src/cloud/workspace_policy.rs and apps/cli/src/features/hooks/managed.rs; the Chrome extension has its own managed site-policy store (apps/extension/src/features/site-policy/store.ts). The CLI and extension do not share the web console code.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says the Should for S87.35 is that a workspace administrator approves, denies, revokes or time-limits platform support access. The code has only operator-side grants: one operator requests, a second operator approves (approveSupportAccess refuses a self-approval). No workspace-admin approve or deny was found. The trust page describes the operator flow as implemented. (apps/web/lib/server/support-access-service.ts (approveSupportAccess, around lines 474-512); apps/web/app/api/admin/support-access/route.ts:30; apps/web/app/trust/page.tsx:244)
- Seat totals fall back to the plan's member maximum when the invitations response has no seat data, so the screen can show a seat count that the server did not return. (apps/web/features/settings/sections/TeamSection.tsx:433-435)
- Data region: a move to EU is refused until the EU variables are set, so the console can show a region choice that cannot be used yet. Status is partial on web and desktop. (apps/web/app/api/settings/organization/data-region/route.ts:148-160; apps/web/lib/server/data-region.ts:20-25)
- Group and per-user spend limits (S87.31, S87.32) have no code; the only spend limit is per workspace. (apps/web/app/api/settings/organization/spend-limit/route.ts:75-100 (single workspace limit))
- Brief lists the web and CLI feature-access item as done in web, but the web feature file it cites is a shared policy panel rather than a per-app enforcement path; enforcement on the web relies on the chat route gate. (apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:110; apps/web/app/api/llm/v1/chat/completions/route.ts:433)

## Not established

- Desktop: the brief marks many items done for desktop. I did not confirm that the desktop app shows exactly the same console; AGENTS.md section 5 says the public Desktop shows the hosted web app. I did not read apps/desktop screens.
- Mobile: the brief gives mobile status only for items S87.01, S87.02, S87.03, S87.05 and S87.08. The status of other items on mobile is not given.
- Invitation acceptance path (the invitee's accept step) was not read.
- Sign-in routing by verified domain: the just-in-time provisioning reads verified domains, but the sign-in redirect code was not opened.
- Custom roles and groups: I did not read the role-permission enforcement path that makes custom permissions take effect.
- Seat purchase and seat addition (S87.07 'seats can be added'): a seat_purchase decision exists in the evaluator, but the purchase path was not read.
- Support for external sharing (S87.20) and the share-link route (apps/web/app/api/share/route.ts) were cited in the brief but not opened, so their line numbers are from the brief.
- Memory policy (S87.22) enforcement in managed-memory-context-service was cited in the brief but not opened.
- Managed rollout and client update channels (S87.38): apps/desktop/electron/desktopCloudUpdate.ts exists, but I did not open it, and it is not an administrator control in anything I read.
- Line numbers: for most entries I give line ranges from the files I printed, and some are approximate; the brief's own line numbers were used only where I did not open the file.
- The brief's code list for S87.31 and S87.32 is empty and the statuses are 'missing', consistent with the code read.
- Plan limits per item (which plans get which control) were not fully established; only the enterprise tier checks I saw are listed.
- This pass was read-only: no builds, tests, installs or servers were run, and the localhost testing rule was not applied because no testing was done.
