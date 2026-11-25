---
id: "F087-08"
type: "feature"
title: "Sharing, publishing and memory"
aliases: ["Sharing console", "Public sharing", "External sharing", "Public publishing", "Workspace memory policy", "Allow memory", "S87.19", "S87.20", "S87.21", "S87.22"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.19", "S87.20", "S87.21", "S87.22"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:team", "plan:team_premium", "plan:enterprise", "table:organization_admin_policies", "table:organization_shared_projects", "api:POST /api/share", "api:POST /api/artifacts/publish", "api:DELETE /api/settings/organization/shared/projects/[projectId]", "file:apps/web/lib/managed-compute-gate.ts", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-authorization-and-workspaces"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-08 Sharing, publishing and memory

Admins see what the workspace shares (projects, conversations, artifacts, connectors), set per-member project access or stop sharing, and use one Policy switch, 'Public sharing', that blocks new public share links and artifact publishing. A second switch, 'Memory', turns account memory off for every member. Web and the hosted desktop screens only.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.19](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8719), [S87.20](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8720), [S87.21](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8721), [S87.22](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8722).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows shared items and who can open them, lets owners, admins and project owners change per-member access or stop sharing, and lets admins switch public sharing and workspace memory on or off (OrganizationSharingSection.tsx:195-555, WorkspacePolicySection.tsx:457,474).

**Why it exists.** Companies need control over what leaves the workspace and over what the assistant remembers about members.

**Who uses it.** Admins and sharing managers (permission sharing.manage) and project owners (content.share) for projects; owners and admins with policy rights for the switches (org-sharing-service.ts:91-110).

**Problems it solves**

- Staff publishing company chats or artifacts to anonymous public links.
- Not knowing who can open a shared project.
- Account memory keeping workspace content the company does not want kept.

**Use cases**

- Admin turns Public sharing off before an audit; members get a refusal on new links.
- Admin removes one member's access to a shared project.
- Admin selects 'Stop sharing' on a project so everyone loses it.
- Admin leaves Memory off for a regulated workspace.

## 2. User experience

**Where to find it**

- Web: Workspace console > Controls > 'Sharing' (/workspace/sharing) and 'Policy' (/workspace/policy) (WorkspaceConsoleNav.tsx:78,114).
- Desktop: [inferred] the same hosted screens (doc: AGENTS.md section 5).
- Members see a refusal in chat or the share dialog when they try to publish.
- Mobile, CLI, VS Code, Chrome: none found for the console.

**Before you start**

- Active workspace member; console pages need plan team, team_premium or enterprise (team-admin-access.ts, billing-catalog.ts:362).
- Policy changes need owner or admin.

**Screens and controls**

- Sharing page: sections 'Shared projects', 'Shared artifacts', 'Shared conversations', 'Shared connectors' (OrganizationSharingSection.tsx:195,339,440,555); empty text 'Nothing is shared yet.' (247); button 'Stop sharing' with a confirmation naming the consequence (303-310); audience control and per-member access list per project.
- Policy page: rows 'Public sharing' (toggle 'Allow public sharing') and 'Memory' (toggle 'Allow memory') (WorkspacePolicySection.tsx:457-488).

**Journey**

1. Open Workspace > Sharing and review each project's 'Visible to N of M members'.
2. Change a member's access or choose 'Stop sharing' and confirm.
3. Open Workspace > Policy; switch 'Public sharing' or 'Memory'; save.
4. A member who then tries to publish a chat or artifact receives a 403 with the reason.

**What the person sees and gets**

- Public sharing off text: 'Off. No new public links. Existing links stay up until revoked.' (WorkspacePolicySection.tsx:461).
- Refusal reason: 'Your workspace administrator has turned off public sharing. Links already created are unaffected.' (organization-policy-evaluator.ts:386).
- Memory off text: 'Off for every member, whatever their personal setting.' (WorkspacePolicySection.tsx:478).
- Audit rows project_shared, project_unshared, project_member_access_changed (shared/projects/[projectId]/route.ts:67-215).

**Settings**

- Personal memory setting still applies when workspace memory is on (WorkspacePolicySection.tsx:476).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- One external-sharing gate covers share links, artifact publishing, published-artifact edits, schedule shares and plugin submissions (managed-compute-gate.ts:466; callers: share/route.ts:578, published-artifact-publication-policy.ts:67, schedules/[id]/share/route.ts:45, plugins/submissions/route.ts:54).
- Gate also checks the workspaces that stored the content, so choosing 'personal' does not skip it (managed-compute-gate.ts:437-460).
- Fails closed with 503 when the policy cannot be read (managed-compute-gate.ts:466-490).
- Only new publication is refused; existing links stay reachable (managed-compute-gate.ts doc comment above 466; evaluator.ts:386).
- Memory: no policy row or unreadable row means memory is closed; workspace allow flag false returns the disabled memory policy (managed-memory-context-service.ts:92,115-160,250).
- Project sharing: share, set per-member access (read, write, none, inherit), and stop sharing; stop deletes the shared row so access ends on the server (shared/projects/[projectId]/route.ts:53,103,179; org-sharing-service.ts:382).
- Rights: sharing.manage, or content.share on an owned project (org-sharing-service.ts:91-110).

**Incomplete**

- Per-member access on the page is shown as Can edit or view; member roles that can only view cannot be given edit (OrganizationSharingSection.test.tsx:215).
- Publishing and share links are one switch, so there is no way to allow one and block the other.

**Present but disconnected or switched off**

- Default memory for a workspace without a policy row is off (0164 migration allow_memory default false, 0164_memory_policy_and_context_compaction.sql:27); admins must opt in.

**Not available**

- CLI: none found for sharing console, publishing gate or workspace memory policy.
- Mobile, VS Code, Chrome: no console.
- Revoking existing public links in bulk when the switch is turned off: not found.

## 4. Required behaviour

**Established requirements**

- An admin sees every project shared with the workspace, sets per-member access and can stop sharing. (source: brief S87.19 Should)
- Members cannot create new external share links while sharing outside the workspace is off. (source: brief S87.20 Should)
- Publishing chats or artifacts publicly is refused when the control is off. (source: brief S87.21 Should)
- Members get no memory while workspace memory is off. (source: brief S87.22 Should)
- Existing links stay up when sharing is turned off; the copy says so. (source: organization-policy-evaluator.ts:386, WorkspacePolicySection.tsx:461)

**Acceptance criteria**

1. With Public sharing off, POST /api/share for a public link returns 403 with code external_sharing_disabled.
2. With Public sharing off, POST /api/artifacts/publish returns 403 and nothing is stored.
3. A link created before the switch still opens after it.
4. With Memory off, a member's chat turn receives no memory context even if their personal memory is on.
5. With no policy row, memory is off for workspace members.
6. 'Stop sharing' on a project removes it from the shared list and members lose access; an audit row project_unshared exists.
7. A plain member cannot change per-member access on a project they do not own.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Separate controls for share links and artifact publishing may be wanted by admins because the brief lists two items, but the code has one switch [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer an optional 'revoke existing public links' action with a confirmation naming the consequence.
- [proposed] Show on the Policy page that the switch also covers schedule shares and plugin submissions.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Sharing page | `apps/web/app/workspace/sharing/page.tsx` | Console page titled Sharing |
| component | OrganizationSharingSection | `apps/web/features/settings/sections/OrganizationSharingSection.tsx` | Shared projects, artifacts, conversations, connectors |
| component | WorkspacePolicySection | `apps/web/features/settings/sections/WorkspacePolicySection.tsx` | Public sharing and Memory switches |
| screen | Policy page | `apps/web/app/workspace/policy/page.tsx` | Console page titled Policy |
| endpoint | /api/settings/organization/shared | `apps/web/app/api/settings/organization/shared/route.ts` | Overview of shared items |
| endpoint | PUT/PATCH/DELETE /api/settings/organization/shared/projects/[projectId] | `apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts` | Share, member access, unshare |
| service | org-sharing-service | `apps/web/lib/services/org-sharing-service.ts` | shareProject, unshareProject, setProjectMemberAccess, rights |
| service | buildExternalSharingGateResponse | `apps/web/lib/managed-compute-gate.ts` | Refuses new public publication |
| service | organization-policy-evaluator | `apps/web/lib/services/organization-policy-evaluator.ts` | external_sharing decision and reason text |
| endpoint | POST /api/share | `apps/web/app/api/share/route.ts` | Creates share links behind the gate |
| endpoint | POST /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publishes artifacts behind the gate |
| service | published-artifact-publication-policy | `apps/web/lib/services/published-artifact-publication-policy.ts` | Runs the gate, moderation and secret check before publish |
| service | managed-memory-context-service | `apps/web/lib/services/managed-memory-context-service.ts` | Workspace memory policy read and closed default |
| table | organization_admin_policies | `apps/web/db/neon/0140_external_sharing_policy.sql` | external_sharing_enabled (default true) and allow_memory (default false) |
| table | organization_shared_projects | `apps/web/lib/services/org-sharing-service.ts` | Rows removed by unshare |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin flips a switch on Policy and saves; policy row is written with audit. | device and our servers | WorkspacePolicySection.tsx:457; organization/policy/route.ts:262-277 |
| Member requests a share link or artifact publish; server resolves active and stored workspaces and evaluates external_sharing. | our servers | managed-compute-gate.ts:437-460 |
| If off, 403 with code external_sharing_disabled and the reason; if the policy is unreadable, 503. | our servers | managed-compute-gate.ts:480-490 |
| Chat turn loads memory policy; an organization without allow_memory gets the disabled policy and no memory is read. | our servers | managed-memory-context-service.ts:240-252 |
| Admin chooses Stop sharing; server deletes the shared-project row and records an audit event. | our servers | shared/projects/[projectId]/route.ts:179-215, org-sharing-service.ts:382 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Switch values external_sharing_enabled and allow_memory | table organization_admin_policies | Read per request | Replaced on save |
| Shared project rows and per-member grants | organization_shared_projects and member-access rows | Server only | Stop sharing deletes the share; the project is kept |
| Audit rows | enterprise audit trail | Server only | Append-only per audit page text (audit/page.tsx:18) |

**Models and providers.** No model takes part in the sharing decision. Memory policy decides whether memory text is added to the prompt for Cloud turns; the provider receiving the prompt is unaffected otherwise.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in workspace member. |
| Permissions | Sharing: sharing.manage or content.share on owned project (org-sharing-service.ts:91-110). Switches: owner or admin via the policy route. |
| Subscription | Console needs plan:team, plan:team_premium or plan:enterprise (billing-catalog.ts:362). Workspace sharing option withheld if the plan does not include it (share/route.test.ts:715). |
| Limits and metering | Rate limits 'settings-org-patch' on writes (shared/projects/[projectId]/route.ts:55). Published artifact quota error mapped to conflict (artifacts/publish/route.ts:88). No credits. |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Public share links and publishing need our servers, so they do not exist in Local mode. Memory policy applies only to Cloud turns that call the memory service; a Local device memory path was not read (unknown). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Personal account | Page tells the user how to get an organization instead of an error. | OrganizationSharingSection.test.tsx:171 |
| Empty | 'Nothing is shared yet.' | OrganizationSharingSection.tsx:247 |
| Loading | 'Loading organization sharing…' | OrganizationSharingSection.tsx:668 |
| Policy unreadable on publish | 503 workspace_policy_unavailable. | managed-compute-gate.ts:480 |
| Policy unreadable for memory | Memory closed and logged once. | managed-memory-context-service.ts:155; managed-memory-context-service.test.ts:240 |
| Project not shared on unshare | 404 'That project is not shared with your organization'. | shared/projects/[projectId]/route.ts:200 |
| Offline, retry, timeout | not handled in the code beyond standard fetch errors. | OrganizationSharingSection.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/share/route.test.ts`: Share creation incl. secret policy and workspace sharing plan option; 403 cases near line 1418
- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish returns 403 when the sharing gate answers external_sharing_disabled (line 192)
- `apps/web/lib/services/published-artifact-publication-policy.restore.test.ts`: Gate is called with the stored workspaces and its refusal is returned
- `apps/web/lib/services/__tests__/organization-policy-evaluator.test.ts`: external_sharing decision (lines 358-397)
- `apps/web/lib/services/__tests__/managed-memory-context-service.test.ts`: Disabled for organization without policy, closed on read error
- `apps/web/features/settings/sections/WorkspacePolicySection.test.tsx`: Turning workspace memory on and saving (line 150)
- `apps/web/features/settings/sections/OrganizationSharingSection.test.tsx`: Sharing list, editor counts, view-only members
- `apps/web/app/api/settings/organization/shared/__tests__/route.test.ts`: Shared overview, member read, roster privacy
- `apps/web/app/api/settings/organization/shared/projects/[projectId]/__tests__/route.audit.test.ts`: Audit rows for share and member grants

**Test scenarios**

- **Block new links, keep old**
  1. Create a public link as a member.
  2. Admin turns Public sharing off.
  3. Member creates another link.
  4. Open the first link.
  - Expected: Second creation 403 external_sharing_disabled; first link still opens.
- **Artifact publishing refused**
  1. Turn Public sharing off.
  2. Publish an artifact.
  - Expected: 403 and no published artifact row.
- **Memory off**
  1. Leave Memory off, personal memory on.
  2. Ask a question that memory would answer.
  - Expected: No memory context used.
- **Stop sharing**
  1. Share a project to the workspace.
  2. Admin selects Stop sharing and confirms.
  3. Member opens the project.
  - Expected: Project absent for the member; project_unshared audit row.
- **Policy unreadable**
  1. Force the policy read to fail.
  2. Create a share link.
  - Expected: 503 not an allow.

**Where to look when it fails**

- Log '[external-sharing] refused by workspace policy' and '[external-sharing] workspace policy unavailable; request denied'.
- Log '[managed-memory] organization policy read failed; memory disabled for this organization'.
- Audit eventTypes project_shared, project_unshared, share_link_updated.
- Column organization_admin_policies.external_sharing_enabled.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **One switch covers share links and publishing; brief lists them as two controls** Affects: Admins on web and desktop. Evidence: WorkspacePolicySection.tsx:457; evaluator.ts:382. Work needed: Decide whether to split or rewrite the requirement
- **No way to revoke existing public links from the console when sharing is turned off** Affects: Admins. Evidence: evaluator.ts:386 'Links already created are unaffected'. Work needed: Add an explicit revoke-all action if wanted
- **CLI has no equivalent** Affects: CLI users. Evidence: No CLI file for share/memory policy. Work needed: Decide whether the CLI exposes sharing at all
- **Memory policy behaviour on Local device memory unknown** Affects: Desktop and mobile Local users. Evidence: Only server memory service read. Work needed: Read local memory code and confirm
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:team
- plan:team_premium
- plan:enterprise
- table:organization_admin_policies
- table:organization_shared_projects
- api:POST /api/share
- api:POST /api/artifacts/publish
- api:DELETE /api/settings/organization/shared/projects/[projectId]
- file:apps/web/lib/managed-compute-gate.ts
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-authorization-and-workspaces

## Unknown

- Whether revoked or expired public links are cleaned when a workspace is deleted.
- Local-mode memory behaviour on desktop and mobile under a workspace policy.
- Whether existing external links created under the workspace appear anywhere in the Sharing page; the page lists projects, artifacts, conversations, connectors, not public links.
- Exact desktop route loading.
